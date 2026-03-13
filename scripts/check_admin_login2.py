"""Debug the ORM user lookup step by step."""
import sys
sys.path.insert(0, "/app")

import sqlite3
from sqlmodel import Session, select, create_engine, text
from app.models import User
from app.config import settings

email = "perkins.tony@gmail.com"

# 1. Raw sqlite check
db = sqlite3.connect(settings.DATABASE_URL.replace("sqlite:///", "").replace("./", "/app/"))
row = db.execute("SELECT id, name, email, role FROM users WHERE email=?", (email,)).fetchone()
print(f"Raw sqlite result: {row}")

# 2. ORM check with debug
engine = create_engine(settings.DATABASE_URL, echo=True)
with Session(engine) as session:
    stmt = select(User).where(User.email == email)
    print(f"\nSQL statement: {stmt}")
    try:
        user = session.exec(stmt).first()
        print(f"ORM result: {user}")
        if user:
            print(f"  role={user.role!r}")
    except Exception as e:
        print(f"ORM error: {e}")
