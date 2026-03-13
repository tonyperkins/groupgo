"""
One-time migration: add email + role columns if missing, set admin user email/role.
Safe to run multiple times.
"""
import sqlite3
import sys

DB_PATH = "/data/groupgo.db"
ADMIN_EMAIL = sys.argv[1] if len(sys.argv) > 1 else ""

if not ADMIN_EMAIL:
    print("Usage: python fix_admin_user.py your@email.com")
    sys.exit(1)

db = sqlite3.connect(DB_PATH)
db.row_factory = sqlite3.Row

# Check existing columns
cols = [r["name"] for r in db.execute("PRAGMA table_info(users)").fetchall()]
print("Existing columns:", cols)

# Add email column if missing
if "email" not in cols:
    db.execute("ALTER TABLE users ADD COLUMN email TEXT")
    print("Added email column")

# Add role column if missing
if "role" not in cols:
    db.execute("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'voter'")
    print("Added role column")

# Add email_verified_at column if missing
if "email_verified_at" not in cols:
    db.execute("ALTER TABLE users ADD COLUMN email_verified_at TEXT")
    print("Added email_verified_at column")

# Add plan column if missing
if "plan" not in cols:
    db.execute("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'free'")
    print("Added plan column")

# Find admin user (old schema: is_admin=1)
admin = db.execute("SELECT * FROM users WHERE is_admin=1").fetchone()
if admin:
    db.execute(
        "UPDATE users SET email=?, role='admin' WHERE id=?",
        (ADMIN_EMAIL, admin["id"])
    )
    print(f"Set admin user id={admin['id']} email={ADMIN_EMAIL} role=admin")
else:
    # Try by id=1 fallback
    db.execute(
        "UPDATE users SET email=?, role='admin' WHERE id=1",
        (ADMIN_EMAIL,)
    )
    print(f"Set user id=1 email={ADMIN_EMAIL} role=admin (fallback)")

db.commit()

# Verify
rows = db.execute("SELECT id, name, email, role FROM users").fetchall()
print("\nUsers after migration:")
for r in rows:
    print(f"  id={r['id']} name={r['name']} email={r['email']} role={r['role']}")
