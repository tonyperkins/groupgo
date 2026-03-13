import asyncio
import json
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.db import engine
from app.models import FetchJob, Venue, Event, PollEvent
from app.services.showtime_service import (
    fetch_showtimes_from_serpapi,
    parse_serpapi_showtimes,
    get_or_create_sessions,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_db_session() -> Session:
    return Session(engine)


async def run_fetch_job(
    job_id: str,
    poll_id: int,
    theater_ids: list[int],
    dates: list[str],
) -> None:
    """
    Background asyncio task. Fetches showtimes for all theater × date combos,
    updates FetchJob progress in SQLite, and stores sessions.
    """
    with _get_db_session() as db:
        job = db.get(FetchJob, job_id)
        if not job:
            return

    poll_events = []
    with _get_db_session() as db:
        links = db.exec(
            select(PollEvent).where(PollEvent.poll_id == poll_id)
        ).all()
        for link in links:
            ev = db.get(Event, link.event_id)
            if ev:
                poll_events.append(ev)

    # One task per (movie, theater, date) so each movie gets its own API call
    tasks = [
        (ev, tid, date)
        for ev in poll_events
        for tid in theater_ids
        for date in dates
    ]
    total = len(tasks)

    with _get_db_session() as db:
        job = db.get(FetchJob, job_id)
        if job:
            job.total_tasks = total
            db.add(job)
            db.commit()

    async def fetch_one(event: Event, theater_id: int, date: str) -> tuple[bool, str]:
        with _get_db_session() as db:
            theater = db.get(Venue, theater_id)
            if not theater:
                return False, f"Theater {theater_id} not found"
            theater_name = theater.name
            serpapi_query = theater.serpapi_query

        query = f"{event.title} {serpapi_query}"
        try:
            raw = await fetch_showtimes_from_serpapi(query, date)
        except Exception as exc:
            err = str(exc)
            if "429" in err:
                err = "SerpApi returned 429 — account not yet activated. Visit serpapi.com/users/welcome to complete activation."
            return False, err

        parsed = parse_serpapi_showtimes(
            raw=raw,
            movie_title=event.title,
            theater_id=theater_id,
            event_id=event.id,
            poll_id=poll_id,
            target_date=date,
            theater_name=theater_name,
        )

        if parsed:
            with _get_db_session() as db:
                get_or_create_sessions(parsed, db)

        return True, ""

    completed = 0
    failed = 0

    for ev, theater_id, date in tasks:
        ok, _ = await fetch_one(ev, theater_id, date)
        if ok:
            completed += 1
        else:
            failed += 1

        with _get_db_session() as db:
            job = db.get(FetchJob, job_id)
            if job:
                job.completed_tasks = completed
                job.failed_tasks = failed
                if not ok and _:
                    job.last_error = _
                db.add(job)
                db.commit()

        await asyncio.sleep(0.5)

    final_status = "complete" if failed == 0 else ("failed" if completed == 0 else "complete")
    with _get_db_session() as db:
        job = db.get(FetchJob, job_id)
        if job:
            job.status = final_status
            job.finished_at = _now()
            db.add(job)
            db.commit()


def create_fetch_job(poll_id: int, theater_ids: list[int], dates: list[str], db: Session) -> str:
    import uuid
    job_id = str(uuid.uuid4())
    job = FetchJob(
        id=job_id,
        poll_id=poll_id,
        total_tasks=len(theater_ids) * len(dates),
    )
    db.add(job)
    db.commit()
    return job_id
