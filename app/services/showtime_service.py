import json
import logging
import re
from datetime import datetime, timezone
from sqlmodel import Session, select
import httpx

from app.config import settings
from app.models import Showtime, Venue, Event, Poll, PollEvent

logger = logging.getLogger(__name__)


FORMAT_KEYWORDS = {
    "IMAX": ["imax"],
    "3D": ["3d"],
    "Dolby": ["dolby", "dolby cinema", "dolby atmos"],
    "Laser": ["laser"],
    "D-BOX": ["d-box", "dbox"],
    "4DX": ["4dx"],
}


BOOKING_URL_KEYS = (
    "link",
    "url",
    "booking_link",
    "booking_url",
    "ticket_url",
    "tickets",
)


def extract_format(raw: str) -> str:
    lower = raw.lower()
    for fmt, keywords in FORMAT_KEYWORDS.items():
        for kw in keywords:
            if kw in lower:
                return fmt
    return "Standard"


def normalize_time(raw: str) -> str:
    """Convert '7:30pm', '7:30 PM', '19:30' → '19:30'."""
    raw = raw.strip().lower().replace(" ", "")
    match = re.match(r"(\d{1,2}):(\d{2})(am|pm)?", raw)
    if not match:
        return raw
    hour, minute, meridiem = int(match.group(1)), match.group(2), match.group(3)
    if meridiem == "pm" and hour != 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    return f"{hour:02d}:{minute}"


def extract_booking_url(showing: dict) -> str | None:
    for key in BOOKING_URL_KEYS:
        value = showing.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


_DAY_ABBREVS = {
    "jan": "01", "feb": "02", "mar": "03", "apr": "04",
    "may": "05", "jun": "06", "jul": "07", "aug": "08",
    "sep": "09", "oct": "10", "nov": "11", "dec": "12",
}


def _parse_day_string(day_str: str, target_date: str) -> str:
    """
    Convert SerpApi 'day' strings like 'SatMar 21' or 'Thu Mar 19' to 'YYYY-MM-DD'.
    Falls back to target_date on parse failure.
    """
    try:
        # Strip weekday prefix (3 chars) then parse "Mon DD" / "MonDD"
        # Examples: "SatMar 21", "ThuMar 19", "Fri Mar 20"
        clean = re.sub(r"^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)", "", day_str, flags=re.IGNORECASE).strip()
        # clean is now like "Mar 21" or "Mar21"
        match = re.match(r"([A-Za-z]+)\s*(\d+)", clean)
        if not match:
            return target_date
        month_abbr = match.group(1)[:3].lower()
        day_num = int(match.group(2))
        month_num = _DAY_ABBREVS.get(month_abbr)
        if not month_num:
            return target_date
        # Infer year from target_date
        year = target_date[:4]
        return f"{year}-{month_num}-{day_num:02d}"
    except Exception:
        return target_date


def parse_serpapi_showtimes(
    raw: dict,
    movie_title: str,
    theater_id: int,
    event_id: int,
    poll_id: int,
    target_date: str,
    theater_name: str = "",
) -> list[dict]:
    """
    Parse SerpApi Google showtimes response into normalized session dicts.

    Real SerpApi structure (when searching for a specific movie+theater):
      showtimes[].day          — e.g. "SatMar 21"
      showtimes[].theaters[]
        .name                  — theater name
        .showing[]
          .time[]              — list of time strings like "2:30pm"
          .type                — format string like "Standard", "IMAX", "DBOX"
    """
    results: list[dict] = []
    now_ts = datetime.now(timezone.utc).isoformat()

    showtimes_list = raw.get("showtimes", [])
    if not showtimes_list:
        logger.info("parse_serpapi: no 'showtimes' key in response. Top-level keys: %s", list(raw.keys()))
        return results

    logger.info("parse_serpapi: target_date=%s, day blocks: %s", target_date, [b.get('day') for b in showtimes_list])

    for day_block in showtimes_list:
        day_str = day_block.get("day", "")
        block_date = _parse_day_string(day_str, target_date)

        # Only include days that match the target date
        if block_date != target_date:
            logger.info("parse_serpapi: skipping day block %r (parsed=%r, target=%r)", day_str, block_date, target_date)
            continue

        for theater_block in day_block.get("theaters", []):
            # Match theater by name if we have one to compare against
            if theater_name:
                block_theater_name = theater_block.get("name", "").lower()
                if theater_name.lower() not in block_theater_name and block_theater_name not in theater_name.lower():
                    continue

            theater_booking_url = None
            for key in BOOKING_URL_KEYS:
                value = theater_block.get(key)
                if isinstance(value, str) and value.strip():
                    theater_booking_url = value.strip()
                    break

            for showing in theater_block.get("showing", []):
                raw_type = showing.get("type", "Standard")
                fmt = extract_format(raw_type)
                booking_url = extract_booking_url(showing) or theater_booking_url
                times = showing.get("time", [])
                if isinstance(times, str):
                    times = [times]
                for t in times:
                    norm = normalize_time(t)
                    results.append({
                        "event_id": event_id,
                        "theater_id": theater_id,
                        "poll_id": poll_id,
                        "session_date": block_date,
                        "session_time": norm,
                        "format": fmt,
                        "booking_url": booking_url,
                        "fetch_timestamp": now_ts,
                        "fetch_status": "success",
                        "raw_serpapi": json.dumps({
                            "day": day_str,
                            "theater": theater_block.get("name"),
                            "showing": showing,
                        }),
                    })

    return results


