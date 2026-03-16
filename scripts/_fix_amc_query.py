import sqlite3
conn = sqlite3.connect("/data/groupgo.db")
conn.execute("UPDATE theaters SET serpapi_query='AMC Lakeline 9 Cedar Park Texas showtimes' WHERE id=2")
conn.commit()
for row in conn.execute("SELECT id,name,serpapi_query FROM theaters"):
    print(row)
conn.close()
