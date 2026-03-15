# GroupGo — Development Reference
> Single source of truth for Claude (planning) and Windsurf (implementation).
> Last updated by: Claude, March 2026.
>
> **Windsurf:** Before starting any session, `git pull` this file.
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

Showtime      id, event_id, theater_id, poll_id, session_date(YYYY-MM-DD),
              session_time(HH:MM), format, booking_url,
              is_custom, is_included

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

**No Alembic.** Adding columns = `ALTER TABLE x ADD COLUMN y TYPE DEFAULT z` against the SQLite file, or drop + recreate for dev.

---

## Auth System

### Admin auth (magic link)
- Admin requests login link via email → `auth_service.send_admin_magic_link()`
- In production: sends via Gmail SMTP (`SMTP_*` env vars)
- In development: logs link to stdout with `━━ MAGIC LINK ━━` banner
- Token: single-use UUID, 15-minute TTL, purpose-scoped
- Session: 30-day cookie (`gg_admin_session`), server-side `AuthSession` record
- `auth_service.get_admin_user_from_session()` validates on every admin request

### Voter auth (PIN)
- Voter opens `/join/{access_uuid}` → `gg_browse_poll_id` cookie set → browse mode
- Voter enters 4-digit PIN → `gg_poll_session` JWT cookie (poll_id + user_id)
- PIN validates against `users.member_pin` + group membership check

| Cookie | Contents | State |
|--------|----------|-------|
| `gg_poll_session` | JWT {poll_id, user_id} | active voter |
| `gg_browse_poll_id` | poll_id string | browse mode |

**Secure flag:** set only when `APP_BASE_URL` starts with `https://`.

---

## SPA States

| State | Meaning | Triggered when |
|-------|---------|----------------|
| `browse` | Viewing without PIN | `gg_browse_poll_id` cookie, no session |
| `active` | Authenticated voter | `gg_poll_session` valid |
| `no_active_poll` | Auth'd, no poll | No OPEN/CLOSED poll |

401 from `/api/voter/me` → redirect to `/no-poll`.

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
PATCH  /api/admin/polls/{id}
POST   /api/admin/polls/{id}/publish
POST   /api/admin/polls/{id}/invite-link
POST   /api/admin/polls/{id}/close
POST   /api/admin/polls/{id}/declare-winner
DELETE /api/admin/polls/{id}
POST   /api/admin/showtimes/fetch
GET    /api/admin/jobs/{id}/json
POST   /api/admin/events/lookup          # Google Knowledge Graph enrichment for manual events
PATCH  /api/admin/events/{id}            # edit manual event fields
GET/POST/DELETE /api/admin/groups
GET/POST/PATCH/DELETE /api/admin/users
```

---

## Design Tokens (`voter-spa/src/tokens.ts`)

```typescript
export const C = {
  bg:          "#0A0A0F",
  surface:     "#111118",
  card:        "#16161F",
  border:      "#252535",
  borderLight: "#333348",
  borderTap:   "#4A4A6E",
  accent:      "#E8A020",
  accentDim:   "#7A5510",
  accentGlow:  "rgba(232,160,32,0.15)",
  green:       "#22C55E",
  greenDim:    "#14532D",
  red:         "#EF4444",
  redDim:      "#450A0A",
  blue:        "#3B82F6",
  blueDim:     "#1E3A5F",
  text:        "#F0EEE8",
  textMuted:   "#9A9AAE",
  textDim:     "#6A6A80",
  locked:      "#2A2A3E",
} as const;

export const FS = {
  xs:   11,
  sm:   13,
  base: 16,
  md:   17,
  lg:   19,
  xl:   22,
  h1:   26,
} as const;
```

---

## Visual Polish — Tappable vs Disabled Affordances

**Critical:** Dim dark element + muted border = *disabled* in mobile UI convention.

### ShowtimeCard checkbox — three states

| State | Treatment |
|-------|-----------|
| Unselected (tappable) | Empty box, border `#4A4A6E` |
| Selected | Green fill `#22C55E`, white `✓`, green border |
| Locked/submitted | Muted `✓` in `#3A3A4E`, dim border `#2A2A3E`, `opacity: 0.65` |

### General border rule
- `#1E1E2E` / `#2A2A3E` = structural, non-interactive
- `#4A4A6E` = unselected but tappable
- `#22C55E` = selected/active
- `opacity: 0.65` + `#2A2A3E` = locked/disabled

Full row is tappable. `pointer-events: none` on toggle only in locked state.

---

## Status Chip & Vote Tab Footer

### StatusChip (AppHeader, always visible)

