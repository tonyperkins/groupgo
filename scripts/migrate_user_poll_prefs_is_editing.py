"""
Add is_editing column to user_poll_preferences table.
Safe to run multiple times — skips if already exists.
"""
import sqlite3
import sys

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "data/groupgo.db"

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

existing = {row["name"] for row in conn.execute("PRAGMA table_info(user_poll_preferences)")}
if not existing:
    print("ERROR: user_poll_preferences table not found")
    conn.close()
    exit(1)

if "is_editing" in existing:
    print("SKIP  is_editing (already exists)")
else:
    conn.execute("ALTER TABLE user_poll_preferences ADD COLUMN is_editing BOOLEAN DEFAULT 0")
    conn.commit()
    print("ADDED is_editing BOOLEAN DEFAULT 0")

conn.close()
