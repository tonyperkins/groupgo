"""Seed admin user into a fresh DB."""
import sys
sys.path.insert(0, "/app")

from sqlmodel import Session, create_engine, select
from app.models import User
from app.config import settings

email = sys.argv[1] if len(sys.argv) > 1 else "perkins.tony@gmail.com"
name = sys.argv[2] if len(sys.argv) > 2 else "Admin"

engine = create_engine(settings.DATABASE_URL)
with Session(engine) as db:
    existing = db.exec(select(User).where(User.email == email)).first()
    if existing:
        print(f"User already exists: {existing.email} role={existing.role}")
    else:
        user = User(name=name, email=email, role="admin")
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"Created admin user: id={user.id} email={user.email} role={user.role}")
