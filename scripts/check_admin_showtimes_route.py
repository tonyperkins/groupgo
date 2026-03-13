import sys
sys.path.insert(0, ".")
from app.config import settings
from sqlmodel import Session, create_engine, select
from app.models import PollDate
from app.services import movie_service, showtime_service, theater_service

POLL_ID = 2
engine = create_engine(settings.DATABASE_URL)

with Session(engine) as db:
    events = movie_service.get_poll_events(POLL_ID, db)
    sessions = showtime_service.get_sessions_for_poll(POLL_ID, db)
    theaters = theater_service.get_active_theaters(db)
    theater_map = {t.id: t for t in theater_service.get_all_theaters(db)}
    event_map = {e.id: e for e in events}

    print(f"events (list): {[(e.id, e.title) for e in events]}")
    print(f"event_map (dict keys): {list(event_map.keys())}")
    print(f"theater_map (dict keys): {list(theater_map.keys())}")
    print(f"sessions: {len(sessions)}")
    for s in sessions:
        ev = event_map.get(s.event_id)
        th = theater_map.get(s.theater_id)
        print(f"  id={s.id} event={ev.title if ev else 'MISSING'} theater={th.name if th else 'MISSING'} date={s.session_date} time={s.session_time}")
