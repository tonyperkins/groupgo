from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Group(SQLModel, table=True):
    __tablename__ = "groups"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    created_at: str = Field(default_factory=_now)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    token: Optional[str] = Field(default=None, unique=True, index=True)
    member_pin: Optional[str] = Field(default=None, max_length=4, index=True)
    is_admin: bool = Field(default=False)
    email: Optional[str] = Field(default=None)
    group_id: Optional[int] = Field(default=None, foreign_key="groups.id")
    created_at: str = Field(default_factory=_now)


class Poll(SQLModel, table=True):
    __tablename__ = "polls"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    status: str = Field(default="DRAFT")  # DRAFT, OPEN, CLOSED, ARCHIVED
    access_uuid: Optional[str] = Field(default=None, index=True)
    target_dates: str = Field(default="[]")  # JSON array of YYYY-MM-DD strings
    winner_event_id: Optional[int] = Field(default=None, foreign_key="events.id")
    winner_session_id: Optional[int] = Field(default=None, foreign_key="sessions.id")
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class Event(SQLModel, table=True):
    __tablename__ = "events"

    id: Optional[int] = Field(default=None, primary_key=True)
    tmdb_id: Optional[int] = Field(default=None, unique=True)
    title: str
    year: Optional[int] = Field(default=None)
    synopsis: Optional[str] = Field(default=None)
    poster_path: Optional[str] = Field(default=None)
    trailer_key: Optional[str] = Field(default=None)
    tmdb_rating: Optional[float] = Field(default=None)
    runtime_mins: Optional[int] = Field(default=None)
    genres: Optional[str] = Field(default=None)  # JSON array
    is_custom_event: bool = Field(default=False)
    created_at: str = Field(default_factory=_now)


class PollEvent(SQLModel, table=True):
    __tablename__ = "poll_events"

    poll_id: int = Field(foreign_key="polls.id", primary_key=True)
    event_id: int = Field(foreign_key="events.id", primary_key=True)
    sort_order: int = Field(default=0)
    added_at: str = Field(default_factory=_now)


class Theater(SQLModel, table=True):
    __tablename__ = "theaters"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    address: Optional[str] = Field(default=None)
    serpapi_query: str
    is_active: bool = Field(default=True)
    created_at: str = Field(default_factory=_now)


class Session(SQLModel, table=True):
    __tablename__ = "sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: int = Field(foreign_key="events.id")
    theater_id: int = Field(foreign_key="theaters.id")
    poll_id: int = Field(foreign_key="polls.id")
    session_date: str  # YYYY-MM-DD
    session_time: str  # HH:MM (24h)
    format: str = Field(default="Standard")
    booking_url: Optional[str] = Field(default=None)
    raw_serpapi: Optional[str] = Field(default=None)
    fetch_timestamp: Optional[str] = Field(default=None)
    fetch_status: str = Field(default="pending")  # pending, success, partial, failed, manual
    is_custom: bool = Field(default=False)
    is_included: bool = Field(default=True)
    created_at: str = Field(default_factory=_now)


class Vote(SQLModel, table=True):
    __tablename__ = "votes"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    poll_id: int = Field(foreign_key="polls.id")
    target_type: str  # 'event' or 'session'
    target_id: int
    vote_value: str  # yes, no, can_do, cant_do, abstain
    voted_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class UserPollPreference(SQLModel, table=True):
    __tablename__ = "user_poll_preferences"

    user_id: int = Field(foreign_key="users.id", primary_key=True)
    poll_id: int = Field(foreign_key="polls.id", primary_key=True)
    is_flexible: bool = Field(default=False)
    has_completed_voting: bool = Field(default=False)
    updated_at: str = Field(default_factory=_now)


class FetchJob(SQLModel, table=True):
    __tablename__ = "fetch_jobs"

    id: str = Field(primary_key=True)  # UUID string
    poll_id: int = Field(foreign_key="polls.id")
    total_tasks: int = Field(default=0)
    completed_tasks: int = Field(default=0)
    failed_tasks: int = Field(default=0)
    status: str = Field(default="running")  # running, complete, failed
    last_error: Optional[str] = Field(default=None)
    started_at: str = Field(default_factory=_now)
    finished_at: Optional[str] = Field(default=None)


class DbVersion(SQLModel, table=True):
    __tablename__ = "db_version"

    version: int = Field(primary_key=True)
    applied_at: str = Field(default_factory=_now)
