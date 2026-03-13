"""Simulate exactly what send_admin_magic_link does."""
import sys
sys.path.insert(0, "/app")

from sqlmodel import Session, select
from app.db import init_db
from app.models import User
from app.config import settings
from sqlalchemy import create_engine
from sqlmodel import create_engine as sm_create_engine

email = "perkins.tony@gmail.com"

engine = sm_create_engine(settings.DATABASE_URL)
with Session(engine) as db:
    user = db.exec(select(User).where(User.email == email)).first()
    if not user:
        print(f"NO USER FOUND for email={email!r}")
    else:
        print(f"Found user: id={user.id} name={user.name} email={user.email!r} role={user.role!r}")
        if user.role != "admin":
            print("PROBLEM: role is not 'admin' — email would be suppressed")
        else:
            print("role=admin OK")

print(f"\nSettings: APP_ENV={settings.APP_ENV} is_production={settings.is_production}")
print(f"SMTP_USER={settings.SMTP_USER!r}")
print(f"Would send email: {settings.is_production and bool(settings.SMTP_USER)}")
