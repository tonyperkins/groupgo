"""Add showtime_url_pattern column to theaters table. Idempotent."""
import sqlite3
import sys

db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/groupgo.db"
conn = sqlite3.connect(db_path)
cur = conn.cursor()

cols = [row[1] for row in cur.execute("PRAGMA table_info(theaters)").fetchall()]
if "showtime_url_pattern" not in cols:
    cur.execute("ALTER TABLE theaters ADD COLUMN showtime_url_pattern VARCHAR")
    conn.commit()
    print("Added showtime_url_pattern column.")
else:
    print("showtime_url_pattern already exists — skipping.")

conn.close()
