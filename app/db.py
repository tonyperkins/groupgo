import os
from sqlmodel import SQLModel, Session, create_engine, select, text
from app.config import settings
from app.models import User, Venue, DbVersion, Group

os.makedirs("data", exist_ok=True)

is_sqlite = settings.DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)


def get_db():
    with Session(engine) as session:
        yield session


def _ensure_many_to_many_tables(db: Session):
    """Idempotent migration: create user_groups/poll_groups if absent and backfill from legacy FK columns."""
    if is_sqlite:
        # SQLite syntax
        db.exec(text("""CREATE TABLE IF NOT EXISTS user_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, group_id)
        )"""))  # type: ignore[call-overload]
        db.exec(text("""INSERT OR IGNORE INTO user_groups (user_id, group_id, added_at)
            SELECT id, group_id, datetime('now') FROM users WHERE group_id IS NOT NULL"""))  # type: ignore[call-overload]
        db.exec(text("""CREATE TABLE IF NOT EXISTS poll_groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
            group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            added_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(poll_id, group_id)
        )"""))  # type: ignore[call-overload]
        db.exec(text("""INSERT OR IGNORE INTO poll_groups (poll_id, group_id, added_at)
            SELECT id, group_id, datetime('now') FROM polls WHERE group_id IS NOT NULL"""))  # type: ignore[call-overload]
    else:
        # PostgreSQL syntax
        db.exec(text("""CREATE TABLE IF NOT EXISTS user_groups (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            added_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, group_id)
        )"""))  # type: ignore[call-overload]
        db.exec(text("""INSERT INTO user_groups (user_id, group_id, added_at)
            SELECT id, group_id, NOW() FROM users WHERE group_id IS NOT NULL
            ON CONFLICT (user_id, group_id) DO NOTHING"""))  # type: ignore[call-overload]
        db.exec(text("""CREATE TABLE IF NOT EXISTS poll_groups (
            id SERIAL PRIMARY KEY,
            poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
            group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
            added_at TIMESTAMP NOT NULL DEFAULT NOW(),
            UNIQUE(poll_id, group_id)
        )"""))  # type: ignore[call-overload]
        db.exec(text("""INSERT INTO poll_groups (poll_id, group_id, added_at)
            SELECT id, group_id, NOW() FROM polls WHERE group_id IS NOT NULL
            ON CONFLICT (poll_id, group_id) DO NOTHING"""))  # type: ignore[call-overload]
    db.commit()


SEED_THEATERS = [
    {
        "name": "Cinemark Cedar Park",
        "address": "3000 E Whitestone Blvd, Cedar Park, TX 78613",
        "website_url": "https://www.cinemark.com/theatres/tx-cedar-park/cinemark-cedar-park",
        "serpapi_query": "Cinemark Cedar Park Texas showtimes",
        "is_active": True,
    },
]


def init_db():
    SQLModel.metadata.create_all(engine)

    with Session(engine) as db:
        from app.services.security_service import generate_member_pin

        # Enable WAL mode for better concurrency (SQLite only)
        if is_sqlite:
            db.exec(text("PRAGMA journal_mode=WAL"))  # type: ignore[call-overload]
            db.exec(text("PRAGMA foreign_keys=ON"))   # type: ignore[call-overload]

        # Seed default group
        existing_groups = db.exec(select(Group)).all()
        if not existing_groups:
            db.add(Group(id=1, name="Default Group"))
            db.commit()

        # Seed admin user if no users exist
        existing_users = db.exec(select(User)).all()
        if not existing_users:
            import logging
            admin_email = settings.ADMIN_EMAIL or "admin@groupgo.local"
            admin_name = settings.ADMIN_NAME or "Admin"
            admin_pin = generate_member_pin(db)
            db.add(User(
                id=1,
                name=admin_name,
                email=admin_email,
                role="admin",
                member_pin=admin_pin,
                group_id=1,
            ))
            db.commit()
            
            # Reset sequences after seeding with explicit IDs (PostgreSQL only)
            if not is_sqlite:
                db.exec(text("SELECT setval('groups_id_seq', (SELECT MAX(id) FROM groups))"))  # type: ignore[call-overload]
                db.exec(text("SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))"))  # type: ignore[call-overload]
                db.commit()
            
            logging.getLogger(__name__).warning(
                "\n"
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
                "  FIRST BOOT — admin user seeded\n"
                "  Email : %s\n"
                "  Login : %s/admin/login\n"
                "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
                admin_email, settings.app_base_url,
            )
        else:
            # Ensure every non-admin voter has a PIN
            for user in existing_users:
                if not user.member_pin:
                    user.member_pin = generate_member_pin(db)
                    db.add(user)
            db.commit()

        # Auto-migrate: ensure many-to-many join tables exist and are backfilled
        _ensure_many_to_many_tables(db)

        # Seed theaters if table is empty
        existing_theaters = db.exec(select(Venue)).all()
        if not existing_theaters:
            for t in SEED_THEATERS:
                db.add(Venue(**t))

        # Record schema version
        existing_version = db.get(DbVersion, 1)
        if not existing_version:
            db.add(DbVersion(version=1))

        db.commit()
