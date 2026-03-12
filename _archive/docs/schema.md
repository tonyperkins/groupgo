# GroupGo — Database Schema

**Version:** 1.1  
**Date:** March 2026  
**Engine:** SQLite 3 (WAL mode)

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Entity Relationship Diagram](#2-entity-relationship-diagram)
3. [Table Definitions](#3-table-definitions)
4. [Indexes](#4-indexes)
5. [Seed Data](#5-seed-data)
6. [Migration Strategy](#6-migration-strategy)

---

## 1. Design Principles

- **Generic naming** — Tables are named for the general concept (`events`, `sessions`) to support V2 event types without schema migration.
- **UTC everywhere** — All `DATETIME` columns store UTC ISO-8601 strings. Display formatting is handled in the application layer.
- **Soft references** — Foreign key constraints are defined but SQLite FK enforcement requires `PRAGMA foreign_keys = ON` at connection time (set in `db.py`).
- **Nullable V2 columns** — Columns needed for future features are included but nullable in V1, preventing future ALTER TABLE operations.
- **WAL mode** — `PRAGMA journal_mode=WAL` is set at DB init to allow concurrent reads during background fetch jobs.

---

## 2. Entity Relationship Diagram

```
┌──────────┐        ┌─────────────┐        ┌─────────────────┐        ┌──────────────┐
│  groups  │        │    users    │        │     polls        │        │   theaters   │
│──────────│        │─────────────│        │─────────────────│        │──────────────│
│ id (PK)  │◀──┐    │ id (PK)     │        │ id (PK)          │        │ id (PK)      │
│ name     │   └────│ group_id(FK)│        │ title            │        │ name         │
│created_at│        │ name        │        │ status           │        │ address      │
└──────────┘        │ token       │        │ target_dates     │        │ serpapi_query│
                    │ is_admin    │        │ winner_event_id  │──┐     │ is_active    │
                    │ email       │        │ winner_session_id│  │     │ created_at   │
                    │ created_at  │        │ created_at       │  │     └──────────────┘
                    └──────┬──────┘        │ updated_at       │  │            │
                           │               └────────┬─────────┘  │            │
                           │                        │            │            │
                           │               ┌────────▼─────────┐  │   ┌────────▼────────┐
                           │               │  poll_events     │  │   │    sessions     │
                           │               │  (junction)      │  │   │─────────────────│
                           │               │──────────────────│  │   │ id (PK)         │
                           │               │ poll_id (FK)     │  │   │ event_id (FK)──┐│
                           │               │ event_id (FK)──┐ │  │   │ theater_id (FK)││
                           │               └──────────────── │─┘  │   │ session_date    ││
                           │                                 │    │   │ session_time    ││
                           │               ┌─────────────────▼─┐  │   │ format          ││
                           │               │      events       │  │   │ is_included     ││
                           │               │───────────────────│  │   │ booking_url     ││
                           │               │ id (PK)           │  │   │ fetch_timestamp ││
                           │               │ tmdb_id           │  │   │ fetch_status    ││
                           │               │ title             │  │   │ is_custom       ││
                           │               │ ...               │  └───│ id (ref)        ││
                           │               └───────────────────┘      │ created_at      ││
                           │                                           └─────────────────┘│
                           │                                                               │
                           │        ┌──────────────────────────────────────────────────────┘
                           │        │
                           │  ┌─────▼──────────────────────┐
                           └──│          votes             │
                              │────────────────────────────│
                              │ id (PK)                    │
                              │ user_id (FK)               │
                              │ poll_id (FK)               │
                              │ target_type [event|session]│
                              │ target_id                  │
                              │ vote_value                 │
                              │ voted_at                   │
                              │ updated_at                 │
                              └────────────────────────────┘

┌───────────────────────────────┐     ┌────────────────────────────┐
│     user_poll_preferences     │     │       db_version           │
│───────────────────────────────│     │────────────────────────────│
│ user_id (FK, PK)              │     │ version (PK)               │
│ poll_id (FK, PK)              │     │ applied_at                 │
│ is_flexible                   │     └────────────────────────────┘
│ has_completed_voting          │
│ updated_at                    │
└───────────────────────────────┘
```

---

## 3. Table Definitions

### 3.1 `groups`

Organizes voters into groups (for future multi-group support).

```sql
CREATE TABLE IF NOT EXISTS groups (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

On first init, a default group `(id=1, name="Default Group")` is seeded.

---

### 3.2 `users`

```sql
CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    token       TEXT    UNIQUE,             -- UUID, set on first identity selection
    is_admin    INTEGER NOT NULL DEFAULT 0, -- 1 = admin, 0 = voter
    email       TEXT,                       -- nullable; for V2 notifications
    group_id    INTEGER REFERENCES groups(id),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment surrogate key |
| `name` | TEXT | Display name (e.g., "Tony") |
| `token` | TEXT UNIQUE | UUID generated on first "who are you?" selection. NULL until first visit. |
| `is_admin` | INTEGER | Boolean flag. Stored as 0/1 per SQLite convention. |
| `email` | TEXT | Nullable. Used for V2 notifications. |
| `group_id` | INTEGER | FK to `groups`. Added via schema migration. |
| `created_at` | TEXT | UTC ISO-8601 |

> **Seed data:** Only `Admin` (is_admin=1) is seeded on first run. All other members are added via the Admin → Members page.

---

### 3.3 `polls`

```sql
CREATE TABLE IF NOT EXISTS polls (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT    NOT NULL,
    status              TEXT    NOT NULL DEFAULT 'DRAFT'
                                CHECK(status IN ('DRAFT','OPEN','CLOSED','ARCHIVED')),
    target_dates        TEXT    NOT NULL,  -- JSON array: ["2026-03-14", "2026-03-15"]
    winner_event_id     INTEGER REFERENCES events(id),
    winner_session_id   INTEGER REFERENCES sessions(id),
    created_at          TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `title` | TEXT | Human-readable, e.g., "Weekend of March 14" |
| `status` | TEXT | Enum: `DRAFT`, `OPEN`, `CLOSED`, `ARCHIVED` |
| `target_dates` | TEXT | JSON array of ISO date strings |
| `winner_event_id` | INTEGER | FK to `events.id`; set when admin declares winner |
| `winner_session_id` | INTEGER | FK to `sessions.id`; set when admin declares winner |
| `created_at` | TEXT | UTC |
| `updated_at` | TEXT | UTC |

> **Business rules:**
> - Only one poll may have `status = 'OPEN'` at a time (enforced at application layer).
> - Admin may reopen a `CLOSED` or `ARCHIVED` poll, which resets `winner_event_id` and `winner_session_id` to NULL.

---

### 3.4 `events`

Represents a movie (or future: any group event).

```sql
CREATE TABLE IF NOT EXISTS events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tmdb_id         INTEGER UNIQUE,         -- NULL for custom events
    title           TEXT    NOT NULL,
    year            INTEGER,
    synopsis        TEXT,
    poster_path     TEXT,                   -- TMDB relative path: /abc123.jpg
    trailer_key     TEXT,                   -- YouTube video ID
    tmdb_rating     REAL,                   -- 0.0–10.0
    runtime_mins    INTEGER,
    genres          TEXT,                   -- JSON array: ["Action", "Sci-Fi"]
    is_custom_event INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| Column | Type | Notes |
|--------|------|-------|
| `tmdb_id` | INTEGER UNIQUE | NULL for manually-entered custom events |
| `poster_path` | TEXT | TMDB path, prepend `https://image.tmdb.org/t/p/w500` |
| `trailer_key` | TEXT | YouTube video ID; NULL if unavailable |
| `genres` | TEXT | JSON array |
| `is_custom_event` | INTEGER | Boolean; 0 = movie from TMDB, 1 = custom V2 event |

---

### 3.5 `poll_events`

Junction table linking polls to events (many-to-many).

```sql
CREATE TABLE IF NOT EXISTS poll_events (
    poll_id     INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    added_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (poll_id, event_id)
);
```

---

### 3.6 `theaters`

```sql
CREATE TABLE IF NOT EXISTS theaters (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    address         TEXT,
    serpapi_query   TEXT    NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| Column | Type | Notes |
|--------|------|-------|
| `serpapi_query` | TEXT | Tuned query string used for SerpApi movie showtime lookup |
| `is_active` | INTEGER | Toggle without deletion; inactive theaters excluded from fetches |

---

### 3.7 `sessions`

Represents a specific showtime at a specific theater on a specific date.

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    theater_id      INTEGER NOT NULL REFERENCES theaters(id) ON DELETE CASCADE,
    poll_id         INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    session_date    TEXT    NOT NULL,  -- ISO date: "2026-03-14"
    session_time    TEXT    NOT NULL,  -- 24h time string: "19:00"
    format          TEXT    NOT NULL DEFAULT 'Standard'
                            CHECK(format IN ('Standard','3D','IMAX','Dolby','Laser','D-BOX','4DX')),
    is_included     INTEGER NOT NULL DEFAULT 1,  -- Admin can exclude without deleting
    booking_url     TEXT,
    raw_serpapi     TEXT,
    fetch_timestamp TEXT,
    fetch_status    TEXT    NOT NULL DEFAULT 'pending'
                            CHECK(fetch_status IN ('pending','success','partial','failed','manual')),
    is_custom       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| Column | Type | Notes |
|--------|------|-------|
| `session_date` | TEXT | ISO 8601: `YYYY-MM-DD` |
| `session_time` | TEXT | 24-hour: `HH:MM` |
| `format` | TEXT | Normalized from raw string keywords |
| `is_included` | INTEGER | When 0, session is hidden from voter logistics and excluded from results. Admin can toggle per-session. |
| `booking_url` | TEXT | Nullable in V1 |
| `raw_serpapi` | TEXT | Raw JSON blob for debugging |
| `fetch_timestamp` | TEXT | Last fetch time |
| `fetch_status` | TEXT | Quality of data for this session |
| `is_custom` | INTEGER | 1 = manually entered by admin |

> **Deduplication key:** `(event_id, theater_id, poll_id, session_date, session_time, format)`

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_session
ON sessions (event_id, theater_id, poll_id, session_date, session_time, format);
```

---

### 3.8 `votes`

Unified vote table for both movie votes and logistics votes.

```sql
CREATE TABLE IF NOT EXISTS votes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    poll_id     INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    target_type TEXT    NOT NULL CHECK(target_type IN ('event', 'session')),
    target_id   INTEGER NOT NULL,
    vote_value  TEXT    NOT NULL
                        CHECK(vote_value IN ('yes','no','can_do','cant_do','abstain')),
    voted_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| Column | Type | Notes |
|--------|------|-------|
| `target_type` | TEXT | `'event'` for movie votes, `'session'` for logistics votes |
| `target_id` | INTEGER | `events.id` or `sessions.id` |
| `vote_value` | TEXT | `yes`/`no`/`abstain` for events; `can_do`/`cant_do`/`abstain` for sessions |

> **Note:** The `is_flexible` flag was removed from `votes`. Flexible mode and voting completion are now tracked in `user_poll_preferences`.

> **Upsert key:** `(user_id, poll_id, target_type, target_id)`

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_vote
ON votes (user_id, poll_id, target_type, target_id);
```

---

### 3.9 `user_poll_preferences`

Per-user, per-poll preference flags. Decouples meta-state from individual vote records.

```sql
CREATE TABLE IF NOT EXISTS user_poll_preferences (
    user_id               INTEGER NOT NULL REFERENCES users(id),
    poll_id               INTEGER NOT NULL REFERENCES polls(id),
    is_flexible           INTEGER NOT NULL DEFAULT 0,
    has_completed_voting  INTEGER NOT NULL DEFAULT 0,
    updated_at            TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, poll_id)
);
```

| Column | Type | Notes |
|--------|------|-------|
| `is_flexible` | INTEGER | 1 = voter activated "I'm In — Whatever You Choose" bypass. Counts as full approval for all combinations; excluded from all veto checks. |
| `has_completed_voting` | INTEGER | 1 = voter explicitly clicked "Done Voting" button. Marks them as `fully_voted` in participation tracking regardless of individual session votes. |

> **Participation logic:** A user is considered "fully voted" if ANY of these is true:
> 1. `is_flexible = 1`
> 2. `has_completed_voting = 1`
> 3. They have voted on all events AND all `is_included` sessions for movies they voted "yes" on

---

### 3.10 `fetch_jobs`

Tracks background showtime fetch jobs for admin progress display.

```sql
CREATE TABLE IF NOT EXISTS fetch_jobs (
    id              TEXT    PRIMARY KEY,   -- UUID job ID
    poll_id         INTEGER NOT NULL REFERENCES polls(id),
    total_tasks     INTEGER NOT NULL DEFAULT 0,
    completed_tasks INTEGER NOT NULL DEFAULT 0,
    failed_tasks    INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    status          TEXT    NOT NULL DEFAULT 'running'
                            CHECK(status IN ('running','complete','failed')),
    started_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    finished_at     TEXT
);
```

---

### 3.11 `db_version`

```sql
CREATE TABLE IF NOT EXISTS db_version (
    version     INTEGER PRIMARY KEY,
    applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 4. Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_users_token ON users (token);
CREATE INDEX IF NOT EXISTS idx_polls_status ON polls (status);
CREATE INDEX IF NOT EXISTS idx_sessions_poll ON sessions (poll_id);
CREATE INDEX IF NOT EXISTS idx_sessions_event ON sessions (event_id);
CREATE INDEX IF NOT EXISTS idx_votes_poll ON votes (poll_id);
CREATE INDEX IF NOT EXISTS idx_votes_user_poll ON votes (user_id, poll_id);
```

---

## 5. Seed Data

On first `init_db()` run:

```sql
-- Default group
INSERT OR IGNORE INTO groups (id, name) VALUES (1, 'Default Group');

-- Admin user only — all other members are added via Admin → Members UI
INSERT OR IGNORE INTO users (id, name, is_admin) VALUES (1, 'Admin', 1);

-- Seed theaters (customize before first run in app/db.py SEED_THEATERS)
INSERT OR IGNORE INTO theaters (name, address, serpapi_query, is_active) VALUES
    ('Cinemark Cedar Park',
     '3000 E Whitestone Blvd, Cedar Park, TX 78613',
     'Cinemark Cedar Park Texas showtimes',
     1);
```

Additional family members and theaters are managed entirely through the Admin UI (Members page, Theaters page) — no SQL required.

---

## 6. Migration Strategy

New columns on existing tables are added at startup via `_add_column_if_missing()` in `db.py`. Current migrations applied:

```python
_add_column_if_missing(db, "users", "group_id", "INTEGER REFERENCES groups(id)")
_add_column_if_missing(db, "sessions", "is_included", "INTEGER NOT NULL DEFAULT 1")
_add_column_if_missing(db, "user_poll_preferences", "has_completed_voting", "INTEGER NOT NULL DEFAULT 0")
```

This approach is safe to run on existing databases — it silently skips columns that already exist.
