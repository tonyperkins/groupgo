import sqlite3, sys
DB = sys.argv[1]
db = sqlite3.connect(DB)
for t in ['polls','groups','users','events','theaters','votes','user_poll_preferences','showtimes']:
    cols = [r[1] for r in db.execute(f"PRAGMA table_info({t})").fetchall()]
    print(f"{t}: {cols}")
