# GroupGo — Windsurf Handoff Brief
> Complete context for continuing development. Last updated: March 2026.
> Read this before touching any file.

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
│   ├── groupgo-windsurf-handoff.md  # ← this file
│   ├── groupgo-voter-flow-spec.md
│   └── groupgo-voter-flow.jsx
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
  borderTap:   "#4A4A6E",   // unselected-but-tappable — see Visual Polish
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

// Font scale
export const FS = {
  xs:   11,   // badge counts, tiny labels
  sm:   13,   // secondary meta, chips
  base: 16,   // body text — iOS HIG minimum
  md:   17,   // primary labels, button text
  lg:   19,   // card titles, section headings
  xl:   22,   // movie title in card
  h1:   26,   // winner name, large display
} as const;
```

---

## Visual Polish — Tappable vs Disabled Affordances

**Critical:** Dim dark element + muted border = *disabled* in mobile UI convention. GroupGo must distinguish unselected-but-tappable from locked clearly.

### ShowtimeCard checkbox — three states

| State | Treatment |
|-------|-----------|
| Unselected (tappable) | Empty box, border `#4A4A6E` — visibly lighter than card bg |
| Selected | Green fill `#22C55E`, white `✓`, green border |
| Locked/submitted | Muted `✓` in `#3A3A4E`, dim border `#2A2A3E`, `opacity: 0.65` |

### General border rule
- `#1E1E2E` / `#2A2A3E` = structural, non-interactive
- `#4A4A6E` = unselected but tappable
- `#22C55E` = selected/active
- `opacity: 0.65` + `#2A2A3E` = locked/disabled

Apply across ShowtimeCard, SingleOptionCard, flexible toggle.

### Full-row tap target

The entire showtime row is tappable, not just the checkbox. `onClick` on the row container. Press feedback covers the full row. `pointer-events: none` on toggle only in locked state — expand/collapse still works.

---

## Status Chip & Vote Tab Footer

`ParticipationBanner` has been removed. Replaced by two components.

### StatusChip (AppHeader, always visible)

Right side of AppHeader, left of user name pill. Derives state internally:

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
| preview | `JOIN →` | bg `#1E3A5F`, border `#3B82F6`, text `#3B82F6` | Direct join, no popover |
| voting | `VOTING ▾` | bg `#7A5510`, border `#E8A020`, text `#E8A020` | Popover |
| editing | `EDITING ▾` | bg `#7A5510`, border `#E8A020`, text `#E8A020` | Popover |
| submitted | `✓ DONE ▾` | bg `#14532D`, border `#22C55E`, text `#22C55E` | Popover |

**Popover** uses `ReactDOM.createPortal` (avoids `overflow: hidden` clipping).

| State | Popover row 1 | Popover row 2 |
|-------|--------------|--------------|
| voting | "Go to Vote tab" | "Opt out" (neutral) |
| editing | "Go to Vote tab" | "Cancel edit" |
| submitted | "Change vote" | "Opt out" (neutral) |

After opt out → chip reverts to `JOIN →`.

### VoteTabFooter (Vote tab only)

| State | Primary | Secondary |
|-------|---------|-----------|
| voting + has selections | `Submit vote →` (amber) | `Opt out` (ghost) |
| voting + no selections | hidden | — |
| editing | `Resubmit →` (amber) | `Cancel` (ghost) |
| submitted | hidden | — |
| preview | hidden | — |

"Has selections" = opted-in showtime votes, not yes-movies.

**Editing hint bar:** `✏️ Editing — hit Resubmit when done` — dark amber, between FilterBar and event list, visible only when `isEditing === true`.

---

## Vote Tab — Submitted State

When `chipState === "submitted"` and `isEditing === false`:

**Info card** (first in scroll area):
```
🔒  Your vote is locked in
    Tap ✓ DONE above to change your selections or opt out.
```
Style: `#16161F` bg, `#2A2A3E` border. Text in `#9A9AAE` / `#5A5A6E`. No color.

**Locked cards:**
- Toggle: muted `✓` in `#3A3A4E`, no green border
- Card border: `#1E1E2E` — no green highlight
- `opacity: 0.65`
- `pointer-events: none` on toggle only
- Cards stay visible — voter sees their selections

Pass `isLocked` prop from VoteTab → ShowtimeCard / SingleOptionCard.

---

## Opt-Out Dialog

**Centered modal, not bottom sheet.** (Triggered from top-right chip — bottom sheet would be spatially jarring.)

- Title: `"Opt out of this poll?"`
- Body: `"Your selections will be removed. You can rejoin at any time."`
- Confirm: amber/neutral — **not red** (reversible action)
- Resolve `opt_out_reason` — either add optional text field or remove from API call

---

## Filter Bottom Sheet

Bottom sheet is correct here (filter pills are in-content). Four requirements:

1. **Selection state** — amber checkmark/text on active options
2. **"All / Clear" row** at top of each list — clears filter, dismisses sheet
3. **Row tap affordance** — `border-bottom: 1px solid #1E1E2E` + press highlight
4. **Close button** — `✕` in sheet header

