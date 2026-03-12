import os
from sqlmodel import SQLModel, Session, create_engine, select, text
from app.config import settings
from app.models import User, Theater, DbVersion, Group

os.makedirs("data", exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
)


def get_db():
    with Session(engine) as session:
        yield session


SEED_USERS = [
    {"id": 1, "name": "Admin",   "is_admin": True},
]

SEED_THEATERS = [
    {
        "name": "Cinemark Cedar Park",
        "address": "3000 E Whitestone Blvd, Cedar Park, TX 78613",
        "website_url": "https://www.cinemark.com/theatres/tx-cedar-park/cinemark-cedar-park",
        "serpapi_query": "Cinemark Cedar Park Texas showtimes",
        "is_active": True,
    },
   
]


def _add_column_if_missing(db, table: str, column: str, col_def: str):
    """Safely add a column to an existing table if it doesn't exist."""
    try:
        db.exec(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}"))  # type: ignore[call-overload]
        db.commit()
    except Exception:
        db.rollback()


def init_db():
    SQLModel.metadata.create_all(engine)

    with Session(engine) as db:
        from app.services.security_service import generate_member_pin

        # Enable WAL mode for better concurrency
        db.exec(text("PRAGMA journal_mode=WAL"))  # type: ignore[call-overload]
        db.exec(text("PRAGMA foreign_keys=ON"))  # type: ignore[call-overload]

        # Schema migrations for new columns on existing tables
        _add_column_if_missing(db, "users", "group_id", "INTEGER REFERENCES groups(id)")
        _add_column_if_missing(db, "users", "member_pin", "TEXT")
        _add_column_if_missing(db, "polls", "access_uuid", "TEXT")
        _add_column_if_missing(db, "sessions", "is_included", "INTEGER NOT NULL DEFAULT 1")
        _add_column_if_missing(db, "user_poll_preferences", "has_completed_voting", "INTEGER NOT NULL DEFAULT 0")
        _add_column_if_missing(db, "user_poll_preferences", "is_participating", "INTEGER NOT NULL DEFAULT 0")
        _add_column_if_missing(db, "user_poll_preferences", "opt_out_reason", "TEXT")
        _add_column_if_missing(db, "theaters", "website_url", "TEXT")
        _add_column_if_missing(db, "votes", "veto_reason", "TEXT")

        # Seed default group
        existing_groups = db.exec(select(Group)).all()
        if not existing_groups:
            db.add(Group(id=1, name="Default Group"))
            db.commit()

        # Seed users if table is empty
        existing_users = db.exec(select(User)).all()
        if not existing_users:
            for u in SEED_USERS:
                db.add(User(**u))
        else:
            for user in existing_users:
                if user.is_admin or user.member_pin:
                    continue
                user.member_pin = generate_member_pin(db)
                db.add(user)

        # Seed theaters if table is empty
        existing_theaters = db.exec(select(Theater)).all()
        if not existing_theaters:
            for t in SEED_THEATERS:
                db.add(Theater(**t))

        # Record schema version
        existing_version = db.get(DbVersion, 1)
        if not existing_version:
            db.add(DbVersion(version=1))

        db.commit()