async def fetch_showtimes_from_serpapi(query: str, date: str) -> dict:
    params = {
        "engine": "google",
        "q": query,
        "api_key": settings.SERPAPI_KEY,
        "hl": "en",
        "gl": "us",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.get(settings.serpapi_base_url, params=params)
        resp.raise_for_status()
        return resp.json()


def get_or_create_sessions(sessions_data: list[dict], db: Session) -> list[Showtime]:
    saved: list[Showtime] = []
    for data in sessions_data:
        existing = db.exec(
            select(Showtime).where(
                Showtime.event_id == data["event_id"],
                Showtime.theater_id == data["theater_id"],
                Showtime.poll_id == data["poll_id"],
                Showtime.session_date == data["session_date"],
                Showtime.session_time == data["session_time"],
                Showtime.format == data["format"],
            )
        ).first()
        if existing:
            existing.booking_url = data.get("booking_url")
            existing.raw_serpapi = data.get("raw_serpapi")
            existing.fetch_timestamp = data["fetch_timestamp"]
            existing.fetch_status = data["fetch_status"]
            db.add(existing)
            saved.append(existing)
        else:
            s = Showtime(**data)
            db.add(s)
            saved.append(s)
    db.commit()
    return saved


def get_sessions_for_poll(poll_id: int, db: Session) -> list[Showtime]:
    return db.exec(
        select(Showtime)
        .where(Showtime.poll_id == poll_id)
        .order_by(Showtime.session_date, Showtime.session_time)
    ).all()


def get_sessions_grouped(
    poll_id: int,
    db: Session,
    event_ids: list[int] | None = None,
    include_all_when_none_included: bool = False,
) -> dict:
    """Returns only is_included sessions grouped by date for the unified timeline view.
    Also returns a unique dictionary of theaters involved.
    If event_ids is provided, only sessions for those events are included.
    """
    all_sessions = get_sessions_for_poll(poll_id, db)
    sessions = [s for s in all_sessions if s.is_included]
    if include_all_when_none_included and not sessions:
        sessions = list(all_sessions)
    if event_ids is not None:
        sessions = [s for s in sessions if s.event_id in event_ids]
    theaters = {t.id: t for t in db.exec(select(Venue)).all()}
    events = {}
    for link in db.exec(
        select(PollEvent).where(PollEvent.poll_id == poll_id)
    ).all():
        ev = db.get(Event, link.event_id)
        if ev:
            events[ev.id] = ev

    grouped: dict = {"dates": {}, "theaters": {}}
    
    # Sort sessions strictly by time
    sessions.sort(key=lambda s: s.session_time)

    for s in sessions:
        date = s.session_date
        theater = theaters.get(s.theater_id)
        theater_name = theater.name if theater else "Unknown Theater"
        theater_id = s.theater_id

        if date not in grouped["dates"]:
            grouped["dates"][date] = []
            
        if theater_id not in grouped["theaters"] and theater:
            grouped["theaters"][theater_id] = {
                "theater_id": theater_id,
                "theater_name": theater_name,
                "address": theater.address,
                "website_url": theater.website_url,
            }
            
        event = events.get(s.event_id)
        grouped["dates"][date].append({
            "session": s,
            "event_title": event.title if event else "Unknown Movie",
            "theater_name": theater_name,
            "theater_id": theater_id,
        })
        
    return grouped


def add_manual_session(
    poll_id: int,
    event_id: int,
    theater_id: int | None,
    session_date: str,
    session_time: str,
    fmt: str,
    db: Session,
) -> Showtime:
    conditions = [
        Showtime.event_id == event_id,
        Showtime.poll_id == poll_id,
        Showtime.session_date == session_date,
        Showtime.session_time == session_time,
        Showtime.format == fmt,
    ]
    if theater_id is not None:
        conditions.append(Showtime.theater_id == theater_id)
    existing = db.exec(select(Showtime).where(*conditions)).first()
    if existing:
        raise ValueError("Duplicate session")

    now_ts = datetime.now(timezone.utc).isoformat()
    s = Showtime(
        event_id=event_id,
        theater_id=theater_id,
        poll_id=poll_id,
        session_date=session_date,
        session_time=session_time,
        format=fmt,
        fetch_status="manual",
        is_custom=True,
        fetch_timestamp=now_ts,
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return s


def delete_session(session_id: int, db: Session) -> None:
    s = db.get(Showtime, session_id)
    if not s:
        raise ValueError("Session not found")
    db.delete(s)
    db.commit()
