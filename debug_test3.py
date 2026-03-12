from app.services.showtime_service import get_sessions_grouped
from sqlmodel import Session, create_engine
from app.models import SQLModel
from tests.conftest import engine as test_engine

def test_grouped(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    grouped = get_sessions_grouped(poll.id, seeded_db, event_ids=None)
    print("GROUPED:", grouped)

