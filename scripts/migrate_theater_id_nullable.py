"""
Make showtimes.theater_id nullable.
SQLite does not support ALTER COLUMN, so we use the standard rename+recreate approach.
Safe to run multiple times (checks if already nullable first).
"""
import sqlite3

conn = sqlite3.connect("data/groupgo.db")
conn.row_factory = sqlite3.Row

# Check current NOT NULL status
col = next(
    (r for r in conn.execute("PRAGMA table_info(showtimes)") if r["name"] == "theater_id"),
    None,
)
if col is None:
    print("ERROR: theater_id column not found")
    conn.close()
    exit(1)

if col["notnull"] == 0:
    print("theater_id is already nullable — nothing to do")
    conn.close()
    exit(0)

print("Migrating showtimes.theater_id to nullable...")

conn.execute("PRAGMA foreign_keys=OFF")
conn.execute("BEGIN")

try:
    # 1. Rename existing table
    conn.execute("ALTER TABLE showtimes RENAME TO showtimes_old")

    # 2. Create new table with theater_id nullable
    conn.execute("""
        CREATE TABLE showtimes (
            id INTEGER NOT NULL PRIMARY KEY,
            event_id INTEGER NOT NULL REFERENCES events(id),
            theater_id INTEGER REFERENCES theaters(id),
            poll_id INTEGER NOT NULL REFERENCES polls(id),
            session_date VARCHAR NOT NULL,
            session_time VARCHAR NOT NULL,
            format VARCHAR NOT NULL DEFAULT 'Standard',
            booking_url VARCHAR,
            raw_serpapi VARCHAR,
            fetch_timestamp VARCHAR,
            fetch_status VARCHAR NOT NULL DEFAULT 'pending',
            is_custom BOOLEAN NOT NULL DEFAULT 0,
            is_included BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR NOT NULL DEFAULT ''
        )
    """)

    # 3. Copy all data
    conn.execute("""
        INSERT INTO showtimes
        SELECT id, event_id, theater_id, poll_id, session_date, session_time,
               format, booking_url, raw_serpapi, fetch_timestamp,
               fetch_status, is_custom, is_included, created_at
        FROM showtimes_old
    """)

    # 4. Drop old table
    conn.execute("DROP TABLE showtimes_old")

    conn.execute("COMMIT")
    conn.execute("PRAGMA foreign_keys=ON")

    # Verify
    col2 = next(
        (r for r in conn.execute("PRAGMA table_info(showtimes)") if r["name"] == "theater_id"),
        None,
    )
    print(f"Done. theater_id notnull={col2['notnull']} (0 = nullable ✓)")

except Exception as e:
    conn.execute("ROLLBACK")
    print(f"Migration FAILED: {e}")

conn.close()
