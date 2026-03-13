"""
Migrate old GroupGo DB to current schema.
Adds missing columns; creates missing tables; safe to re-run.
"""
import sqlite3
import sys

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "/app/data/groupgo.db"
print(f"Migrating: {DB_PATH}\n")

db = sqlite3.connect(DB_PATH)
db.row_factory = sqlite3.Row


def cols(table):
    return [r["name"] for r in db.execute(f"PRAGMA table_info({table})").fetchall()]


def tables():
    return [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]


def add_col(table, col, typedef):
    if col not in cols(table):
        db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typedef}")
        print(f"  + {table}.{col}")
    else:
        print(f"  . {table}.{col} (exists)")


existing_tables = tables()
print(f"Existing tables: {existing_tables}\n")

# ── groups ────────────────────────────────────────────────────────────────────
print("groups:")
add_col("groups", "access_code", "TEXT")
add_col("groups", "default_theater_ids", "TEXT")
add_col("groups", "updated_at", "TEXT DEFAULT ''")

# ── users ─────────────────────────────────────────────────────────────────────
print("\nusers:")
add_col("users", "email", "TEXT")
add_col("users", "email_verified_at", "TEXT")
add_col("users", "password_hash", "TEXT")
add_col("users", "role", "TEXT DEFAULT 'voter'")
add_col("users", "plan", "TEXT DEFAULT 'free'")
add_col("users", "updated_at", "TEXT DEFAULT ''")

# ── polls ─────────────────────────────────────────────────────────────────────
print("\npolls:")
add_col("polls", "access_uuid", "TEXT")
add_col("polls", "group_id", "INTEGER")
add_col("polls", "voting_closes_at", "TEXT")
add_col("polls", "created_by_user_id", "INTEGER")
add_col("polls", "description", "TEXT")
add_col("polls", "winner_event_id", "INTEGER")
add_col("polls", "winner_session_id", "INTEGER")
add_col("polls", "updated_at", "TEXT DEFAULT ''")

# ── events ────────────────────────────────────────────────────────────────────
print("\nevents:")
add_col("events", "is_custom_event", "INTEGER DEFAULT 0")
add_col("events", "event_type", "TEXT DEFAULT 'movie'")
add_col("events", "image_url", "TEXT")
add_col("events", "external_url", "TEXT")
add_col("events", "venue_name", "TEXT")
add_col("events", "rating", "TEXT")

# ── user_poll_preferences ─────────────────────────────────────────────────────
print("\nuser_poll_preferences:")
add_col("user_poll_preferences", "is_participating", "INTEGER DEFAULT 0")
add_col("user_poll_preferences", "opt_out_reason", "TEXT")
add_col("user_poll_preferences", "joined_at", "TEXT")
add_col("user_poll_preferences", "updated_at", "TEXT DEFAULT ''")

# ── votes ─────────────────────────────────────────────────────────────────────
print("\nvotes:")
add_col("votes", "veto_reason", "TEXT")
add_col("votes", "updated_at", "TEXT DEFAULT ''")

# ── theaters (Venue) ──────────────────────────────────────────────────────────
print("\ntheaters:")
add_col("theaters", "website_url", "TEXT")
add_col("theaters", "latitude", "REAL")
add_col("theaters", "longitude", "REAL")
add_col("theaters", "google_place_id", "TEXT")

# ── sessions → showtimes ──────────────────────────────────────────────────────
# Old table is 'sessions', new model uses 'showtimes'
if "sessions" in existing_tables and "showtimes" not in existing_tables:
    print("\nRenaming sessions → showtimes...")
    db.execute("ALTER TABLE sessions RENAME TO showtimes")
    print("  Renamed sessions → showtimes")
elif "showtimes" in existing_tables:
    print("\nshowtimes: exists")
    add_col("showtimes", "is_custom", "INTEGER DEFAULT 0")
    add_col("showtimes", "is_included", "INTEGER DEFAULT 1")
    add_col("showtimes", "fetch_status", "TEXT DEFAULT 'success'")

# ── New tables ─────────────────────────────────────────────────────────────────
print("\nCreating new tables if missing...")

if "poll_dates" not in existing_tables:
    db.execute("""
        CREATE TABLE poll_dates (
            poll_id INTEGER NOT NULL REFERENCES polls(id),
            date TEXT NOT NULL,
            PRIMARY KEY (poll_id, date)
        )
    """)
    print("  + poll_dates")

if "auth_sessions" not in existing_tables:
    db.execute("""
        CREATE TABLE auth_sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            session_type TEXT DEFAULT 'voter',
            device_hint TEXT,
            is_trusted_device INTEGER DEFAULT 0,
            created_at TEXT DEFAULT '',
            expires_at TEXT DEFAULT '',
            last_active_at TEXT DEFAULT '',
            revoked_at TEXT
        )
    """)
    print("  + auth_sessions")

if "magic_link_tokens" not in existing_tables:
    db.execute("""
        CREATE TABLE magic_link_tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            purpose TEXT NOT NULL,
            created_at TEXT DEFAULT '',
            expires_at TEXT DEFAULT '',
            used_at TEXT
        )
    """)
    print("  + magic_link_tokens")

if "showtime_cache" not in existing_tables:
    db.execute("""
        CREATE TABLE showtime_cache (
            id INTEGER PRIMARY KEY,
            theater_id INTEGER NOT NULL REFERENCES theaters(id),
            movie_title TEXT NOT NULL,
            cache_date TEXT NOT NULL,
            fetched_at TEXT DEFAULT '',
            raw_serpapi TEXT NOT NULL,
            expires_at TEXT NOT NULL
        )
    """)
    print("  + showtime_cache")

# ── Set admin user role ────────────────────────────────────────────────────────
print("\nSetting admin user role...")
db.execute("UPDATE users SET role='admin' WHERE is_admin=1 OR id=1")
print("  Done")

db.commit()
print("\nMigration complete.")

# Verify
print("\nFinal table list:", tables())