Header text: `"Filter by event"` / `"Filter by location"` / `"Filter by date"`.

---

## Date Grouping in Vote Tab

Each date group:
- Colored dot (amber if any selections, gray if none) + sentence-case date label
- `"X of Y selected"` count on right
- Divider line between groups
- Format badges (D-BOX, IMAX) on second line under venue name

---

## Environment

Key `.env` variables:
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
- SerpApi free tier = 100 searches/month
- `access_uuid` regeneration immediately invalidates all existing voter links
- HTMX vote endpoints (`/api/votes/*`) are deprecated — do not extend
- `is_included` on Showtime controls voter visibility
- `get_participation()` is group-aware
- Browse mode = Discover tab only, no voting
- `ADMIN_PASSWORD` env var is vestigial (HTTP Basic replaced by magic link) — safe to remove from config

---

## Pending / Known Gaps

- `voting_closes_at` exists but no UI or enforcement
- `/api/results/json` 401s in browse mode
- Old HTMX voter templates still present but unused
- No Playwright tests for SPA yet

---

## V2 — Generalization Session

**Goal:** Extend GroupGo beyond movies to any group activity (restaurants, concerts, bars, etc.). Target audience: friend groups planning weekend activities. Movie path stays intact.

### Principles

- **Showtime model unchanged.** No schema migrations.
- **Scoring algorithm unchanged.**
- **Auth unchanged.**
- Non-movie events get time slots added manually by admin. Same voter experience — event+time voting.
- Voter-visible string "showtime" → "option"/"time" for non-movie events. TypeScript interfaces and component names stay as-is.

### Completed (branch: `v2-generic-events`)

| File | Change |
|------|--------|
| `app/models.py` | `Event.is_movie()` property |
| `app/routers/api.py` | `is_movie` in `_serialize_event()` and `_ser_result()` |
| `app/tasks/fetch_tasks.py` | SerpApi gated on `is_movie()` — no movies → skip |
| `voter-spa/src/api/voter.ts` | `is_movie: boolean` on `VoterEvent` and `ResultsEntry.event` |
| `voter-spa/src/components/ShowtimeCard.tsx` | `venue_name + time` for non-movies, format badge hidden |
| `voter-spa/src/components/VoteTab.tsx` | Threads `event` prop to `ShowtimeCard` |
| `voter-spa/src/components/ShowtimesTab.tsx` | Same event prop threading |
| `voter-spa/src/components/ResultsTab.tsx` | `venue_name` for non-movies, format badge hidden |
| `templates/admin/showtimes.html` | Step 2 label "Showtimes" → "Times"; SerpApi section hidden when no movies; "No movies" message shown; manual form hides Theater+Format for non-movie events, shows freeform Venue field instead |
| `templates/admin/movies.html` | Warning badge and "No showtimes" card badge only shown for movie-type events |

### Pending — next session

#### 1. Bug: Invite link cookie not overwriting
- **File:** `app/routers/voter.py` — the `/join/{access_uuid}` route
- `gg_browse_poll_id` must be set **unconditionally** on every visit, even if already present.
- Current "set if absent" behavior causes a voter following a second invite link to land on the previous poll.
- Fix: always call `response.set_cookie("gg_browse_poll_id", poll_id, ...)` with no existence check.

#### 2. Bug: Non-movie events showing theater name as location
- **Files:** `voter-spa/src/components/DiscoverTab.tsx`, `voter-spa/src/components/ShowtimeCard.tsx`
- When `event.is_movie === false`, location must always render as `event.venue_name`.
- Never display the Showtime's `theater` / `theater_name` for non-movie events — it will be a movie theater (e.g. "Cinemark Cedar Park") which is meaningless for a restaurant or concert.
- Audit both components and fix all display paths.

#### 3. UX: Single-time events — inline display (no accordion)
- **Files:** `voter-spa/src/components/DiscoverTab.tsx`, `voter-spa/src/components/ShowtimeCard.tsx` (or wherever expand/collapse lives)
- If an event has exactly **1** showtime: render it inline in the card — no "1 time ▾" toggle.
- If an event has **2 or more** showtimes: keep existing expand/collapse accordion behavior.
- Applies to both DiscoverTab event cards and VoteTab showtime cards.

#### 4. UX: Admin Times page — event-scoped sections
- **File:** `templates/admin/showtimes.html` (HTMX — do **not** convert to React)
- Replace the current layout (global fetch form + flat cached-times table) with **per-event collapsible sections**.
- Each section:
  - **Header:** event name + event type badge (Movie / Concert / Restaurant / etc.)
  - **Movie events:** SerpApi fetch controls (theater selector, date selector, Fetch button) scoped to that event only
  - **Non-movie events:** no fetch section
  - **All events:** list of current cached/manual times for that event
  - **Inline "Add time"** button that expands a small form:
    - Date picker
    - Time picker
    - Movie events: theater dropdown + format dropdown (as today)
    - Non-movie events: **no venue field** — use `event.venue_name` silently on the backend
