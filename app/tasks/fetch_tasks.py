import asyncio
import logging
from datetime import datetime, timezone

from sqlmodel import Session, select

from app.db import engine
from app.models import FetchJob, Venue, Event, PollEvent
from app.services.showtime_service import (
    fetch_showtimes_from_serpapi,
    parse_serpapi_showtimes,
    get_or_create_sessions,
)

logger = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_db_session() -> Session:
    return Session(engine)


async def run_fetch_job(
    job_id: str,
    poll_id: int,
    theater_ids: list[int],
    dates: list[str],
    event_ids: list[int] | None = None,
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
            if event_ids is not None and link.event_id not in event_ids:
                continue
            ev = db.get(Event, link.event_id)
            if ev:
                poll_events.append(ev)

    if not poll_events:
        logger.warning("[fetch_job %s] No events found for poll_id=%s event_ids=%s — aborting", job_id, poll_id, event_ids)
        with _get_db_session() as db:
            job = db.get(FetchJob, job_id)
            if job:
                job.status = "failed"
                job.last_error = "No events matched the selection"
                job.finished_at = _now()
                db.add(job)
                db.commit()
        return

    movie_events = [ev for ev in poll_events if ev.is_movie()]
    if not movie_events:
        logger.info("[fetch_job %s] No movie events in poll — skipping SerpApi fetch, marking complete", job_id)
        with _get_db_session() as db:
            job = db.get(FetchJob, job_id)
            if job:
                job.status = "complete"
                job.total_tasks = 0
                job.completed_tasks = 0
                job.finished_at = _now()
                db.add(job)
                db.commit()
        return

    poll_events = movie_events
    logger.info("[fetch_job %s] Fetching %d movies × %d theaters × %d dates", job_id, len(poll_events), len(theater_ids), len(dates))

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

        query = f"{event.title} {theater_name} showtimes"
        logger.info("[fetch_job %s] Query: %r date=%s", job_id, query, date)
        try:
            raw = await fetch_showtimes_from_serpapi(query, date)
        except Exception as exc:
            err = str(exc)
            if "429" in err:
                err = "SerpApi returned 429 — account not yet activated. Visit serpapi.com/users/welcome to complete activation."
            logger.error("[fetch_job %s] FAILED query=%r: %s", job_id, query, err)
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

        logger.info("[fetch_job %s] Parsed %d sessions for %r @ %s on %s", job_id, len(parsed), event.title, theater_name, date)

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


def create_fetch_job(poll_id: int, theater_ids: list[int], dates: list[str], db: Session, event_ids: list[int] | None = None) -> str:
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
