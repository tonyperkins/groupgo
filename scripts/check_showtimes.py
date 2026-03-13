import sys, sqlite3
sys.path.insert(0, ".")
from app.config import settings

db_path = settings.DATABASE_URL.replace("sqlite:///", "").replace("./", "")
print(f"DB path: {db_path}")
db = sqlite3.connect(db_path)

tables = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Tables:", tables)

for t in ["showtimes", "sessions"]:
    if t in tables:
        rows = db.execute(f"SELECT id, poll_id, event_id, theater_id, session_date, session_time, is_custom, is_included FROM {t}").fetchall()
        print(f"\n{t} ({len(rows)} rows):")
        for r in rows:
            print(" ", r)
