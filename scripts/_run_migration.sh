#!/bin/sh
python - /data/groupgo.db << 'PYEOF'
import sys, sqlite3

db_path = sys.argv[1] if len(sys.argv) > 1 else "/data/groupgo.db"
con = sqlite3.connect(db_path)
cur = con.cursor()

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_groups'")
if not cur.fetchone():
    cur.execute("""CREATE TABLE user_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES "group"(id) ON DELETE CASCADE,
        UNIQUE(user_id, group_id)
    )""")
    cur.execute("INSERT OR IGNORE INTO user_groups (user_id, group_id) SELECT id, group_id FROM user WHERE group_id IS NOT NULL")
    rows = cur.rowcount
    print(f"user_groups created and backfilled {rows} rows")
else:
    print("user_groups already exists")

cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='poll_groups'")
if not cur.fetchone():
    cur.execute("""CREATE TABLE poll_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poll_id INTEGER NOT NULL REFERENCES poll(id) ON DELETE CASCADE,
        group_id INTEGER NOT NULL REFERENCES "group"(id) ON DELETE CASCADE,
        UNIQUE(poll_id, group_id)
    )""")
    cur.execute("INSERT OR IGNORE INTO poll_groups (poll_id, group_id) SELECT id, group_id FROM poll WHERE group_id IS NOT NULL")
    rows = cur.rowcount
    print(f"poll_groups created and backfilled {rows} rows")
else:
    print("poll_groups already exists")

con.commit()
con.close()
print("Migration complete.")
PYEOF
