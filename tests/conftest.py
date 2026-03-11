import pytest
from sqlmodel import SQLModel, Session, create_engine
from fastapi.testclient import TestClient

from app.models import User, Theater, Poll, Event, PollEvent, Session as ShowSession
from app.db import SEED_USERS, SEED_THEATERS


@pytest.fixture(scope="function")
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)


@pytest.fixture(scope="function")
def db(db_engine):
    with Session(db_engine) as session:
        yield session


@pytest.fixture(scope="function")
def seeded_db(db):
    for u in SEED_USERS:
        db.add(User(**u))
    for t in SEED_THEATERS:
        db.add(Theater(**t))
    db.commit()
    return db


@pytest.fixture
def open_poll(seeded_db):
    poll = Poll(title="Test Weekend", status="OPEN", target_dates='["2026-03-14"]')
    seeded_db.add(poll)
    seeded_db.commit()
    seeded_db.refresh(poll)
    return poll


@pytest.fixture
def poll_with_event(seeded_db, open_poll):
    event = Event(
        tmdb_id=12345,
        title="Test Movie",
        year=2026,
        tmdb_rating=8.0,
    )
    seeded_db.add(event)
    seeded_db.flush()
    link = PollEvent(poll_id=open_poll.id, event_id=event.id)
    seeded_db.add(link)
    seeded_db.commit()
    seeded_db.refresh(event)
    return open_poll, event


@pytest.fixture
def poll_with_sessions(seeded_db, poll_with_event):
    poll, event = poll_with_event
    theater_id = 1  # Seeded theater
    sessions = [
        ShowSession(
            event_id=event.id,
            theater_id=theater_id,
            poll_id=poll.id,
            session_date="2026-03-14",
            session_time="19:00",
            format="Standard",
            fetch_status="success",
        ),
        ShowSession(
            event_id=event.id,
            theater_id=theater_id,
            poll_id=poll.id,
            session_date="2026-03-14",
            session_time="21:30",
            format="IMAX",
            fetch_status="success",
        ),
    ]
    for s in sessions:
        seeded_db.add(s)
    seeded_db.commit()
    for s in sessions:
        seeded_db.refresh(s)
    return poll, event, sessions
