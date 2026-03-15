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

### Session 1 — March 2026 (branch: v2-generic-events)
- `app/models.py` — `Event.is_movie()` property; `Showtime.theater_id` → `Optional[int]`
- `app/routers/api.py` — `is_movie` in `_serialize_event()` and `_ser_result()`; `PATCH /api/admin/events/{id}`; `POST /api/admin/events/lookup` (⚠ uses SerpApi — needs swap to Google KG, see Pending #1)
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

#### 1. Bug: "Find" button uses SerpApi — swap to Google Knowledge Graph API
- **File:** `app/routers/api.py` — `POST /api/admin/events/lookup`
- The endpoint currently calls SerpApi for event enrichment. This burns the 100/month quota reserved for showtime scraping.
- Replace with **Google Knowledge Graph Search API** (free tier, no billing required).
  - Add `GOOGLE_KG_API_KEY` to `.env` and `app/config.py` settings
  - Endpoint: `https://kgsearch.googleapis.com/v1/entities:search?query={title}&key={GOOGLE_KG_API_KEY}`
  - Extract: `image_url` from `result.image.contentUrl`, `website_url` from `result.detailedDescription.url` or `result.url`
  - On no results: return `{image_url: null, website_url: null}` (frontend already handles this gracefully)
- To get a key: console.cloud.google.com → search "Knowledge Graph Search API" → Enable → Create API key. No billing account required.

---

## Implementation Prompt

> **Windsurf:** Copy everything below this line and use it as your task prompt.
> When all tasks are done, follow the cleanup instructions at the very end.

---

You are continuing development on GroupGo (branch: v2-generic-events).
Read docs/groupgo-windsurf-handoff.md before starting. Single focused task —
do not touch anything outside the files listed.

---

### Task 1 — Swap "Find" button from SerpApi to Google Knowledge Graph API
File: app/routers/api.py — POST /api/admin/events/lookup
File: app/config.py — add GOOGLE_KG_API_KEY setting

The /api/admin/events/lookup endpoint currently calls SerpApi, which burns
the 100/month quota reserved for showtime scraping. Replace it:

1. In app/config.py, add:
   GOOGLE_KG_API_KEY: str = ""

2. In app/routers/api.py, replace the SerpApi call in admin_lookup_event
   with a Google Knowledge Graph Search API call:
   - URL: https://kgsearch.googleapis.com/v1/entities:search
   - Params: query="{title} {venue_name}".strip(), key=GOOGLE_KG_API_KEY, limit=3
   - Extract image_url from: result["image"]["contentUrl"] if present
   - Extract website_url from: result["detailedDescription"]["url"] or result["url"] if present
   - Iterate results and take the first that has either field
   - Return {image_url, website_url} — nulls if nothing found
   - If GOOGLE_KG_API_KEY is empty, return 503 with detail "Google KG key not configured"

3. Do not touch the frontend — it already handles null image_url/website_url gracefully.

---

### After completing all tasks

1. In docs/groupgo-windsurf-handoff.md:
   a. Move all items from `## Pending — Next Session` into `## Completed`
      under a new entry: `### Session — [today's date]`
   b. Replace everything after the blockquote in `## Implementation Prompt`
      with: `_Nothing pending._`
2. Commit: `git add -A && git commit -m "fix: swap Find button enrichment from SerpApi to Google Knowledge Graph"`
3. Push: `git push origin v2-generic-events`
