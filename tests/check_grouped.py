import pytest
from app.services.showtime_service import get_sessions_grouped
from sqlmodel import Session

def test_grouped(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    print("SESSION COUNT:", len(sessions))
    grouped = get_sessions_grouped(poll.id, seeded_db, event_ids=None)
    print("GROUPED:", grouped)
    assert len(grouped["dates"]) > 0

