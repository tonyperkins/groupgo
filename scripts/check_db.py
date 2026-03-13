import sqlite3
db = sqlite3.connect("/data/groupgo.db")
tables = db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tables:", tables)
for (t,) in tables:
    if "user" in t.lower():
        rows = db.execute(f"SELECT * FROM {t}").fetchall()
        print(f"\n{t} rows:", rows)
