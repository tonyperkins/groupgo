"""
Migration: add user_groups and poll_groups many-to-many join tables.

Safe to re-run — all operations are idempotent.

What this does:
  1. Creates user_groups table  (user_id, group_id, added_at)
  2. Creates poll_groups table  (poll_id,  group_id, added_at)
  3. Backfills user_groups from users.group_id (existing single-group memberships)
  4. Backfills poll_groups from polls.group_id  (existing single-group scopes)
  5. Does NOT drop users.group_id or polls.group_id — those columns stay as
     deprecated fallbacks until the application is fully migrated and verified.

Usage:
    # On the server, first back up the database:
    cp /app/data/groupgo.db /app/data/groupgo.db.bak_$(date +%Y%m%d_%H%M%S)

    # Then run the migration:
    python scripts/migrate_many_to_many_groups.py [/path/to/groupgo.db]
"""
import sqlite3
import sys
from datetime import datetime, timezone

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "/app/data/groupgo.db"
print(f"Migrating: {DB_PATH}\n")

db = sqlite3.connect(DB_PATH)
db.row_factory = sqlite3.Row


def tables():
    return [r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()]


now = datetime.now(timezone.utc).isoformat()
existing = tables()
print(f"Existing tables: {existing}\n")


# ── 1. Create user_groups ─────────────────────────────────────────────────────
if "user_groups" not in existing:
    db.execute("""
        CREATE TABLE user_groups (
            user_id   INTEGER NOT NULL REFERENCES users(id),
            group_id  INTEGER NOT NULL REFERENCES groups(id),
            added_at  TEXT    NOT NULL DEFAULT '',
            PRIMARY KEY (user_id, group_id)
        )
    """)
    print("  + user_groups (created)")
else:
    print("  . user_groups (exists)")


# ── 2. Create poll_groups ─────────────────────────────────────────────────────
if "poll_groups" not in existing:
    db.execute("""
        CREATE TABLE poll_groups (
            poll_id  INTEGER NOT NULL REFERENCES polls(id),
            group_id INTEGER NOT NULL REFERENCES groups(id),
            added_at TEXT    NOT NULL DEFAULT '',
            PRIMARY KEY (poll_id, group_id)
        )
    """)
    print("  + poll_groups (created)")
else:
    print("  . poll_groups (exists)")


# ── 3. Backfill user_groups from users.group_id ───────────────────────────────
print("\nBackfilling user_groups from users.group_id...")
users_with_group = db.execute(
    "SELECT id, group_id FROM users WHERE group_id IS NOT NULL"
).fetchall()

inserted = 0
skipped = 0
for row in users_with_group:
    exists = db.execute(
        "SELECT 1 FROM user_groups WHERE user_id=? AND group_id=?",
        (row["id"], row["group_id"])
    ).fetchone()
    if not exists:
        db.execute(
            "INSERT INTO user_groups (user_id, group_id, added_at) VALUES (?, ?, ?)",
            (row["id"], row["group_id"], now)
        )
        inserted += 1
    else:
        skipped += 1

print(f"  Inserted {inserted} rows, skipped {skipped} existing")


# ── 4. Backfill poll_groups from polls.group_id ───────────────────────────────
print("\nBackfilling poll_groups from polls.group_id...")
polls_with_group = db.execute(
    "SELECT id, group_id FROM polls WHERE group_id IS NOT NULL"
).fetchall()

inserted = 0
skipped = 0
for row in polls_with_group:
    exists = db.execute(
        "SELECT 1 FROM poll_groups WHERE poll_id=? AND group_id=?",
        (row["id"], row["group_id"])
    ).fetchone()
    if not exists:
        db.execute(
            "INSERT INTO poll_groups (poll_id, group_id, added_at) VALUES (?, ?, ?)",
            (row["id"], row["group_id"], now)
        )
        inserted += 1
    else:
        skipped += 1

print(f"  Inserted {inserted} rows, skipped {skipped} existing")


db.commit()
print("\nMigration complete.")
print("Final tables:", tables())
print("""
Next steps before deploying application code that uses these tables:
  1. Verify row counts above look correct.
  2. Deploy updated application code (models + services).
  3. Once confirmed stable, users.group_id and polls.group_id can be
     deprecated in a future migration (no DROP needed — SQLite ignores
     unused columns).
""")
