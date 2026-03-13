# GroupGo — Windsurf Handoff Brief
> Complete context for continuing development. Last updated: March 2026.
> Read this before touching any file.

---

## What This Project Is

GroupGo is a family movie-night coordinator. An admin curates a shortlist of movies + showtimes, publishes a poll, and family members vote from their phones. The app surfaces the optimal movie+showtime combination based on approval voting with veto power.

**Live URL:** https://groupgo.org (Cloudflare Tunnel → self-hosted Docker on Portainer)

**Stack:**
- Python 3.12 + FastAPI + SQLModel + SQLite
- Jinja2 + HTMX for the admin portal (stable — don't refactor)
- React 18 + Vite + TypeScript for the voter SPA (`voter-spa/`)
- Docker + Portainer, deployed via `docker compose up -d --build`

**Repo:** `master` branch, git remote is GitHub (`tonyperkins/groupgo`)

---

## Repository Structure

```
groupgo/
├── app/
│   ├── config.py               # Pydantic settings — reads .env
│   ├── db.py                   # SQLite init, seed data, get_db dependency
│   ├── main.py                 # FastAPI app entry point
│   ├── models.py               # SQLModel ORM models (source of truth)
│   ├── templates_config.py     # Jinja2 env + custom filters
│   ├── middleware/
│   │   ├── auth.py             # HTTP Basic Auth for admin (verify_admin)
│   │   └── identity.py         # Cookie-based voter identity helpers
│   ├── routers/
│   │   ├── admin.py            # Admin page routes (Jinja2)
│   │   ├── voter.py            # Voter page routes + SPA serving
│   │   └── api.py              # All JSON + HTMX API endpoints (~1480 lines)
│   ├── services/
│   │   ├── vote_service.py     # Core voting logic, scoring, participation
│   │   ├── movie_service.py    # TMDB search + poll event queries
│   │   ├── showtime_service.py # Session grouping, SerpApi parsing
│   │   ├── theater_service.py  # Theater CRUD
│   │   └── security_service.py # Tokens, PINs, cookies, invite URLs
│   └── tasks/
│       └── fetch_tasks.py      # Async SerpApi showtime fetch jobs
├── voter-spa/                  # React SPA (Vite + TypeScript)
│   ├── src/
│   │   ├── App.tsx             # Root — handles browse/active/results states
│   │   ├── api/
│   │   │   ├── client.ts       # fetch wrapper (credentials: include)
│   │   │   ├── voter.ts        # VoterMeResponse type + voterApi
│   │   │   └── votes.ts        # votesApi (cast, flexible, complete, participation)
│   │   ├── components/
│   │   │   ├── AppHeader.tsx
│   │   │   ├── TabBar.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── DiscoverTab.tsx
│   │   │   ├── VoteTab.tsx
│   │   │   ├── ResultsTab.tsx
│   │   │   ├── StatusChip.tsx
│   │   │   ├── VoteFooter.tsx
│   │   │   ├── OptOutModal.tsx
│   │   │   ├── ScrollArea.tsx
│   │   │   └── Toast.tsx
│   │   └── tokens.ts           # Color constants (C.bg, C.accent, etc.)
│   └── package.json
├── static/voter/               # Built SPA output (committed, served by FastAPI)
├── templates/
│   ├── admin/                  # Admin Jinja2 templates
│   ├── voter/
│   │   ├── join_poll.html      # PIN entry page (Jinja2 — keep, part of auth flow)
│   │   ├── no_poll.html        # Shown when no active poll
│   │   └── identify.html      # Legacy dev-only identity picker
│   └── components/             # HTMX partials (admin only — voter ones deprecated)
├── docs/
│   ├── groupgo-windsurf-handoff.md  # ← this file
│   ├── groupgo-voter-flow-spec.md   # Original voter flow spec (reference)
│   └── groupgo-voter-flow.jsx       # Original 25-screen React mockup (reference)
├── scripts/                    # One-off debug/maintenance scripts
├── .env                        # Active env file (gitignored)
├── .env.development            # Dev settings template
├── .env.production             # Production settings (gitignored)
├── .env.production.example     # Production settings template (committed)
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

---

## Data Model (`app/models.py`)

```python
Group         id, name, access_code, default_theater_ids, created_at

User          id, name, token, member_pin(4-digit str), is_admin, role,
              email, group_id(FK→Group), created_at

Poll          id, title, status(DRAFT|OPEN|CLOSED|ARCHIVED),
              access_uuid(UUID str — invite token),
              group_id(FK→Group — filters which users can vote),
              voting_closes_at, winner_event_id, winner_session_id,
              created_at, updated_at

PollDate      poll_id, date(YYYY-MM-DD)   (target dates for the poll)

Event         id, tmdb_id, title, year, synopsis, poster_path, trailer_key,
              tmdb_rating, runtime_mins, genres(JSON), rating,
              event_type, image_url, external_url, venue_name, is_custom_event

PollEvent     poll_id, event_id, sort_order   (junction table)

Theater(Venue) id, name, address, website_url, serpapi_query, is_active

Showtime      id, event_id, theater_id, poll_id, session_date(YYYY-MM-DD),
              session_time(HH:MM), format, booking_url,
              is_custom, is_included(bool — admin toggles visibility)

Vote          id, user_id, poll_id, target_type(event|session), target_id,
              vote_value(yes|no|abstain|can_do|cant_do), veto_reason

UserPollPreference  user_id, poll_id, is_flexible, has_completed_voting,
                    is_participating, opt_out_reason

FetchJob      id(UUID), poll_id, total_tasks, completed_tasks, status,
              last_error, finished_at
```

**Important:** SQLite + `CREATE TABLE IF NOT EXISTS`. No migration tool. Adding columns to an existing DB requires `ALTER TABLE ... ADD COLUMN` run directly against the SQLite file, or dropping the file and re-seeding for dev.

---

## Voter Flow (Current — March 2026)

```
1. Admin publishes poll → access_uuid generated
2. Admin clicks "Invite Link" → copies /join/{access_uuid}
3. Voter opens link → /join/{uuid} sets gg_browse_poll_id cookie → redirects to /vote/movies
4. SPA loads → GET /api/voter/me returns state="browse" (no PIN required)
5. Voter sees Discover tab + golden "Join to Vote" banner
6. Voter clicks "Join to Vote" → navigates to /join/{uuid}/enter (PIN entry page)
7. Voter enters 4-digit PIN → POST /join/{uuid}/enter
   - Validates PIN against users.member_pin
   - Validates user.group_id == poll.group_id (if poll has a group)
   - Sets gg_poll_session cookie (JWT: poll_id + user_id)
   - Clears gg_browse_poll_id cookie
   - Redirects to /vote/movies
8. SPA loads → GET /api/voter/me returns state="active" with full user + votes
9. Voter browses Discover tab → votes movies → votes showtimes → submits
```

### Auth cookies

| Cookie | Contents | Set by | Used by |
|--------|----------|--------|---------|
| `gg_poll_session` | JWT {poll_id, user_id} | PIN submit (`/join/{uuid}/enter`) | `get_secure_poll_id`, `get_current_user` |
| `gg_browse_poll_id` | poll_id (int string) | `/join/{uuid}` GET | `_get_browse_poll_id` in voter.py + api.py |
| `token` | user token (legacy) | `/identify` (dev only) | `get_current_user` fallback |

**Secure flag:** Cookies are set with `Secure=True` only when `APP_BASE_URL` starts with `https://`. Controlled by `settings.use_https_cookies` in `app/config.py`.

---

## Group-Based Access Control

- `Poll.group_id` filters which users can join and are counted in participation.
- `vote_service._get_poll_group_users(poll_id, db)` returns only users in the poll's group (or all users if `group_id` is None).
- PIN validation in `/join/{uuid}/enter` rejects users whose `group_id != poll.group_id`.
- `get_participation()` and `_load_result_inputs()` both use `_get_poll_group_users`.
- Admin can set/change a poll's group via the **Group** button in the dashboard → `PATCH /api/admin/polls/{id}`.

---

## SPA States (`/api/voter/me` → `state` field)

| State | Meaning | User field | Triggered when |
|-------|---------|------------|----------------|
| `browse` | Viewing without PIN | `null` | `gg_browse_poll_id` cookie present, no `gg_poll_session` |
| `active` | Authenticated voter | `VoterUser` | `gg_poll_session` cookie valid |
| `no_active_poll` | Authenticated but no poll | `VoterUser` | User authenticated, no OPEN/CLOSED poll |

On `401` from `/api/voter/me` (no cookies at all) → SPA redirects to `/no-poll`.

---

## Key API Endpoints

### Voter-facing JSON (used by React SPA)

```
GET  /api/voter/me                       → bootstrap: user + poll + votes + events + sessions
POST /api/voter/votes/movie              → cast event vote {event_id, vote, veto_reason}
POST /api/voter/votes/session            → cast session vote {session_id, vote}
POST /api/voter/votes/flexible           → {is_flexible: bool}
POST /api/voter/votes/complete           → {is_complete: bool}
POST /api/voter/votes/participation      → {is_participating: bool, opt_out_reason?}
GET  /api/results/json                   → ranked results + participation (requires auth)
GET  /api/voter/events/{id}/reviews      → movie reviews (TMDB)
```

### Admin JSON endpoints

```
GET    /api/admin/groups                 → list groups
POST   /api/admin/groups                 → create group
DELETE /api/admin/groups/{id}            → delete group
GET    /api/admin/users                  → list users (with group names + PINs)
POST   /api/admin/users                  → create user
PATCH  /api/admin/users/{id}             → update user (name, email, group_id, role, pin)
DELETE /api/admin/users/{id}             → delete user
POST   /api/admin/polls                  → create poll {title, target_dates, group_id?}
PATCH  /api/admin/polls/{id}             → update poll {title?, group_id?}
POST   /api/admin/polls/{id}/publish     → DRAFT → OPEN (requires movies + showtimes)
POST   /api/admin/polls/{id}/invite-link → get/generate invite URL
POST   /api/admin/polls/{id}/regenerate-invite → new access_uuid (invalidates old link)
POST   /api/admin/polls/{id}/close       → OPEN → CLOSED
POST   /api/admin/polls/{id}/reopen      → CLOSED/ARCHIVED → OPEN
POST   /api/admin/polls/{id}/archive     → CLOSED → ARCHIVED
POST   /api/admin/polls/{id}/declare-winner → set winner_event_id + winner_session_id
DELETE /api/admin/polls/{id}             → hard delete (cascades votes, sessions, etc.)
POST   /api/admin/showtimes/fetch        → trigger SerpApi fetch job
GET    /api/admin/jobs/{id}/json         → poll fetch job status
```

---

## Environment Configuration

`.env` is the active file (gitignored). Copy from `.env.development` or `.env.production` as needed.

Key variables:

```
APP_ENV=production            # "production" or "development"
APP_BASE_URL=https://groupgo.org  # MUST be https:// for secure cookies in prod
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
DATABASE_URL=sqlite:///./data/groupgo.db
TMDB_API_KEY=...              # for movie search
SERPAPI_KEY=...               # for showtime fetching
SECRET_KEY=...                # for JWT signing
```

`settings.use_https_cookies` = True when `APP_BASE_URL` starts with `https://`
`settings.is_production` = True when `APP_ENV == "production"`

---

## Building the SPA

The built SPA is committed to `static/voter/` and served directly by FastAPI. You must rebuild and commit after any `voter-spa/src/` changes.

```powershell
cd voter-spa
npm run build          # outputs to ../static/voter/
cd ..
git add static/voter/
git commit -m "build: update voter SPA"
```

---

## Deployment

See `docs/release-process.md` for the full workflow. Quick summary:

```powershell
# Build SPA if changed
cd voter-spa && npm run build && cd ..

# Commit + push
git add -A
git commit -m "..."
git push origin master

# Deploy on server
ssh user@portainer.homelab.lan "cd /opt/groupgo && git pull origin master && docker compose up -d --build"
```

---

## Known Patterns & Gotchas

- **No Alembic migrations.** Adding a column = `ALTER TABLE x ADD COLUMN y TYPE DEFAULT z` run against the SQLite file on the server, OR drop + recreate the DB (loses data).
- **SerpApi quota.** The fetch job uses SerpApi for showtimes. Free tier = 100 searches/month. Each fetch = 1 search per (movie × theater × date).
- **`access_uuid` is the invite token.** Regenerating it via `POST /api/admin/polls/{id}/regenerate-invite` immediately invalidates all existing links.
- **HTMX vote endpoints** (`/api/votes/*`) are deprecated but kept alive. Do not extend them. The React SPA uses `/api/voter/votes/*` instead.
- **`is_included`** on Showtime controls whether a session appears in the voter SPA. Admin toggles these on the showtimes page.
- **`get_participation()` is group-aware.** It only counts users in `poll.group_id` (if set). Displayed in both admin dashboard and SPA results.
- **Browse mode.** Voters can see the poll (Discover tab only) without a PIN. They can only vote after entering their PIN via the "Join to Vote" banner.
- **Cookie `Secure` flag.** Must use `https://` in `APP_BASE_URL` for cookies to work in production. This is why the production `.env` has `APP_BASE_URL=https://groupgo.org`.

---

## Pending / Known Gaps

- `voting_closes_at` field exists on Poll model and is serialized to the SPA, but no UI to set it and no enforcement logic yet.
- `/api/results/json` still requires full auth (not browse-mode accessible). Results tab in browse mode will 401.
- The old HTMX voter templates (`templates/voter/movies.html`, `logistics.html`, etc.) are still present but unused — safe to delete eventually.
- No Playwright tests for the React SPA yet.
