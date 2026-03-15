# GroupGo — Development Reference
> Single source of truth for Claude (planning) and Windsurf (implementation).
> Last updated by: Claude, March 2026.
>
> **Windsurf:** Before starting any session, run `/groupgo-sync` or `git pull origin v2-generic-events`.
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

**Repo:** `v2-generic-events` branch, git remote is GitHub (`tonyperkins/groupgo`)

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
              event_type, image_url, external_url, venue_name, is_custom_event

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
`Showtime.theater_id` is nullable — migration script at `scripts/migrate_theater_id_nullable.py` must be run on production after deploy (idempotent).

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
POST   /api/admin/polls/{id}/publish
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

```powershell
cd voter-spa && npm run build && cd ..
git add -A && git commit -m "..." && git push origin v2-generic-events
ssh user@server "cd /opt/groupgo && git pull && docker compose up -d --build"
```

---

## Gotchas

- No Alembic — `ALTER TABLE` or drop+recreate for schema changes
- `Showtime.theater_id` is nullable in Python model — run `scripts/migrate_theater_id_nullable.py` on production (idempotent)
- SerpApi free tier = 100 searches/month — reserved for showtime scraping only
- `GOOGLE_KG_API_KEY` used for the "Find" button enrichment — free tier, no billing required
- `access_uuid` regeneration immediately invalidates all existing voter links
- HTMX vote endpoints (`/api/votes/*`) are deprecated — do not extend
- `is_included` on Showtime controls voter visibility
- Browse mode = Discover tab only, no voting
- `gg_browse_poll_id` is always overwritten on every `/join/{access_uuid}` visit

---

## Known Gaps (non-session)

> **Events not appearing in Vote tab:** An event must have at least one time slot (`is_included = true`) to appear in the voter Vote tab. Events with no times show in Discover only. This is correct behavior but not obvious to admins — a future improvement would be a warning on the Events page for manual events with no times, similar to the existing "No showtimes" warning on movie events.

- `voting_closes_at` exists but no UI or enforcement
- `/api/results/json` 401s in browse mode
- Old HTMX voter templates still present but unused
- No Playwright tests for SPA yet
- Production needs `scripts/migrate_theater_id_nullable.py` run after next deploy

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

_Nothing pending._

---

## Implementation Prompt

> **Windsurf:** Copy everything below this line and use it as your task prompt.
> When all tasks are done, follow the cleanup instructions at the very end.

---

_Nothing pending._
