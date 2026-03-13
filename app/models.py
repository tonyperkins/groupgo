from typing import Optional
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Group(SQLModel, table=True):
    __tablename__ = "groups"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)
    access_code: Optional[str] = Field(default=None, unique=True)
    default_theater_ids: Optional[str] = Field(default=None)  # JSON array of theater IDs
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)

    # Contact
    email: str = Field(unique=True, index=True)
    email_verified_at: Optional[str] = Field(default=None)

    # Auth credentials
    password_hash: Optional[str] = Field(default=None)
    member_pin: Optional[str] = Field(default=None, max_length=4, index=True)

    # Role & plan
    role: str = Field(default="voter")  # "admin" | "voter"
    plan: str = Field(default="free")   # "free" | "paid"

    # Group membership
    group_id: Optional[int] = Field(default=None, foreign_key="groups.id")

    # Legacy — keep during transition period
    token: Optional[str] = Field(default=None, unique=True, index=True)

    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)

    @property
    def is_admin(self) -> bool:
        """Backward-compatible property — keeps existing code working."""
        return self.role == "admin"


class Poll(SQLModel, table=True):
    __tablename__ = "polls"

    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    status: str = Field(default="DRAFT")  # DRAFT, OPEN, CLOSED, ARCHIVED
    access_uuid: Optional[str] = Field(default=None, index=True)
    group_id: Optional[int] = Field(default=None, foreign_key="groups.id")
    voting_closes_at: Optional[str] = Field(default=None)  # ISO datetime UTC
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    description: Optional[str] = Field(default=None)
    winner_event_id: Optional[int] = Field(default=None, foreign_key="events.id")
    winner_session_id: Optional[int] = Field(default=None, foreign_key="showtimes.id")
    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class PollDate(SQLModel, table=True):
    """Replaces Poll.target_dates JSON string — queryable poll dates."""
    __tablename__ = "poll_dates"

    poll_id: int = Field(foreign_key="polls.id", primary_key=True)
    date: str = Field(primary_key=True)  # YYYY-MM-DD


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
    rating: Optional[str] = Field(default=None)        # MPAA rating e.g. "PG-13"
    genres: Optional[str] = Field(default=None)        # JSON array
    is_custom_event: bool = Field(default=False)
    # Generic event fields — default to "movie" so existing rows are unaffected
    event_type: str = Field(default="movie")           # "movie"|"restaurant"|"concert"|"bar"|"other"
    image_url: Optional[str] = Field(default=None)     # generic image (used when poster_path is None)
    external_url: Optional[str] = Field(default=None)  # website / booking link
    venue_name: Optional[str] = Field(default=None)    # freeform location (no Venue FK needed)
    created_at: str = Field(default_factory=_now)


class PollEvent(SQLModel, table=True):
    __tablename__ = "poll_events"

    poll_id: int = Field(foreign_key="polls.id", primary_key=True)
    event_id: int = Field(foreign_key="events.id", primary_key=True)
    sort_order: int = Field(default=0)
    added_at: str = Field(default_factory=_now)


class Venue(SQLModel, table=True):
    __tablename__ = "theaters"  # kept for migration compatibility

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    address: Optional[str] = Field(default=None)
    website_url: Optional[str] = Field(default=None)
    serpapi_query: str
    is_active: bool = Field(default=True)
    latitude: Optional[float] = Field(default=None)
    longitude: Optional[float] = Field(default=None)
    google_place_id: Optional[str] = Field(default=None)
    created_at: str = Field(default_factory=_now)


class Showtime(SQLModel, table=True):
    """Renamed from Session to avoid import aliasing with SQLModel Session."""
    __tablename__ = "showtimes"

    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: int = Field(foreign_key="events.id")
    theater_id: int = Field(foreign_key="theaters.id")  # FK to Venue (theaters table)
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


class ShowtimeCache(SQLModel, table=True):
    """Poll-agnostic SerpApi cache. Shared across all polls (enables free-tier reuse)."""
    __tablename__ = "showtime_cache"

    id: Optional[int] = Field(default=None, primary_key=True)
    theater_id: int = Field(foreign_key="theaters.id")  # FK to Venue (theaters table)
    movie_title: str  # normalized for matching
    cache_date: str   # YYYY-MM-DD
    fetched_at: str = Field(default_factory=_now)
    raw_serpapi: str  # JSON blob
    expires_at: str   # ISO datetime UTC (fetched_at + 12h)


class Vote(SQLModel, table=True):
    __tablename__ = "votes"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id")
    poll_id: int = Field(foreign_key="polls.id")
    # WARNING: polymorphic association — target_type discriminates between
    # "event" (FK→events.id) and "session" (FK→showtimes.id). No DB-level
    # FK enforcement. Bugs writing wrong target_type silently corrupt data.
    target_type: str  # 'event' or 'session'
    target_id: int
    vote_value: str  # yes, no, can_do, cant_do, abstain
    veto_reason: Optional[str] = Field(default=None)  # Used when vote_value is 'no' for events
    voted_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)


class UserPollPreference(SQLModel, table=True):
    __tablename__ = "user_poll_preferences"

    user_id: int = Field(foreign_key="users.id", primary_key=True)
    poll_id: int = Field(foreign_key="polls.id", primary_key=True)
    is_flexible: bool = Field(default=False)
    has_completed_voting: bool = Field(default=False)
    is_participating: bool = Field(default=False)
    opt_out_reason: Optional[str] = Field(default=None)
    joined_at: Optional[str] = Field(default=None)  # set when is_participating first becomes True
    updated_at: str = Field(default_factory=_now)


class AuthSession(SQLModel, table=True):
    """Server-side session record. Replaces stateless token cookie."""
    __tablename__ = "auth_sessions"

    id: str = Field(primary_key=True)  # UUID
    user_id: int = Field(foreign_key="users.id", index=True)
    session_type: str = Field(default="voter")  # "voter" | "admin"
    device_hint: Optional[str] = Field(default=None)  # "iPhone / Safari" — display only
    is_trusted_device: bool = Field(default=False)
    created_at: str = Field(default_factory=_now)
    expires_at: str = Field(default="")  # ISO datetime UTC
    last_active_at: str = Field(default_factory=_now)
    revoked_at: Optional[str] = Field(default=None)  # set on logout


class MagicLinkToken(SQLModel, table=True):
    """Single-use short-lived token for passwordless flows."""
    __tablename__ = "magic_link_tokens"

    token: str = Field(primary_key=True)  # UUID
    user_id: int = Field(foreign_key="users.id", index=True)
    purpose: str  # "admin_login" | "voter_onboard" | "pin_reset" | "email_verify"
    created_at: str = Field(default_factory=_now)
    expires_at: str = Field(default="")  # ISO datetime UTC
    used_at: Optional[str] = Field(default=None)  # set on first use — token then invalid


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
