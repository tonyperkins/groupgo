from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select, text
from pydantic import BaseModel

from app.db import get_db
from app.models import Poll, PollDate, Event, Showtime, Venue
from app.services import movie_service, showtime_service, theater_service
from app.middleware.auth import verify_admin

router = APIRouter(prefix="/api/spa", tags=["admin_spa"])


def _serialize_event(e: Event) -> dict:
    return {
        "id": e.id,
        "tmdb_id": e.tmdb_id,
        "title": e.title,
        "year": e.year,
        "synopsis": e.synopsis,
        "poster_path": movie_service.poster_url(e.poster_path) if e.poster_path else None,
        "image_url": e.image_url,
        "rating": e.rating,
        "is_custom_event": e.is_custom_event,
        "event_type": e.event_type,
        "runtime_mins": e.runtime_mins,
    }


def _serialize_session(s: Showtime) -> dict:
    return {
        "id": s.id,
        "event_id": s.event_id,
        "theater_id": s.theater_id,
        "session_date": s.session_date,
        "session_time": s.session_time,
        "format": s.format,
        "is_custom": s.is_custom,
    }


@router.get("/polls/{poll_id}")
async def get_poll_state(
    request: Request,
    poll_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    events = movie_service.get_poll_events(poll_id, db)
    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    target_dates = [pd.date for pd in db.exec(select(PollDate).where(PollDate.poll_id == poll_id)).all()]
    theaters = theater_service.get_active_theaters(db)

    return {
        "poll": {
            "id": poll.id,
            "title": poll.title,
            "status": poll.status,
            "access_uuid": poll.access_uuid,
            "target_dates": target_dates,
            "is_single_vote": poll.is_single_vote,
        },
        "events": [_serialize_event(e) for e in events],
        "sessions": [_serialize_session(s) for s in sessions],
        "theaters": [{"id": t.id, "name": t.name, "address": t.address} for t in theaters],
    }


@router.get("/movies/search")
async def search_movies(
    request: Request,
    q: str,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    if not q.strip():
        return {"results": []}

    try:
        results = await movie_service.search_tmdb(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TMDB error: {exc}")

    # Map tmdb proxy to dict
    out = []
    for r in results:
        out.append({
            "tmdb_id": r.get("tmdb_id"),
            "title": r.get("title"),
            "year": str(r.get("year")) if r.get("year") else None,
            "poster_path": movie_service.poster_url(r.get("poster_path")) if r.get("poster_path") else None,
            "rating": r.get("tmdb_rating"),
            "synopsis": r.get("synopsis"),
        })

    return {"results": out}


class AddTMDBRequest(BaseModel):
    tmdb_id: int


@router.post("/polls/{poll_id}/events/tmdb")
async def add_tmdb_event(
    request: Request,
    poll_id: int,
    body: AddTMDBRequest,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    try:
        tmdb_data = await movie_service.fetch_tmdb_details(body.tmdb_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TMDB error: {exc}")

    try:
        movie_service.add_movie_to_poll(poll_id, tmdb_data, db)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return {"status": "ok"}


class UpdatePollTitleRequest(BaseModel):
    title: str


@router.patch("/polls/{poll_id}/title")
async def update_poll_title(
    request: Request,
    poll_id: int,
    body: UpdatePollTitleRequest,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    poll.title = body.title
    db.add(poll)
    db.commit()
    return {"status": "ok", "title": poll.title}


class UpdatePollSingleVoteRequest(BaseModel):
    is_single_vote: bool


@router.patch("/polls/{poll_id}/is_single_vote")
async def update_poll_single_vote(
    request: Request,
    poll_id: int,
    body: UpdatePollSingleVoteRequest,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    poll.is_single_vote = body.is_single_vote
    db.add(poll)
    db.commit()
    return {"status": "ok", "is_single_vote": poll.is_single_vote}


class AddCustomEventRequest(BaseModel):
    title: str
    event_type: str = "other"  # "restaurant" | "bar" | "concert" | "other"
    venue_name: Optional[str] = None
    description: Optional[str] = None


@router.post("/polls/{poll_id}/events/custom")
async def add_custom_event(
    request: Request,
    poll_id: int,
    body: AddCustomEventRequest,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    new_event = Event(
        title=body.title,
        event_type=body.event_type,
        venue_name=body.venue_name,
        synopsis=body.description,
        is_custom_event=True,
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)

    from app.models import PollEvent
    db.add(PollEvent(poll_id=poll_id, event_id=new_event.id))
    db.commit()

    return {"status": "ok", "event_id": new_event.id}


@router.delete("/polls/{poll_id}/events/{event_id}")

async def remove_event(
    request: Request,
    poll_id: int,
    event_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    try:
        movie_service.remove_movie_from_poll(poll_id, event_id, db)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {"status": "ok"}


class AddManualSessionRequest(BaseModel):
    event_id: int
    theater_id: Optional[int] = None
    session_date: str
    session_time: str
    format: str = "Standard"


@router.post("/polls/{poll_id}/sessions")
async def add_manual_session(
    request: Request,
    poll_id: int,
    body: AddManualSessionRequest,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    try:
        showtime_service.add_manual_session(
            poll_id, body.event_id, body.theater_id, body.session_date, body.session_time, body.format, db
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    return {"status": "ok"}


@router.delete("/sessions/{session_id}")
async def remove_session(
    request: Request,
    session_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    try:
        showtime_service.delete_session(session_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    return {"status": "ok"}


@router.post("/polls/{poll_id}/publish")
async def publish_poll(
    request: Request,
    poll_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    
    poll.status = "OPEN"
    db.add(poll)
    db.commit()
    return {"status": "ok", "access_uuid": poll.access_uuid}


@router.delete("/polls/{poll_id}")
async def delete_poll(
    request: Request,
    poll_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    # Manually delete dependencies
    from app.models import PollDate, PollEvent, Showtime
    db.exec(text(f"DELETE FROM poll_dates WHERE poll_id = {poll_id}")) # type: ignore
    db.exec(text(f"DELETE FROM poll_events WHERE poll_id = {poll_id}")) # type: ignore
    db.exec(text(f"DELETE FROM showtimes WHERE poll_id = {poll_id}")) # type: ignore
    
    # Finally delete the poll
    db.delete(poll)
    db.commit()
    return {"status": "ok"}


@router.get("/theaters/search")
async def search_theaters(
    request: Request,
    q: str,
    db: Session = Depends(get_db),
):
    """
    Replaces SerpApi with OpenStreetMap Nominatim for free, reliable, address-level theater lookups.
    """
    verify_admin(request, db)
    if not q.strip():
        return {"results": []}

    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": f"movie theater {q}",
                    "format": "json",
                    "addressdetails": 1,
                    "limit": 5,
                },
                headers={"User-Agent": "GroupGo/1.0"}
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Location search error: {exc}")

    results = []
    for item in data:
        name = item.get("name") or (item.get("address", {}).get("cinema")) or item.get("display_name", "").split(",")[0]
        results.append({
            "name": name,
            "address": item.get("display_name"),
            "lat": item.get("lat"),
            "lon": item.get("lon")
        })

    return {"results": results}


class AddTheaterRequest(BaseModel):
    name: str
    address: Optional[str] = None


@router.post("/theaters")
async def add_theater(
    request: Request,
    body: AddTheaterRequest,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    
    # We pass a dummy serpapi_query just to satisfy the old model constraint until Phase 2
    dummy_query = f"{body.name} showtimes"
    t = theater_service.add_theater(
        body.name, body.address, None, dummy_query, db, showtime_url_pattern=None
    )
    return {"id": t.id, "name": t.name, "address": t.address}

