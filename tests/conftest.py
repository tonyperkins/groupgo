import pytest
from contextlib import asynccontextmanager
from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.models import User, Theater, Poll, Event, PollEvent, Session as ShowSession
from app.db import SEED_USERS, SEED_THEATERS, get_db
from app.routers import voter, admin, api


TEST_VOTERS = [
    {"id": 2, "name": "Alex", "is_admin": False, "member_pin": "1111"},
    {"id": 3, "name": "Blake", "is_admin": False, "member_pin": "2222"},
    {"id": 4, "name": "Casey", "is_admin": False, "member_pin": "3333"},
    {"id": 5, "name": "Drew", "is_admin": False, "member_pin": "4444"},
]


@pytest.fixture(scope="function")
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture(scope="function")
def db(db_engine):
    with Session(db_engine) as session:
        yield session


@pytest.fixture(scope="function")
def seeded_db(db):
    for u in SEED_USERS:
        db.add(User(**u))
    for u in TEST_VOTERS:
        db.add(User(**u))
    for t in SEED_THEATERS:
        db.add(Theater(**t))
    db.commit()
    return db


@pytest.fixture(scope="function")
def test_app(seeded_db):
    @asynccontextmanager
    async def noop_lifespan(app):
        yield

    app = FastAPI(lifespan=noop_lifespan)
    app.mount("/static", StaticFiles(directory="static"), name="static")
    app.include_router(voter.router)
    app.include_router(admin.router)
    app.include_router(api.router)

    def override_get_db():
        yield seeded_db

    app.dependency_overrides[get_db] = override_get_db
    return app


@pytest.fixture(scope="function")
def client(test_app):
    with TestClient(test_app) as test_client:
        yield test_client


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
