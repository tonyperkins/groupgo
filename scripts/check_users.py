import sqlite3
db = sqlite3.connect("/data/groupgo.db")
rows = db.execute("SELECT email, role FROM user").fetchall()
print("Users in DB:")
for r in rows:
    print(" ", r)