- Below all event sections: keep the existing "Cached times" table as a power-user override view, **collapsed by default**.
- Backend endpoints unchanged — only UI wiring changes.

#### 5. UX: Manual add time — hide venue field for non-movie events
- When the selected event `!is_movie`, hide the Venue / Location input in the manual add form.
- The backend should use `event.venue_name` silently. No Showtime schema changes.
- This is partly addressed by item 4 above but also applies to the existing standalone manual-add form.

#### 6. UX: "Group" button on poll card → "Edit" (opens pre-populated edit dialog)
- **File:** `templates/admin/dashboard.html` (poll card action buttons) + `app/routers/api.py` or `app/routers/admin.py` (PATCH endpoint)
- The "Group" button on each poll card in the dashboard should be renamed **"Edit"**.
- Clicking it opens the **existing poll creation dialog**, pre-populated with the poll's current values:
  - Poll name / title
  - Poll dates (PollDate records)
  - Assigned group
- On submit it calls `PATCH /api/admin/polls/{id}` with the updated fields (name, dates, group_id).
- The `PATCH /api/admin/polls/{id}` endpoint already exists — verify it accepts name, dates, and group_id. Add support for any missing fields.
- After a successful save the dialog closes and the poll card refreshes (HTMX swap or page reload).
- The create flow is unchanged — "New Poll" still opens the same dialog in create mode (empty fields, POST).
- No new dialog component needed — reuse what exists, just toggle create vs. edit mode based on whether a poll id is passed in.

#### 7. String cleanup (V2 generalization — carry-over)

| File | What to fix |
|------|-------------|
| `templates/admin/dashboard.html` | Hero: "Plan the next movie night" → "Plan your next group event"; poll card stat "Movies" → "Events" |
| `templates/admin/movies.html` | Step 2 progress chip: "Showtimes" → "Times" |
| `templates/admin/showtimes.html` | Page title → "Fetch and refine times"; "All Movies" → "All Events"; "All Theaters" → "All Venues"; table col "Movie" → "Event"; table col "Theater" → "Venue" |
| `templates/admin/results.html` | Step 1 "Movies" → "Events"; Step 2 "Showtimes" → "Times"; copy "movie and showtime combinations" → "event and time combinations" |
| Poll action menu (admin poll card) | "Movies" chip → "Events" |
| `voter-spa/src/components/DiscoverTab.tsx` | "SHOWTIMES" section label inside event card → "TIMES" |

#### 8. UX: Edit button on manual event cards in "In this poll" sidebar
- **File:** `templates/admin/movies.html` (the "In this poll" sidebar)
- Manual/non-movie event cards in the sidebar get a small **pencil/edit icon** (top-right, alongside the existing ✕ remove button).
- Clicking it switches the left panel to the **Manual Entry / Other Event tab** and pre-populates all fields with the event's current values: event_type, title, venue_name, synopsis/description, image_url, external_url.
- Submit button changes from "Add Event" → "Save Changes" when in edit mode.
- On save: call `PATCH /api/admin/events/{id}` with updated fields. Close edit mode, refresh the sidebar card.
- TMDB movie cards do **not** get an edit icon — they are read-only (sourced from TMDB).
- Backend: verify or add `PATCH /api/admin/events/{id}` endpoint accepting the manual event fields.

#### 9. UX: Rename tabs on the Events / Add form
- **File:** `templates/admin/movies.html`
- "TMDB Movie" tab → **"Movie (TMDB)"**
- "Manual Entry" tab → **"Other Event"**

#### 10. UX: "Find" button on Other Event form — auto-fills image + website via SerpApi
- **File:** `templates/admin/movies.html` (manual entry / Other Event tab)
- Add a **"Find →"** button inline to the right of the Title input field.
- Behaviour:
  1. On click: POST to a new backend endpoint `POST /api/admin/events/lookup` with `{title, venue_name, event_type}`.
  2. Backend uses SerpApi (knowledge graph or organic search) to find the best match and return `{image_url, website_url}`. Uses existing `SERPAPI_KEY` env var.
  3. On success: populate the Image URL and Website / Booking URL fields with the returned values. Do not auto-save — admin reviews and edits before submitting.
  4. On failure / no results: show a small inline error "Nothing found — enter manually".
- Add a **"Clear"** button (ghost, appears after a Find result is applied) that clears all fields **except Title**, so the admin can retry or fill manually without losing the title.
- The Find button and Clear button are **hidden on the Movie (TMDB) tab** — TMDB already handles enrichment.
- SerpApi quota note: this fires once per manual button click, not on keystrokes. Acceptable against the 100/month free tier.
- **Future consideration (not in scope now):** Live-as-you-type autocomplete could be added later using Google Places Autocomplete API (requires billing-enabled GCP account + Places API key). DuckDuckGo Instant Answer API is a free fallback but only works for well-known entities. Not worth implementing until there's a clear need.

### What to NOT touch

- Showtime table, model, columns
- SerpApi fetch logic
- Scoring algorithm
- Auth system
- TMDB search and enrichment
- URL routes
- TypeScript interface names, component names