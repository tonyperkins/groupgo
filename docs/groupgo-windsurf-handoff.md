# GroupGo — Development Reference
> Single source of truth for Claude (planning) and Windsurf (implementation).
> Last updated by: Claude, March 2026.
>
> **Windsurf:** Before starting any session, run `/groupgo-sync` or `git pull origin master`.
> Complete all items in `## Pending — Next Session`, then follow the
> instructions in `## Implementation Prompt` to mark tasks done and push.

---

## What This Project Is

GroupGo is a family movie-night coordinator — and in V2, a generic group activity planner. An admin curates a shortlist of events + time slots, publishes a poll, and group members vote from their phones. The app surfaces the optimal event+time combination based on approval voting with veto power.

**Live URL:** https://groupgo.org (Cloudflare Tunnel → self-hosted Docker on Portainer)

**Stack:**
- Python 3.12 + FastAPI + SQLModel + SQLite
- Jinja2 + HTMX for the admin portal (stable — don't refactor)
- React 18 + Vite + TypeScript for the voter SPA (`voter-spa/`)
- Docker + Portainer, deployed via `docker compose up -d --build`

**Repo:** `master` branch, git remote is GitHub (`tonyperkins/groupgo`)
**Deployment:** Docker on Portainer (self-hosted). Stack managed via `docker compose up -d --build` from `/opt/groupgo` on the server, or as a Portainer Git-backed stack (Repository → `https://github.com/tonyperkins/groupgo`, branch `master`, compose path `docker-compose.yml`).

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
│   │   ├── auth.py             # Cookie-based admin auth (magic link)
│   │   └── identity.py         # Cookie-based voter identity helpers
│   ├── routers/
│   │   ├── admin.py            # Admin page routes (Jinja2)
│   │   ├── voter.py            # Voter page routes + SPA serving
│   │   └── api.py              # All JSON + HTMX API endpoints
│   ├── services/
│   │   ├── vote_service.py     # Core voting logic, scoring, participation
│   │   ├── movie_service.py    # TMDB search + poll event queries
│   │   ├── showtime_service.py # Session grouping, SerpApi parsing
│   │   ├── theater_service.py  # Theater CRUD
│   │   ├── auth_service.py     # Magic link + admin session management
│   │   └── security_service.py # Tokens, PINs, cookies, invite URLs
│   └── tasks/
│       └── fetch_tasks.py      # Async SerpApi showtime fetch jobs
├── voter-spa/                  # React SPA (Vite + TypeScript)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   ├── voter.ts
│   │   │   └── votes.ts
│   │   ├── components/
│   │   │   ├── AppHeader.tsx
│   │   │   ├── TabBar.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── DiscoverTab.tsx
│   │   │   ├── VoteTab.tsx
│   │   │   ├── ResultsTab.tsx
│   │   │   ├── StatusChip.tsx
│   │   │   ├── VoteFooter.tsx
│   │   │   ├── SideNav.tsx
│   │   │   ├── OptOutModal.tsx
│   │   │   ├── ScrollArea.tsx
│   │   │   └── Toast.tsx
│   │   └── tokens.ts
│   └── package.json
├── static/voter/               # Built SPA output (committed, served by FastAPI)
├── templates/
│   ├── admin/
│   ├── voter/
│   │   ├── join_poll.html      # PIN entry (Jinja2 — keep, part of auth flow)
│   │   ├── no_poll.html
│   │   └── identify.html      # Legacy dev-only
│   └── components/             # HTMX partials (admin only)
├── docs/
│   └── groupgo-windsurf-handoff.md  # this file
├── .windsurf/workflows/
│   ├── groupgo-session.md      # /groupgo-session — full impl session
│   └── groupgo-sync.md         # /groupgo-sync — context sync only
├── .env                        # Active env (gitignored)
├── .env.development
├── .env.production.example
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
              access_uuid(UUID str), group_id(FK→Group),
              voting_closes_at, winner_event_id, winner_session_id,
              created_at, updated_at

PollDate      poll_id, date(YYYY-MM-DD)

Event         id, tmdb_id, title, year, synopsis, poster_path, trailer_key,
              tmdb_rating, runtime_mins, genres(JSON), rating,
              event_type, image_url, external_url, booking_url, venue_name, is_custom_event

PollEvent     poll_id, event_id, sort_order

Venue         id, name, address, website_url, serpapi_query, is_active,
              latitude, longitude, google_place_id
              (__tablename__ = "theaters" for migration compat)

Showtime      id, event_id, theater_id(nullable), poll_id,
              session_date(YYYY-MM-DD), session_time(HH:MM), format,
              booking_url, is_custom, is_included

Vote          id, user_id, poll_id, target_type(event|session), target_id,
              vote_value(yes|no|abstain|can_do|cant_do), veto_reason

UserPollPreference  user_id, poll_id, is_flexible, has_completed_voting,
                    is_participating, opt_out_reason

FetchJob      id(UUID), poll_id, total_tasks, completed_tasks, status,
              last_error, finished_at

MagicLinkToken  token, user_id, purpose, expires_at, used_at
AuthSession     id, user_id, session_type, device_hint, expires_at,
                last_active_at, revoked_at
```

**No Alembic.** Adding columns = `ALTER TABLE x ADD COLUMN y TYPE DEFAULT z`.
Migration scripts live in `scripts/` and are idempotent. Run them via `docker exec` against `/data/groupgo.db` inside the container.
- `scripts/migrate_theater_id_nullable.py` — makes `Showtime.theater_id` nullable (already run on prod)
- `scripts/migrate_events_v2_columns.py` — adds v2 generic-event columns to `events` table (already run on prod); accepts DB path as first argument

---

## Auth System

### Admin auth (magic link)
- Admin requests login link via email → `auth_service.send_admin_magic_link()`
- In production: sends via Gmail SMTP (`SMTP_*` env vars)
- In development: logs link to stdout with `━━ MAGIC LINK ━━` banner
- Token: single-use UUID, 15-minute TTL, purpose-scoped
- Session: 30-day cookie (`gg_admin_session`), server-side `AuthSession` record

### Voter auth (PIN)
- Voter opens `/join/{access_uuid}` → `gg_browse_poll_id` cookie **always overwritten** → browse mode
- Voter enters 4-digit PIN → `gg_poll_session` JWT cookie (poll_id + user_id)

| Cookie | Contents | State |
|--------|----------|-------|
| `gg_poll_session` | JWT {poll_id, user_id} | active voter |
| `gg_browse_poll_id` | poll_id string | browse mode |

---

## SPA States

| State | Meaning |
|-------|---------|
| `browse` | `gg_browse_poll_id` cookie, no session |
| `active` | `gg_poll_session` valid |
| `no_active_poll` | No OPEN/CLOSED poll |

---

## Key API Endpoints

### Voter-facing JSON
```
GET  /api/voter/me
POST /api/voter/votes/movie
POST /api/voter/votes/session
POST /api/voter/votes/flexible
POST /api/voter/votes/complete
POST /api/voter/votes/participation
GET  /api/results/json
GET  /api/voter/events/{id}/reviews
```

### Admin JSON
```
POST   /api/admin/polls
PATCH  /api/admin/polls/{id}          # accepts title, dates, group_id
POST   /api/admin/polls/{id}/publish      # body: {send_email: bool} defaults true
POST   /api/admin/polls/{id}/send-email   # body: {user_ids?: int[]} — sends invite to selected/all members
POST   /api/admin/polls/{id}/invite-link
POST   /api/admin/polls/{id}/close
POST   /api/admin/polls/{id}/declare-winner
DELETE /api/admin/polls/{id}
POST   /api/admin/showtimes/fetch
GET    /api/admin/jobs/{id}/json
POST   /api/admin/events/lookup       # event enrichment — currently SerpApi (see Pending #1)
PATCH  /api/admin/events/{id}         # edit manual event fields (blocks TMDB events with 403)
GET/POST/DELETE /api/admin/groups
GET/POST/PATCH/DELETE /api/admin/users
```

---

## Design Tokens (`voter-spa/src/tokens.ts`)

```typescript
export const C = {
  bg: "#0A0A0F", surface: "#111118", card: "#16161F",
  border: "#252535", borderLight: "#333348", borderTap: "#4A4A6E",
  accent: "#E8A020", accentDim: "#7A5510", accentGlow: "rgba(232,160,32,0.15)",
  green: "#22C55E", greenDim: "#14532D",
  red: "#EF4444", redDim: "#450A0A",
  blue: "#3B82F6", blueDim: "#1E3A5F",
  text: "#F0EEE8", textMuted: "#9A9AAE", textDim: "#6A6A80",
  locked: "#2A2A3E",
} as const;

export const FS = {
  xs: 11, sm: 13, base: 16, md: 17, lg: 19, xl: 22, h1: 26,
} as const;
```

---

## Visual Polish — Tappable vs Disabled Affordances

- `#1E1E2E` / `#2A2A3E` = structural, non-interactive
- `#4A4A6E` = unselected but tappable
- `#22C55E` = selected/active
- `opacity: 0.65` + `#2A2A3E` = locked/disabled

Full row is tappable. `pointer-events: none` on toggle only in locked state.

---

## Status Chip & Vote Tab Footer

### StatusChip states

| State | Label | Colors | Tap |
|-------|-------|--------|-----|
| preview | `JOIN →` | bg `#1E3A5F`, border/text `#3B82F6` | Direct join |
| voting | `VOTING ▾` | bg `#7A5510`, border/text `#E8A020` | Popover |
| editing | `EDITING ▾` | bg `#7A5510`, border/text `#E8A020` | Popover |
| submitted | `✓ DONE ▾` | bg `#14532D`, border/text `#22C55E` | Popover |

### VoteTabFooter

| State | Primary | Secondary |
|-------|---------|-----------|
| voting + has selections | `Submit vote →` (amber) | `Opt out` (ghost) |
| editing | `Resubmit →` (amber) | `Cancel` (ghost) |
| others | hidden | — |

---

## Vote Tab — Submitted State

Info card when locked:
```
🔒  Your vote is locked in
    Tap ✓ DONE above to change your selections or opt out.
```
Cards: `opacity: 0.65`, border `#1E1E2E`, toggle muted. Pass `isLocked` prop from VoteTab down.

---

## Environment

```
APP_ENV=production
APP_BASE_URL=https://groupgo.org
DATABASE_URL=sqlite:///./data/groupgo.db
TMDB_API_KEY=...
SERPAPI_KEY=...          # showtime scraping only
GOOGLE_KG_API_KEY=...    # event enrichment Find button (see Pending #1)
SECRET_KEY=...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=...
```

---

## Building & Deploying

See `.windsurf/workflows/release.md` for the full release workflow (`/release`).

Key steps:
```powershell
cd voter-spa && npm run build && cd ..   # only if voter-spa/src/ changed
git add -A && git commit -m "..." && git push origin master
scp .env.production asperkins65@portainer.homelab.lan:/opt/groupgo/.env
ssh asperkins65@portainer.homelab.lan "cd /opt/groupgo && git pull origin master && docker compose up -d --build"
```

**Admin seed** (fresh DB only):
```powershell
scp scripts/seed_admin.py asperkins65@portainer.homelab.lan:/tmp/seed_admin.py
ssh asperkins65@portainer.homelab.lan "docker cp /tmp/seed_admin.py groupgo:/app/seed_admin.py && docker exec groupgo python seed_admin.py"
```

**DB migration** (run inside container against volume-mounted DB):
```powershell
scp scripts/migrate_X.py asperkins65@portainer.homelab.lan:/tmp/migrate.py
ssh asperkins65@portainer.homelab.lan "docker cp /tmp/migrate.py groupgo:/tmp/migrate.py && docker exec groupgo python3 /tmp/migrate.py /data/groupgo.db"
```

---

## Gotchas

- No Alembic — `ALTER TABLE` or drop+recreate for schema changes
- Migration scripts must run inside the container (`docker exec`) — the DB lives in a Docker volume at `/data/groupgo.db`, not directly accessible on the host without sudo
- `.env.production` is **not in git** — must be `scp`'d to server as `.env` on every deploy (or after any `git reset --hard`)
- `docker-compose.yml` no longer uses `env_file` — all env vars come from `.env` on the host (which docker compose auto-loads) or from Portainer stack env UI
- SerpApi free tier = 100 searches/month — reserved for showtime scraping only
- `GOOGLE_KG_API_KEY` used for the "Find" button enrichment — free tier, no billing required
- `access_uuid` regeneration immediately invalidates all existing voter links
- HTMX vote endpoints (`/api/votes/*`) are deprecated — do not extend
- `is_included` on Showtime controls voter visibility
- Browse mode = Discover tab only, no voting
- `gg_browse_poll_id` is always overwritten on every `/join/{access_uuid}` visit
- Admin login SMTP errors now return a friendly error page instead of 500 — root cause will be in `docker logs groupgo`

---

## Known Gaps (non-session)

> **Events not appearing in Vote tab:** An event must have at least one time slot (`is_included = true`) to appear in the voter Vote tab. Events with no times show in Discover only. This is correct behavior but not obvious to admins — a future improvement would be a warning on the Events page for manual events with no times, similar to the existing "No showtimes" warning on movie events.

- `voting_closes_at` exists but no UI or enforcement
- `/api/results/json` 401s in browse mode
- Old HTMX voter templates still present but unused
- No Playwright tests for SPA yet

---

## V2 — Generalization

### Principles
- Showtime model, scoring algorithm, and auth unchanged
- Non-movie events get time slots added manually by admin
- `event.is_movie()` Python property gates movie-specific logic
- In Jinja2 templates use `event.event_type == "movie"` (can't call methods)
- TypeScript interface names and component names stay as-is

### What to NOT touch
- Showtime table schema (beyond theater_id nullable — already done)
- SerpApi fetch logic internals
- Scoring algorithm
- Auth system
- TMDB search and enrichment
- URL routes
- TypeScript interface names, component names

---

## Completed

### Session 11 — March 15, 2026
- `voter-spa/src/components/ShowtimeCard.tsx` — unchecked boxes now show empty square (no ✓ glyph); checked boxes remain green; unchecked border uses `C.borderLight`; locked state uses `C.locked` bg
- `voter-spa/src/components/ResultsTab.tsx` — voter pills now get tinted background + border matching their avatar color (e.g. Tony green, Bob amber)
- `voter-spa/src/components/StatusChip.tsx` — menu item padding increased to `18px 22px`; font bumped to `FS.md`; all 6 menu items across all chip states now have emoji icons
- `voter-spa/src/components/VoteTab.tsx` — locked banner fixed to use CSS vars (`C.card`, `C.text`, `C.textMuted`) instead of hardcoded dark hex values
- `app/routers/admin.py` — `admin_login_submit` now catches SMTP exceptions and returns friendly error page instead of 500; added `logging` import and `logger`
- `app/main.py` — global `@app.exception_handler(Exception)` added: HTML requests get a styled error page, API requests get JSON; all exceptions logged server-side
- `app/services/email_service.py` — added `send_poll_invite()` function for notifying members when a poll opens
- `app/routers/api.py` — publish endpoint now accepts `{send_email: bool}` body (defaults `true`), emails all scoped members on publish; new `POST /api/admin/polls/{id}/send-email` endpoint accepts `{user_ids?: int[]}`
- `templates/admin/dashboard.html` — Publish button now opens a modal with "Email all members" checkbox (default checked); OPEN poll overflow menu gains "📧 Send Email" item opening a member-select modal with select-all/deselect-all
- `docker-compose.yml` — removed `env_file` directive; all env vars now declared as `${VAR:-default}` substitutions — compatible with Portainer Git-backed stack env UI
- `scripts/migrate_events_v2_columns.py` — now accepts DB path as CLI argument; run on prod via `docker exec groupgo python3 /tmp/migrate.py /data/groupgo.db`
- `.windsurf/workflows/release.md` — added step 5 to `scp .env.production` to server before deploy; added note about `.env` not being in git
- **Production:** v2-generic-events merged to master; DB migrated (added `booking_url` to events table); deployed at https://groupgo.org

### Session 10 — March 15, 2026
- `app/models.py` — added `is_editing: bool = Field(default=False)` to `UserPollPreference`
- `app/services/vote_service.py` — `mark_voting_complete()`: when `is_complete=False` sets `is_editing=True` while keeping `has_completed_voting=True`; when `is_complete=True` sets `is_editing=False`; `get_user_poll_preferences()` now includes `is_editing` in returned dict
- `voter-spa/src/api/voter.ts` — added `is_editing: boolean` to `VoterPreferences` interface
  > ℹ️ DB migration run manually: `ALTER TABLE user_poll_preferences ADD COLUMN is_editing BOOLEAN DEFAULT 0`. No Alembic — per project convention.
- `voter-spa/src/components/ResultsTab.tsx` — added `onCancelEdit?: () => void` prop; Resubmit and Cancel now shown side-by-side when `isEditing && onCancelEdit`
- `voter-spa/src/App.tsx` — `onCancelEdit={handleCancelEdit}` wired to `<ResultsTab>`
- `templates/components/admin_movie_list.html` — events now sorted movies-first then non-movies with a subtle divider between groups
- `templates/admin/showtimes.html` — per-event sections now ordered movies-first then non-movies; "All cached times" section wrapped in `{% if movie_events %}` and hidden for non-movie-only polls
- `templates/admin/dashboard.html` — OPEN poll actions restructured into three tiers: nav row (Events/Times/Results), utility `⋯` overflow dropdown (Edit/Invite/Voters/Duplicate), destructive section (Clear Votes/Close/Delete) with divider; `toggleOverflowMenu()` JS added with outside-click dismissal
- `voter-spa/src/tokens.ts` — `C.*` values now reference CSS custom properties (`var(--gg-*)`); `applyTheme()` sets vars on `:root`; light palette defined
- `voter-spa/src/main.tsx` — reads `gg_theme` from localStorage and calls `applyTheme()` before first render
- `voter-spa/src/components/StatusChip.tsx` — theme toggle row (☀️/🌙) added at bottom of every popover state

### Session 9 — March 15, 2026
- `voter-spa/src/components/ResultsTab.tsx` — added `sessions` and `events` props; MY PENDING VOTE picks list now built from raw `personal_pick_keys` matched against sessions/events props instead of `results.filter(isMyPick)`; fixes unsubmitted picks never showing
- `voter-spa/src/App.tsx` — `sessions={state.meData?.sessions ?? []}` and `events={state.meData?.events ?? []}` passed to `<ResultsTab>`
- `voter-spa/src/components/ProgressBar.tsx` — `SEGMENTS` changed from `["Joined", "Voted", "Submitted"]` to `["Joined", "Selected", "Voted"]`
- `voter-spa/src/App.tsx` — `progressStep()` fixed: added `if (!prefs.is_participating) return 1` early exit so opted-out voters don't show SELECTED/VOTED state

### Session 8 — March 15, 2026
- `voter-spa/src/components/ResultsTab.tsx` — `GroupProgress`: renamed label "Group progress" → "Who's voted"; changed `useState(false)` → `useState(true)` so it defaults to collapsed

### Session 7 — March 15, 2026
- `app/routers/api.py` — `_ser_result()`: `voter_count` fixed from `r.get("score", 0)` to `len(r.get("voters", []))` — score and voter count are different values
- `voter-spa/src/components/ResultsTab.tsx` — `standingsCollapsed` init changed to `useState(true)`; added `useEffect` to auto-expand when `hasCompletedVoting && !isEditing`; removed `standingsDefaultExpanded` variable and all references; chevron and body visibility now driven solely by `!standingsCollapsed`
- `voter-spa/src/App.tsx` — `<ResultsTab>` now receives `isEditing={state.isEditing}` and `onSubmitVote={handleSubmit}`

### Session 6 — March 15, 2026
- `app/services/vote_service.py` — `_load_result_inputs()`: moved prefs query before votes query; filtered `vote_lookup` to only include votes from `submitted_user_ids` (users with `is_participating=true` AND `has_completed_voting=true`, plus flexible users); fixes "3/2 members" impossible counts
- `voter-spa/src/components/ResultsTab.tsx` — restructured into MY PENDING VOTE section (shown when OPEN + not submitted) and GROUP STANDINGS collapsible section; pulsing amber dot replaces "live · updates every 15s" text; dot briefly flashes white/bright on data change; "My Picks" filter renamed to "Mine"; `isEditing` and `onSubmitVote` added to `ResultsTabProps`
- `app/routers/api.py` — `clear-votes` endpoint now only deletes votes and resets prefs for users with `has_completed_voting=true`; users with unsubmitted in-progress selections are left untouched
- `templates/admin/dashboard.html` — clear-votes email checkbox defaults to `checked` (both HTML attribute and JS reset)
> ℹ️ `ResultsTab` now accepts optional `isEditing` and `onSubmitVote` props — wire `isEditing={state.isEditing}` and `onSubmitVote` from `App.tsx` if the submit-from-results flow is needed.

### Session 5 — March 15, 2026
- `voter-spa/src/components/VoteTab.tsx` — `pollId` wired into `VoteTab` destructured props; passed to `<EventGroup>` call site; accordion open/close state now persisted to `localStorage` keyed by `gg_collapsed_{pollId}_{eventId}`
- `voter-spa/src/App.tsx` — `pollId={state.meData?.poll?.id ?? 0}` passed to `<VoteTab>`

### Session 4 — March 15, 2026
- `app/models.py` — added `booking_url: Optional[str]` to `Event` model
- `app/routers/api.py` — `booking_url` added to `_serialize_event()` and `_ser_result()` (with `event_type`); `PATCH /api/admin/events/{id}` handles `booking_url`
- `voter-spa/src/api/voter.ts` — `booking_url` added to `VoterEvent`; `booking_url` and `event_type` added to `ResultsEntry.event`
- `templates/admin/movies.html` — "Booking / Tickets URL" field added to Other Event form; pre-populated in edit mode; included in PATCH payload
- `templates/components/admin_movie_list.html` — `data-booking-url` added to edit button
- `voter-spa/src/components/ResultsTab.tsx` — CTA replaced: uses `event.booking_url` (not session), shown only when CLOSED + booking_url set, label smart by event_type
- `voter-spa/src/components/VoteTab.tsx` — accordion defaults collapsed (expands if voter has can_do votes); location filter uses `venue_name` for non-movies; single-session inline path now shows date header
> ℹ️ Schema change: `ALTER TABLE events ADD COLUMN booking_url VARCHAR` — run on production after deploy.

### Session 3 — March 15, 2026
- `templates/components/admin_movie_list.html` — edit button: replaced inline `tojson` onclick args with `data-*` attributes to prevent JS syntax errors from special characters in event data
- `templates/admin/movies.html` — `enterEditMode` updated to accept a single `btn` element and read `btn.dataset.*` instead of positional arguments
- `templates/components/admin_movie_list.html` — added amber "No times" badge on non-movie event cards with no included time slots (same pattern as "No showtimes" badge on movie events)

### Session 2 — March 15, 2026
- `app/config.py` — added `GOOGLE_KG_API_KEY: str = ""`
- `app/routers/api.py` — `POST /api/admin/events/lookup` swapped from SerpApi to Google Knowledge Graph Search API (`kgsearch.googleapis.com/v1/entities:search`); extracts `image.contentUrl` and `detailedDescription.url` / `url` from KG results
- `.env.example` — added `ADMIN_EMAIL`, `ADMIN_NAME`, `SMTP_*`, `GOOGLE_KG_API_KEY` placeholders
- `.env.production.example` — added `GOOGLE_KG_API_KEY` placeholder
- `.env.development` removed from git tracking; added to `.gitignore`

### Session 1 — March 2026 (branch: v2-generic-events)
- `app/models.py` — `Event.is_movie()` property; `Showtime.theater_id` → `Optional[int]`
- `app/routers/api.py` — `is_movie` in `_serialize_event()` and `_ser_result()`; `PATCH /api/admin/events/{id}`; `POST /api/admin/events/lookup`
- `app/routers/admin.py` — poll summaries include `dates` field; `PATCH /api/admin/polls/{id}` supports title/dates/group_id
- `app/routers/voter.py` — `gg_browse_poll_id` always overwritten on `/join/{access_uuid}`
- `app/tasks/fetch_tasks.py` — SerpApi gated on `is_movie()`
- `app/services/showtime_service.py` — `theater_id` optional in manual add
- `scripts/migrate_theater_id_nullable.py` — one-time SQLite migration (run on prod)
- `voter-spa/src/api/voter.ts` — `is_movie: boolean` on `VoterEvent` and `ResultsEntry.event`
- `voter-spa/src/components/ShowtimeCard.tsx` — `venue_name` for non-movies, no theater fallback
- `voter-spa/src/components/VoteTab.tsx` — single-session events render inline (no accordion); threads `event` prop to `ShowtimeCard`
- `voter-spa/src/components/ShowtimesTab.tsx` — event prop threading fix
- `voter-spa/src/components/ResultsTab.tsx` — `venue_name`, hides format badge for non-movies; broken image `onError` handler
- `voter-spa/src/components/DiscoverTab.tsx` — `venue_name` for non-movies; single-time inline render; "SHOWTIMES" → "TIMES"; broken image `onError`
- `templates/admin/dashboard.html` — "Group" → "Edit" button; edit poll dialog (pre-populated, PATCH submit); string cleanup
- `templates/admin/movies.html` — tab renames ("Movie (TMDB)", "Other Event"); edit mode for manual events; "Find →" button; "Clear" button
- `templates/admin/showtimes.html` — event-scoped collapsible sections; per-event fetch controls; inline Add Time form; power-user flat table collapsed by default; string cleanup
- `templates/admin/results.html` — string cleanup
- `templates/components/admin_movie_list.html` — edit pencil icon for manual events; warning/badge gated on `event_type == "movie"`
- `templates/components/admin_session_list.html` — string cleanup

---

## Pending — Next Session

#### 1. UX: Times page — combine all movies into one section with fetch controls + cached times inside
- **File:** `templates/admin/showtimes.html`
- Current layout: one collapsible section per event (movies and non-movies each get their own).
- New layout:
  - **One "Movies" section** at the top containing:
    - Movie selection pills (one per movie in the poll, all checked by default)
    - Theater selector
    - Date selector
    - "Fetch Showtimes" button
    - The "All cached times" flat table with time window filter (currently separate at bottom)
  - **Individual sections for each non-movie event** below (unchanged — each has its own times list + Add Time form)
- The "All cached times" table moves inside the Movies section and is no longer a separate bottom section
- If the poll has no movie events, the Movies section is hidden entirely (non-movie sections only)
- This is a significant rework of the HTMX template — do not convert to React

---

## Implementation Prompt

> **Windsurf:** Copy everything below this line and use it as your task prompt.
> When all tasks are done, follow the cleanup instructions at the very end.

---

You are continuing development on GroupGo (branch: master).
Read docs/groupgo-windsurf-handoff.md before starting. Single focused task
on the admin Times page template. Do not touch React SPA, backend logic,
or auth.

---

### Task 1 — Times page: combine movies into one section
File: templates/admin/showtimes.html

Rework the Times page layout:

**Movies section (shown only if poll has movie events):**
- Single collapsible section with header "Movies"
- Inside: movie selection pills, theater selector, date selector,
  Fetch Showtimes button (same controls as before, scoped to movies)
- Below the fetch controls: the full "All cached times" flat table
  with time window filter (move it here from the bottom)
- Each movie in the poll gets a pill/checkbox to include/exclude from fetch

**Non-movie sections (unchanged):**
- Each non-movie event keeps its own collapsible section
- Times list + inline Add Time form per event
- No fetch controls

**Remove:** the standalone "All cached times" section at the bottom
  (its content moves inside the Movies section)

The existing HTMX endpoints are unchanged — only the template layout changes.

---

### After completing all tasks

1. In docs/groupgo-windsurf-handoff.md:
   a. Move all items from `## Pending — Next Session` into `## Completed`
      under a new entry: `### Session — [today's date]`
   b. Add implementation note if anything differed — format: `> ℹ️ [one or two sentences]`
   c. Replace everything after the blockquote in `## Implementation Prompt`
      with: `_Nothing pending._`
2. No SPA changes — skip npm run build
3. Commit: `git add -A && git commit -m "ux: Times page — combine movies into one section with fetch controls and cached times"`
4. Push: `git push origin master`
