import sqlite3

conn = sqlite3.connect("groupgo.db")
cur = conn.cursor()

print("TABLES:")
for row in cur.execute("select name from sqlite_master where type='table' order by name"):
    print(row)

print("\nSESSIONS:")
for row in cur.execute(
    "select id, event_id, session_date, session_time, theater_id, booking_url from sessions order by session_date, session_time limit 30"
):
    print(row)
