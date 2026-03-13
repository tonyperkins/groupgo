"""Add generic event fields to the events table."""
import sqlite3, os

db_path = os.path.join(os.path.dirname(__file__), "..", "data", "groupgo.db")
conn = sqlite3.connect(db_path)
c = conn.cursor()

existing = [r[1] for r in c.execute("PRAGMA table_info(events)").fetchall()]
print("Existing columns:", existing)

migrations = [
    ("rating",       "TEXT"),
    ("event_type",   "TEXT NOT NULL DEFAULT 'movie'"),
    ("image_url",    "TEXT"),
    ("external_url", "TEXT"),
    ("venue_name",   "TEXT"),
]

for col, typedef in migrations:
    if col not in existing:
        c.execute(f"ALTER TABLE events ADD COLUMN {col} {typedef}")
        print(f"  Added: {col} {typedef}")
    else:
        print(f"  Already exists: {col}")

conn.commit()
conn.close()
print("Migration complete.")
