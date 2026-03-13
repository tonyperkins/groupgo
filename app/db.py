import os
from sqlmodel import SQLModel, Session, create_engine, select, text
from app.config import settings
from app.models import User, Venue, DbVersion, Group

os.makedirs("data", exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
)


def get_db():
    with Session(engine) as session:
        yield session


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

        # Enable WAL mode for better concurrency
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