```typescript
function deriveChipState(prefs: UserPollPreference, isEditing: boolean): ChipState {
  if (!prefs.is_participating) return "preview"
  if (prefs.has_completed_voting && !isEditing) return "submitted"
  if (isEditing) return "editing"
  return "voting"
}
```

| State | Label | Colors | Tap |
|-------|-------|--------|-----|
| preview | `JOIN →` | bg `#1E3A5F`, border/text `#3B82F6` | Direct join |
| voting | `VOTING ▾` | bg `#7A5510`, border/text `#E8A020` | Popover |
| editing | `EDITING ▾` | bg `#7A5510`, border/text `#E8A020` | Popover |
| submitted | `✓ DONE ▾` | bg `#14532D`, border/text `#22C55E` | Popover |

Popover uses `ReactDOM.createPortal`.

### VoteTabFooter

| State | Primary | Secondary |
|-------|---------|-----------|
| voting + has selections | `Submit vote →` (amber) | `Opt out` (ghost) |
| editing | `Resubmit →` (amber) | `Cancel` (ghost) |
| others | hidden | — |

**Editing hint bar:** `✏️ Editing — hit Resubmit when done` — visible only when `isEditing === true`.

---

## Vote Tab — Submitted State

Info card when locked:
```
🔒  Your vote is locked in
    Tap ✓ DONE above to change your selections or opt out.
```
Cards: `opacity: 0.65`, border `#1E1E2E`, toggle muted. Pass `isLocked` prop from VoteTab down.

---

## Opt-Out Dialog

Centered modal (not bottom sheet). Confirm amber/neutral — not red (reversible action).

---

## Filter Bottom Sheet

Four requirements: selection state (amber), "All/Clear" row at top, row tap affordance, close `✕` button.

---

## Environment

```
APP_ENV=production
APP_BASE_URL=https://groupgo.org
DATABASE_URL=sqlite:///./data/groupgo.db
TMDB_API_KEY=...
SERPAPI_KEY=...
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
git add -A && git commit -m "..." && git push origin master
ssh user@server "cd /opt/groupgo && git pull && docker compose up -d --build"
```

---

## Gotchas

- No migrations — `ALTER TABLE` or drop+recreate for schema changes
- SerpApi free tier = 100 searches/month — reserved for showtime scraping only, do not use for event enrichment
- Google Knowledge Graph API (`GOOGLE_KG_API_KEY` env var) used for the "Find" button on the Other Event form. Free tier, no billing required — enable at console.cloud.google.com, search "Knowledge Graph Search API"
- `access_uuid` regeneration immediately invalidates all existing voter links
- HTMX vote endpoints (`/api/votes/*`) are deprecated — do not extend
- `is_included` on Showtime controls voter visibility
- `get_participation()` is group-aware
- Browse mode = Discover tab only, no voting
- `ADMIN_PASSWORD` env var is vestigial — safe to remove

---

## Known Gaps (non-session)

- `voting_closes_at` exists but no UI or enforcement
- `/api/results/json` 401s in browse mode
- Old HTMX voter templates still present but unused
- No Playwright tests for SPA yet

---

## V2 — Generalization

**Goal:** Extend GroupGo beyond movies to any group activity. Movie path stays intact.

### Principles
- Showtime model, scoring algorithm, and auth unchanged
- Non-movie events get time slots added manually by admin
- Voter-visible string "showtime" → "time" for non-movie events
- TypeScript interface names and component names stay as-is

### What to NOT touch
- Showtime table, model, columns
- SerpApi fetch logic internals
- Scoring algorithm
- Auth system
- TMDB search and enrichment
- URL routes
- TypeScript interface names, component names

---

## Completed

### Session — March 2026 (branch: v2-generic-events)
- `app/models.py` — `Event.is_movie()` property
- `app/routers/api.py` — `is_movie` in `_serialize_event()` and `_ser_result()`
- `app/tasks/fetch_tasks.py` — SerpApi gated on `is_movie()`
- `voter-spa/src/api/voter.ts` — `is_movie: boolean` on `VoterEvent` and `ResultsEntry.event`
- `voter-spa/src/components/ShowtimeCard.tsx` — `venue_name + time` for non-movies, format badge hidden
- `voter-spa/src/components/VoteTab.tsx` — threads `event` prop to `ShowtimeCard`
- `voter-spa/src/components/ShowtimesTab.tsx` — same event prop threading
- `voter-spa/src/components/ResultsTab.tsx` — `venue_name` for non-movies, format badge hidden
- `templates/admin/showtimes.html` — step 2 label, SerpApi section gating, manual form venue field for non-movies
- `templates/admin/movies.html` — warning badge and "No showtimes" card gated to movie events only

---

## Pending — Next Session

### Bug fixes

