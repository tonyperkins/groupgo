import json
from typing import Optional
from sqlmodel import Session, select
import httpx

from app.config import settings
from app.models import Event, Poll, PollEvent


async def search_tmdb(query: str) -> list[dict]:
    url = f"{settings.tmdb_base_url}/search/movie"
    params = {
        "api_key": settings.TMDB_API_KEY,
        "query": query,
        "include_adult": "false",
        "language": "en-US",
        "page": 1,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    results = []
    for item in data.get("results", [])[:10]:
        year = None
        release = item.get("release_date", "")
        if release and len(release) >= 4:
            try:
                year = int(release[:4])
            except ValueError:
                pass
        results.append({
            "tmdb_id": item["id"],
            "title": item.get("title", ""),
            "year": year,
            "synopsis": item.get("overview", ""),
            "poster_path": item.get("poster_path"),
            "tmdb_rating": round(item.get("vote_average", 0), 1),
        })
    return results


async def fetch_tmdb_details(tmdb_id: int) -> dict:
    url = f"{settings.tmdb_base_url}/movie/{tmdb_id}"
    params = {
        "api_key": settings.TMDB_API_KEY,
        "append_to_response": "videos",
        "language": "en-US",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        data = resp.json()

    trailer_key: Optional[str] = None
    videos = data.get("videos", {}).get("results", [])
    for v in videos:
        if v.get("site") == "YouTube" and v.get("type") == "Trailer" and v.get("official"):
            trailer_key = v["key"]
            break
    if not trailer_key:
        for v in videos:
            if v.get("site") == "YouTube" and v.get("type") == "Trailer":
                trailer_key = v["key"]
                break

    year = None
    release = data.get("release_date", "")
    if release and len(release) >= 4:
        try:
            year = int(release[:4])
        except ValueError:
            pass

    genres = [g["name"] for g in data.get("genres", [])]

    return {
        "tmdb_id": data["id"],
        "title": data.get("title", ""),
        "year": year,
        "synopsis": data.get("overview", ""),
        "poster_path": data.get("poster_path"),
        "trailer_key": trailer_key,
        "tmdb_rating": round(data.get("vote_average", 0), 1),
        "runtime_mins": data.get("runtime"),
        "genres": json.dumps(genres),
    }


def add_movie_to_poll(poll_id: int, tmdb_data: dict, db: Session) -> Event:
    tmdb_id = tmdb_data["tmdb_id"]

    existing_event = db.exec(
        select(Event).where(Event.tmdb_id == tmdb_id)
    ).first()

    if existing_event:
        event = existing_event
    else:
        event = Event(**tmdb_data)
        db.add(event)
        db.flush()

    already_linked = db.exec(
        select(PollEvent).where(
            PollEvent.poll_id == poll_id,
            PollEvent.event_id == event.id,
        )
    ).first()

    if already_linked:
        raise ValueError("Movie already in this poll")

    current_count = len(
        db.exec(select(PollEvent).where(PollEvent.poll_id == poll_id)).all()
    )
    link = PollEvent(poll_id=poll_id, event_id=event.id, sort_order=current_count)
    db.add(link)
    db.commit()
    db.refresh(event)
    return event


def remove_movie_from_poll(poll_id: int, event_id: int, db: Session) -> None:
    poll = db.get(Poll, poll_id)
    if not poll:
        raise ValueError("Poll not found")
    if poll.status not in ("DRAFT", "OPEN"):
        raise PermissionError("Can only remove movies from DRAFT or OPEN polls")

    link = db.exec(
        select(PollEvent).where(
            PollEvent.poll_id == poll_id,
            PollEvent.event_id == event_id,
        )
    ).first()
    if not link:
        raise ValueError("Movie not in this poll")

    db.delete(link)
    db.commit()


def get_poll_events(poll_id: int, db: Session) -> list[Event]:
    links = db.exec(
        select(PollEvent)
        .where(PollEvent.poll_id == poll_id)
        .order_by(PollEvent.sort_order)
    ).all()
    events = []
    for link in links:
        event = db.get(Event, link.event_id)
        if event:
            events.append(event)
    return events


def poster_url(poster_path: Optional[str], size: str = "w342") -> Optional[str]:
    if not poster_path:
        return None
    return f"{settings.tmdb_image_base}/{size}{poster_path}"


# Simple in-process cache: {tmdb_id: (fetched_at_epoch, reviews_list)}
_reviews_cache: dict[int, tuple[float, list[dict]]] = {}
_REVIEWS_TTL_SECONDS = 3600  # 1 hour


async def fetch_tmdb_reviews(tmdb_id: int, max_reviews: int = 3) -> list[dict]:
    """Fetch up to max_reviews user reviews for a TMDB movie. Results are cached for 1 hour."""
    import time
    cached = _reviews_cache.get(tmdb_id)
    if cached:
        fetched_at, reviews = cached
        if time.time() - fetched_at < _REVIEWS_TTL_SECONDS:
            return reviews

    url = f"{settings.tmdb_base_url}/movie/{tmdb_id}/reviews"
    params = {"api_key": settings.TMDB_API_KEY, "language": "en-US", "page": 1}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except Exception:
        return []

    reviews = []
    for r in data.get("results", [])[:max_reviews]:
        content = r.get("content", "")
        excerpt = content[:280].rstrip()
        if len(content) > 280:
            excerpt += "…"
        reviews.append({
            "author": r.get("author", "Anonymous"),
            "rating": r.get("author_details", {}).get("rating"),
            "excerpt": excerpt,
        })

    _reviews_cache[tmdb_id] = (time.time(), reviews)
    return reviews
