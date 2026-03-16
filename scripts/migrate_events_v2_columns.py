"""
Add v2 generic-event columns to the events table.
Safe to run multiple times — skips columns that already exist.
Columns added:
  - event_type   VARCHAR NOT NULL DEFAULT 'movie'
  - image_url    VARCHAR (nullable)
  - external_url VARCHAR (nullable)
  - booking_url  VARCHAR (nullable)
  - venue_name   VARCHAR (nullable)
"""
import sqlite3

DB_PATH = "data/groupgo.db"

NEW_COLUMNS = [
    ("event_type",   "VARCHAR NOT NULL DEFAULT 'movie'"),
    ("image_url",    "VARCHAR"),
    ("external_url", "VARCHAR"),
    ("booking_url",  "VARCHAR"),
    ("venue_name",   "VARCHAR"),
]

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

existing = {row["name"] for row in conn.execute("PRAGMA table_info(events)")}
if not existing:
    print("ERROR: events table not found")
    conn.close()
    exit(1)

added = []
for col_name, col_def in NEW_COLUMNS:
    if col_name in existing:
        print(f"  SKIP  {col_name} (already exists)")
    else:
        conn.execute(f"ALTER TABLE events ADD COLUMN {col_name} {col_def}")
        added.append(col_name)
        print(f"  ADDED {col_name} {col_def}")

if added:
    conn.commit()
    print(f"Done. Added {len(added)} column(s): {', '.join(added)}")
else:
    print("Nothing to do — all columns already present.")

conn.close()