#### 1. Invite link cookie not overwriting
- **File:** `app/routers/voter.py`
- `gg_browse_poll_id` must be set **unconditionally** on every `/join/{access_uuid}` visit.
- Fix: always call `response.set_cookie("gg_browse_poll_id", poll_id, ...)` — no existence check.

#### 2. Non-movie events showing theater name as location
- **Files:** `voter-spa/src/components/DiscoverTab.tsx`, `voter-spa/src/components/ShowtimeCard.tsx`
- When `event.is_movie === false`, always render `event.venue_name` as location. Never use `Showtime.theater`.

### UX — Voter SPA

#### 3. Single-time events — inline display (no accordion)
- **Files:** `voter-spa/src/components/DiscoverTab.tsx`, `voter-spa/src/components/ShowtimeCard.tsx`
- 1 showtime → render inline, no toggle. 2+ showtimes → keep accordion.

### UX — Admin

#### 4. Admin Times page — event-scoped sections
- **File:** `templates/admin/showtimes.html` (HTMX — do NOT convert to React)
- Per-event collapsible sections replacing global fetch form + flat table.
- Each section: event name + type badge header; movie events get SerpApi fetch controls; all events get times list + inline "Add time" form; non-movie add form hides venue field.
- Keep Cached times table below, collapsed by default.

#### 5. Manual add time — hide venue field for non-movie events
- When selected event `!is_movie`, hide Venue/Location input. Backend uses `event.venue_name` silently.

#### 6. "Group" button → "Edit" on poll cards
- **Files:** `templates/admin/dashboard.html`, `app/routers/api.py`
- Rename "Group" → "Edit". Opens existing poll dialog pre-populated with title, dates, group_id.
- Submit → `PATCH /api/admin/polls/{id}`. Verify endpoint accepts all three fields.
- Replacing dates: delete existing PollDate rows, insert new ones.
- "New Poll" flow unchanged.

#### 7. Edit button on manual event cards
- **Files:** `templates/admin/movies.html`, `app/routers/api.py`
- Pencil icon on manual/non-movie event sidebar cards. Click → pre-populates Other Event tab.
- Submit → `PATCH /api/admin/events/{id}`. Button reads "Save Changes" in edit mode.
- TMDB cards: no edit icon.

#### 8. Rename Add Event form tabs
- **File:** `templates/admin/movies.html`
- "TMDB Movie" → "Movie (TMDB)", "Manual Entry" → "Other Event"

#### 9. "Find" button — auto-fill via Google Knowledge Graph API
- **File:** `templates/admin/movies.html` + `app/routers/api.py`
- "Find →" inline right of Title field (Other Event tab only).
- `POST /api/admin/events/lookup {title, venue_name, event_type}` → `{image_url, website_url}`
- Backend uses Google Knowledge Graph Search API (`GOOGLE_KG_API_KEY` env var), NOT SerpApi
- Populates fields on success. "Nothing found — enter manually" on failure.
- "Clear" button (ghost, post-Find): clears all fields except Title.
- Button click only — no keypress search.

### String cleanup

#### 10. Admin string updates

| File | What to fix |
|------|-------------|
| `templates/admin/dashboard.html` | "Plan the next movie night" → "Plan your next group event"; "Movies" stat → "Events" |
| `templates/admin/movies.html` | Step 2 chip "Showtimes" → "Times" |
| `templates/admin/showtimes.html` | Title → "Fetch and refine times"; "All Movies"→"All Events"; "All Theaters"→"All Venues"; col "Movie"→"Event"; col "Theater"→"Venue" |
| `templates/admin/results.html` | Step 1 "Movies"→"Events"; Step 2 "Showtimes"→"Times"; "movie and showtime combinations"→"event and time combinations" |
| Poll action menu | "Movies" chip → "Events" |
| `voter-spa/src/components/DiscoverTab.tsx` | "SHOWTIMES" → "TIMES" |

---

## Implementation Prompt

> **Windsurf:** Copy everything below this line and use it as your task prompt.
> When all tasks are done, follow the cleanup instructions at the very end.

---

You are continuing development on GroupGo (branch: v2-generic-events).
Read docs/groupgo-windsurf-handoff.md before starting. Work through the
tasks below in order. All changes are surgical — do not refactor unrelated
code, do not touch auth, scoring, or TMDB integration.

---

### Task 1 — Bug: Invite link cookie not overwriting
File: app/routers/voter.py

In the /join/{access_uuid} route, always set gg_browse_poll_id
unconditionally — even if the cookie already exists. Remove any
"set if absent" guard. This fixes voters landing on a stale poll
when following a new invite link.

---

