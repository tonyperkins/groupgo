import sqlite3
db = sqlite3.connect("/data/groupgo.db")

print("=== showtimes ===")
rows = db.execute("SELECT id, poll_id, event_id, session_date, session_time, fetch_status FROM showtimes").fetchall()
print(f"Count: {len(rows)}")
for r in rows:
    print(" ", r)

print("\n=== fetch_jobs (last 5) ===")
rows = db.execute("SELECT id, poll_id, status, total_tasks, completed_tasks, failed_tasks, last_error FROM fetch_jobs ORDER BY rowid DESC LIMIT 5").fetchall()
for r in rows:
    print(" ", r)