### Task 2 — Bug: Non-movie events showing theater name as location
Files: voter-spa/src/components/DiscoverTab.tsx
       voter-spa/src/components/ShowtimeCard.tsx

When event.is_movie === false, displayed location must always be
event.venue_name. Never render Showtime.theater or theater_name for
non-movie events. Audit both files, fix all display paths.

---

### Task 3 — UX: Single-time events render inline (no accordion)
Files: voter-spa/src/components/DiscoverTab.tsx
       voter-spa/src/components/ShowtimeCard.tsx

If an event has exactly 1 showtime, render it inline — no "1 time ▾"
toggle. 2+ showtimes keeps existing accordion. Applies to DiscoverTab
and VoteTab.

---

### Task 4 — UX: Admin Times page — event-scoped sections
File: templates/admin/showtimes.html (HTMX only — do NOT convert to React)

Replace current layout with per-event collapsible sections:
- Section header: event name + event type badge
- Movie events: SerpApi fetch controls scoped to that event
- Non-movie events: no fetch controls
- All events: list of current times + inline "Add time" form:
    - Date + time picker
    - Movie events: theater + format dropdowns
    - Non-movie events: NO venue field (use event.venue_name silently)
- Keep existing Cached times table below all sections, collapsed by default
- Backend endpoints unchanged

---

### Task 5 — UX: "Group" button → "Edit" on poll cards
Files: templates/admin/dashboard.html, app/routers/api.py

- Rename "Group" → "Edit" on every poll card action menu
- Opens existing poll creation dialog pre-populated with: title, dates, group_id
- Submit → PATCH /api/admin/polls/{id}
- Verify endpoint accepts title, dates, group_id — add any missing fields
- Replacing dates: delete existing PollDate rows for this poll, insert new ones
- After save: close dialog, refresh poll card
- "New Poll" create flow unchanged

---

### Task 6 — UX: Edit button on manual event cards
Files: templates/admin/movies.html, app/routers/api.py

- Add pencil icon to manual/non-movie event cards in "In this poll" sidebar
- Click → switches left panel to Other Event tab, pre-populates all fields
- Submit → PATCH /api/admin/events/{id}, button reads "Save Changes"
- TMDB movie cards: no edit icon
- Verify or add PATCH /api/admin/events/{id} endpoint

---

### Task 7 — UX: Rename Add Event form tabs
File: templates/admin/movies.html

- "TMDB Movie" → "Movie (TMDB)"
- "Manual Entry" → "Other Event"

---

### Task 8 — UX: "Find" button — auto-fill via Google Knowledge Graph API
File: templates/admin/movies.html + app/routers/api.py

- "Find →" button inline right of Title field, Other Event tab only
- POST /api/admin/events/lookup with {title, venue_name, event_type}
- Backend: call Google Knowledge Graph Search API (use GOOGLE_KG_API_KEY env var — NOT SerpApi)
  - Endpoint: https://kgsearch.googleapis.com/v1/entities:search?query={title}&key={key}
  - Extract: image (result.image.contentUrl) and website (result.detailedDescription.url or result.url)
- On success: populate Image URL + Website URL fields (do not auto-save)
- On failure: "Nothing found — enter manually" inline below title
- "Clear" button (ghost, appears after Find): clears all fields except Title
- Both buttons hidden on Movie (TMDB) tab
- Button click only — no keypress/debounce search

---

### Task 9 — String cleanup
No logic changes — labels only.

templates/admin/dashboard.html:
  "Plan the next movie night" → "Plan your next group event"
  Poll card stat "Movies" → "Events"

templates/admin/movies.html:
  Step 2 chip "Showtimes" → "Times"

templates/admin/showtimes.html:
  Page title → "Fetch and refine times"
  "All Movies" → "All Events"
  "All Theaters" → "All Venues"
  Column "Movie" → "Event"
  Column "Theater" → "Venue"

templates/admin/results.html:
  Step 1 "Movies" → "Events"
  Step 2 "Showtimes" → "Times"
  "movie and showtime combinations" → "event and time combinations"

Poll action menu: "Movies" chip → "Events"

voter-spa/src/components/DiscoverTab.tsx:
  "SHOWTIMES" label → "TIMES"

---

### After completing all tasks

1. Run `cd voter-spa && npm run build` (SPA files were changed)
2. In docs/groupgo-windsurf-handoff.md:
   a. Move all items from `## Pending — Next Session` into `## Completed`
      under a new entry: `### Session — [today's date]`
   b. Replace everything after the blockquote in `## Implementation Prompt`
      with: `_Nothing pending._`
3. Commit: `git add -A && git commit -m "feat: v2 generalization batch + admin UX improvements"`
4. Push: `git push origin master`
