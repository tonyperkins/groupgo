# GroupGo — Windsurf Handoff Brief
> Complete context for continuing development. Read this fully before touching any file.

---

## What This Project Is

GroupGo is a family movie-night coordinator. An admin curates a shortlist of movies + showtimes, publishes a poll, and family members vote from their phones. The app surfaces the mathematically optimal movie+showtime combination based on approval voting with veto power.

**Live stack:**
- Python 3.12 + FastAPI + SQLModel + SQLite
- Jinja2 + HTMX for the admin portal (keep this, it works)
- Docker + Portainer self-hosted, exposed via Cloudflare Tunnel

**Repo branch:** `feat-voter-flow-redesign`

---

## The Decision Made in This Session

The voter UI is being migrated from HTMX server-rendered templates to a **React SPA served by Vite**, while the admin portal stays as HTMX + Jinja2.

**Rationale:**
- The voter flow has 25 screens with tightly coordinated state (participation banner + progress bar + tab badges + movie card modes must all stay in sync)
- HTMX out-of-band swaps for 3-4 targets per vote action are fragile and hard to test
- A complete 25-screen React mockup already exists at `docs/groupgo-voter-flow.jsx` with all design tokens, component hierarchy, and state logic
- Playwright testing against React state is dramatically cleaner
- Windsurf handles React component work better than HTMX fragment coordination

**Architecture after migration:**
```
FastAPI serves:
  /admin/*          → Jinja2 + HTMX (unchanged)
  /static/*         → Static files (unchanged)
  /join/{uuid}      → Jinja2 PIN entry page (unchanged — needed for initial cookie auth)
  /vote/*           → Serve voter/index.html (React SPA entry point)
  /api/*            → JSON endpoints (minor additions needed, see below)
```

---

## Repository Structure

```
groupgo/
├── app/
│   ├── config.py           # Pydantic settings, reads from .env
│   ├── db.py               # SQLite init, get_db dependency
│   ├── main.py             # FastAPI app, mounts /static, includes routers
│   ├── models.py           # SQLModel ORM models (see Data Model section)
│   ├── templates_config.py # Jinja2 env + custom filters (fromjson, display_date, etc.)
│   ├── middleware/
│   │   ├── auth.py         # HTTP Basic Auth for admin routes (verify_admin)
│   │   └── identity.py     # Cookie-based voter identity (get_current_user, get_secure_poll_id)
│   ├── routers/
│   │   ├── admin.py        # Admin page routes (Jinja2 responses)
│   │   ├── voter.py        # Voter page routes (Jinja2 + redirects)
│   │   └── api.py          # All HTMX fragment + JSON API endpoints (1134 lines)
│   ├── services/
│   │   ├── vote_service.py     # Core voting logic, scoring algorithm, participation
│   │   ├── movie_service.py    # TMDB search, poll event queries
│   │   ├── showtime_service.py # Session grouping, SerpApi caching
│   │   ├── theater_service.py  # Theater CRUD
│   │   └── security_service.py # Token generation, PIN handling, cookie helpers
│   └── tasks/
│       └── fetch_tasks.py  # Async SerpApi fetch job runner
├── templates/
│   ├── admin/              # Admin Jinja2 templates (keep, don't touch)
│   ├── voter/              # Old voter templates (to be replaced by React)
│   │   ├── join_poll.html  # PIN entry — KEEP (needed for auth flow)
│   │   ├── identify.html   # Legacy identity picker — KEEP for now
│   │   └── *.html          # movies, logistics, results, no_poll — REPLACE with React
│   └── components/         # HTMX partials (admin ones keep, voter ones phase out)
├── static/
│   ├── css/app.css         # Tailwind + custom CSS for admin/base
│   └── js/app.js           # Minimal HTMX helpers (toast, identity sync)
├── docs/
│   ├── groupgo-voter-flow.jsx      # ⭐ Complete 25-screen React mockup
│   ├── groupgo-voter-flow-spec.md  # ⭐ Voter flow spec (25 screens, all states)
│   ├── groupgo-admin-spec.md       # ⭐ Admin flow spec (all screens + gaps)
│   ├── requirements.md             # Full PRD
│   └── schema.md                   # DB schema docs
├── tests/
│   ├── conftest.py             # Pytest fixtures (seeded_db, poll_with_sessions, etc.)
│   ├── test_vote_service.py    # ✅ 15 tests, all passing
│   ├── test_showtime_service.py
│   └── test_route_smoke.py
├── docker-compose.yml
├── Dockerfile
└── requirements.txt
```

---

## Data Model (Current — `app/models.py`)

```python
Poll          id, title, status(DRAFT|OPEN|CLOSED|ARCHIVED), access_uuid,
              target_dates(JSON str), winner_event_id, winner_session_id,
              created_at, updated_at
              # ⚠️ MISSING: voting_closes_at (DateTime), group_id (FK→groups)

Group         id, name, created_at

User          id, name, token, member_pin(4-digit), is_admin, email,
              group_id(FK→groups), created_at

Event         id, tmdb_id, title, year, synopsis, poster_path, trailer_key,
              tmdb_rating, runtime_mins, genres(JSON), is_custom_event

PollEvent     poll_id, event_id, sort_order  (junction table)

Theater       id, name, address, website_url, serpapi_query, is_active

Session       id, event_id, theater_id, poll_id, session_date, session_time,
              format, booking_url, fetch_status, is_custom, is_included

Vote          id, user_id, poll_id, target_type(event|session), target_id,
              vote_value(yes|no|abstain|can_do|cant_do), veto_reason

UserPollPreference  user_id, poll_id, is_flexible, has_completed_voting,
                    is_participating, opt_out_reason

FetchJob      id(UUID), poll_id, total_tasks, completed_tasks, status
```

### Two fields to add to Poll before anything else:

```python
# In app/models.py, add to Poll class:
voting_closes_at: Optional[str] = Field(default=None)  # ISO datetime string
group_id: Optional[int] = Field(default=None, foreign_key="groups.id")
```

This requires a DB migration. The app uses `SQLModel.metadata.create_all()` via `init_db()` in `app/db.py` — check if there's a migration system or if it's just `CREATE TABLE IF NOT EXISTS`. If the latter, add the columns manually to the existing SQLite file or drop and recreate for dev.

---

## Auth Flow (Important — React SPA must respect this)

The voter app uses **two authentication mechanisms** that must both be supported:

### 1. Secure Poll Entry (primary, used for real invites)
```
Admin clicks "Invite Link" → copies /join/{access_uuid}
Voter opens link → sees PIN entry page (join_poll.html — Jinja2, keep this)
Voter enters 4-digit PIN → POST /join/{access_uuid}
Backend validates PIN against users.member_pin
Sets cookies: gg_poll_session (JWT with poll_id + user_id)
Redirects to /vote/movies
React app reads auth state from /api/voter/me
```

### 2. Trusted Device Entry (legacy, for dev/admin use)
```
Voter goes to /identify → selects name from list
Backend sets: token cookie (user token)
React app can use this token via X-User-Token header
```

### What the React app needs to do:
- On mount, call `GET /api/voter/me` to get current user + poll context
- If 401 → redirect to `/join/{uuid}` or `/identify`
- Pass cookies automatically (same-origin, so fetch with `credentials: 'include'`)
- Never store tokens in localStorage (security risk on shared devices)

---

## Existing JSON API Endpoints (voter-facing)

These already exist and return JSON — use these from React:

```
GET  /api/voter/me              → current user + poll + preferences (ADD THIS — see below)
GET  /api/results/json          → ranked results + participation
GET  /api/admin/jobs/{id}/json  → fetch job status
```

These currently return HTML fragments — need JSON variants added:

```
POST /api/votes/movie           → cast movie vote (yes/no/abstain)
POST /api/votes/session         → cast session vote (can_do/cant_do/abstain)
POST /api/votes/flexible        → toggle flexible mode
POST /api/votes/complete        → mark voting submitted
POST /api/votes/participation   → opt in/out
```

---

## New API Endpoints Needed for React

### 1. `GET /api/voter/me` — The React bootstrap endpoint

This is the most important one. React calls this on mount to get everything needed to render the initial state.

```python
@router.get("/api/voter/me")
async def voter_me(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    poll = _get_voter_poll_for_request(request, ["OPEN", "CLOSED"], db)
    if not poll:
        # Check for any closed poll to show results
        return {"user": serialize_user(user), "poll": None, "state": "no_active_poll"}
    
    prefs = vote_service.get_user_poll_preferences(user.id, poll.id, db)
    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    yes_movie_count = vote_service.get_yes_movie_count(user.id, poll.id, db)
    voted_session_count = sum(1 for k, v in user_votes.items() if k[0] == "session" and v == "can_do")
    events = movie_service.get_poll_events(poll.id, db)
    
    return {
        "user": serialize_user(user),
        "poll": serialize_poll(poll),
        "preferences": prefs,
        "votes": serialize_votes(user_votes),
        "yes_movie_count": yes_movie_count,
        "voted_session_count": voted_session_count,
        "events": [serialize_event(e) for e in events],
        "is_secure_entry": is_secure_entry(request),
    }
```

### 2. Convert vote endpoints to accept JSON + return JSON

Current endpoints use `Form(...)` and return HTML. Add JSON variants or make them content-type aware:

```python
@router.post("/api/votes/movie")
async def vote_movie(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    
    # Accept both JSON body and form data
    body = await request.json()
    event_id = body["event_id"]
    vote_value = body["vote"]  # "yes" | "no" | "abstain"
    
    vote_service.cast_vote(user.id, poll.id, "event", event_id, vote_value, db)
    
    # Return updated state
    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    return {
        "status": "ok",
        "vote": vote_value,
        "yes_movie_count": vote_service.get_yes_movie_count(user.id, poll.id, db),
    }
```

### 3. `GET /api/voter/poll` — Full poll data for a tab

```
GET /api/voter/poll/movies      → events + user votes for movies tab
GET /api/voter/poll/showtimes   → sessions grouped + user votes for showtimes tab  
GET /api/voter/poll/results     → ranked results + participation for results tab
```

---

## Vite Setup Instructions

### File structure to create:

```
groupgo/
└── voter-spa/                  ← new directory, sibling to app/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/
        │   ├── client.ts       # fetch wrapper with credentials: 'include'
        │   ├── voter.ts        # GET /api/voter/me, poll data endpoints
        │   └── votes.ts        # POST vote endpoints
        ├── components/
        │   ├── PhoneShell.tsx  # AppHeader + ProgressBar + TabBar + ScrollArea
        │   ├── MovieCard.tsx
        │   ├── ShowtimeCard.tsx
        │   ├── StatusChip.tsx
        │   ├── VoteTabFooter.tsx
        │   ├── ResultsCard.tsx
        │   └── ...
        ├── screens/            # One file per logical screen group
        │   ├── MoviesScreen.tsx
        │   ├── ShowtimesScreen.tsx
        │   └── ResultsScreen.tsx
        ├── hooks/
        │   ├── useVoterState.ts    # Central state + polling
        │   └── useVotes.ts         # Optimistic vote mutations
        └── tokens.ts           # Design tokens from the mockup
```

### `voter-spa/vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../static/voter',   // FastAPI serves from /static/voter/
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/join': 'http://localhost:8000',
      '/identify': 'http://localhost:8000',
    }
  }
})
```

### FastAPI changes needed in `app/main.py`:

```python
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

# Add after existing static mount:
if os.path.exists("static/voter"):
    app.mount("/static/voter", StaticFiles(directory="static/voter"), name="voter-static")

# Add catch-all route for React SPA (add to voter.py router):
@router.get("/vote/{path:path}", response_class=HTMLResponse)
async def voter_spa(path: str):
    return FileResponse("static/voter/index.html")
```

### `voter-spa/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>GroupGo</title>
    <link rel="icon" href="/static/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### `voter-spa/package.json`:

```json
{
  "name": "groupgo-voter",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.22.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0"
  }
}
```

### Dockerfile update (build the SPA before copying):

```dockerfile
# Add before the COPY app/ line:
COPY voter-spa/ ./voter-spa/
RUN cd voter-spa && npm ci && npm run build
# The build outputs to static/voter/ which is then copied below
```

---

## Design Tokens

Copy these directly from the mockup into `voter-spa/src/tokens.ts`:

```typescript
export const C = {
  bg:           "#0A0A0F",
  surface:      "#111118",
  card:         "#16161F",
  border:       "#1E1E2E",
  borderLight:  "#2A2A3E",
  borderTap:    "#4A4A6E",   // unselected-but-tappable affordance — see Visual Polish notes
  accent:       "#E8A020",
  accentDim:    "#7A5510",
  green:        "#22C55E",
  greenDim:     "#14532D",
  red:          "#EF4444",
  redDim:       "#450A0A",
  blue:         "#3B82F6",
  blueDim:      "#1E3A5F",
  text:         "#F0EEE8",
  textMuted:    "#7A7A8E",
  textDim:      "#4A4A6E",
  locked:       "#2A2A3E",
} as const;

export const PHONE = { width: 390, height: 844 };
```

---

## Visual Polish — Tappable vs Disabled Affordances

**Critical:** In standard mobile UI, a dim dark element with a muted border reads as *disabled/unavailable*. GroupGo uses this same treatment for *unselected-but-tappable* elements — this is a bug, not a style choice. Users will not tap things that look disabled.

### ShowtimeCard checkbox — three distinct states

| State | Treatment |
|-------|-----------|
| Unselected (tappable) | Empty box, border `#4A4A6E` (visibly lighter than card bg), no fill — reads as "tap me" |
| Selected | Green fill `#22C55E`, white `✓`, green border — reads as "active/chosen" |
| Locked/submitted | Muted filled `✓` in `#3A3A4E`, dim border `#2A2A3E`, `opacity: 0.65` — reads as "locked in" |

The unselected border must be noticeably brighter than `#1E1E2E` (card border) and `#2A2A3E` (borderLight). `#4A4A6E` (`borderTap`) is the right value — use it consistently for any unselected interactive element.

### ShowtimeCard tap target — full row, not just checkbox

The entire showtime row should be tappable, not just the checkbox element. This is standard mobile UI — small rows (~44px) require generous tap targets. The `onClick` handler belongs on the row container, not the checkbox.

Press feedback (highlight/background flash) must cover the full row. If only the checkbox animates on tap the interaction feels broken. Use a subtle `background` color change on the row on press — e.g. briefly flashing to `#1E1E2E` → `#16161F`.

`pointer-events: none` on the checkbox element itself in locked state — the row container can still receive taps for expand/collapse, just the vote toggle is disabled.

### "I'm In" flexible toggle

The iOS-style toggle in its off state reads as disabled because it uses the same dim styling. Fix: give the toggle track a visible border (`#4A4A6E`) when off, so it reads as "available to enable" rather than "greyed out feature."

### General rule
- `#1E1E2E` / `#2A2A3E` borders = structural/decorative, non-interactive
- `#4A4A6E` borders = unselected but tappable
- `#22C55E` borders/fills = selected/active
- `opacity: 0.65` + `#2A2A3E` = locked/disabled

Apply this consistently across ShowtimeCard, SingleOptionCard, and the flexible toggle.

---

## React Component Hierarchy

Derived from `docs/groupgo-voter-flow.jsx` — port these components in this order:

### Layer 1 — Shell (render on every screen)
```
<VoterApp>                      # Fetches /api/voter/me, owns all state
  <PhoneShell>
    <AppHeader />               # title, subtitle, countdown, countdownUrgent, statusChip
    <ProgressBar step={0-3} />  # 3-segment binary fill: Joined / Voted / Submitted
    <ScrollArea>                # flex:1, minHeight:0
      {children}                # screen content
    </ScrollArea>
    {activeTab === "vote" && <VoteTabFooter />}  # sticky footer, Vote tab only
    <TabBar />                  # discover/vote/results + badge
  </PhoneShell>
</VoterApp>
```

**NOTE: `ParticipationBanner` has been removed.** Its role is replaced by:
1. A **status chip** in the AppHeader (always visible, tappable)
2. A **sticky footer** on the Vote tab only (contextual submit/resubmit actions)
3. The **ProgressBar** (already communicates state visually)

See "Status Chip & Vote Tab Footer" section below for the full spec.

### Layer 2 — Screens (swap based on active tab)
```
<MoviesScreen />      # MovieCard list, handles yes/no/abstain
<ShowtimesScreen />   # ShowtimeCard list, flexible toggle
<ResultsScreen />     # ResultCard list, group progress, participation
```

### Layer 3 — Overlays
```
<OptOutDialog />      # Centered modal (NOT a bottom sheet — triggered from top chip)
<Toast />             # Inline at top of ScrollArea
<TrailerPlayer />     # Inline 16:9 expand within MovieCard
```

### State shape (central, owned by VoterApp):

```typescript
interface VoterState {
  user: User | null;
  poll: Poll | null;
  preferences: UserPollPreference;
  votes: Record<string, string>;     // "event:123" → "yes"
  votedSessionCount: number;
  activeTab: "discover" | "vote" | "results";
  isEditing: boolean;
  showOptOutDialog: boolean;
  toast: string | null;
  // NOTE: no bannerState — derived from preferences + isEditing
  // preview  = !preferences.is_participating
  // voting   = is_participating && !has_completed_voting && !isEditing
  // editing  = is_participating && !has_completed_voting && isEditing
  // submitted = is_participating && has_completed_voting && !isEditing
}
```

---

## Status Chip & Vote Tab Footer

The `ParticipationBanner` has been removed and replaced by two focused components.

### StatusChip (in AppHeader, always visible)

Sits on the right side of the AppHeader row, left of the user name pill. Tapping it opens a popover anchored below-right with a dim overlay behind it. The chip state is derived — never stored directly:

```typescript
type ChipState = "preview" | "voting" | "editing" | "submitted"

function deriveChipState(prefs: UserPollPreference, isEditing: boolean): ChipState {
  if (!prefs.is_participating) return "preview"
  if (prefs.has_completed_voting && !isEditing) return "submitted"
  if (isEditing) return "editing"
  return "voting"
}
```

| State | Label | Colors | Tap action |
|-------|-------|--------|------------|
| preview | `JOIN →` | bg `#1E3A5F`, border `#3B82F6`, text `#3B82F6` | Direct — calls join API, no popover |
| voting | `VOTING ▾` | bg `#7A5510`, border `#E8A020`, text `#E8A020` | Opens popover |
| editing | `EDITING ▾` | bg `#7A5510`, border `#E8A020`, text `#E8A020` | Opens popover |
| submitted | `✓ DONE ▾` | bg `#14532D`, border `#22C55E`, text `#22C55E` | Opens popover |

**Popover contents by state:**

| State | Row 1 | Row 2 |
|-------|-------|-------|
| voting | "Go to Vote tab" → navigate `/vote/vote` | "Opt out" (neutral/ghost) → opt-out flow |
| editing | "Go to Vote tab" → navigate `/vote/vote` | "Cancel edit" → `setIsEditing(false)`, resubmit via API |
| submitted | "Change vote" → `setIsEditing(true)`, set `is_complete=false` via API | "Opt out" (neutral/ghost) → opt-out flow |

**After opt out:** chip reverts to `JOIN →` preview state.

---

### VoteTabFooter (Vote tab only, sticky above TabBar)

Only rendered when `activeTab === "vote"`. Contents are state-driven:

| State | Primary button | Secondary button |
|-------|---------------|-----------------|
| voting + has selections | `Submit vote →` (amber) → POST complete, `isEditing=false` | `Opt out` (ghost) |
| voting + no selections | *(footer hidden)* | — |
| editing | `Resubmit →` (amber) → POST complete, `isEditing=false` | `Cancel` (ghost) → `setIsEditing(false)` |
| submitted | *(footer hidden)* | — |
| preview | *(footer hidden)* | — |

**Inline hint bar (Vote tab, editing state only):** A small dark-amber bar sits between the FilterBar and the event list: `✏️ Editing — hit Resubmit when done`. Not a persistent banner — only visible on the Vote tab while `isEditing === true`.

---

### Vote Tab — Submitted State Appearance

When `chipState === "submitted"` and `isEditing === false`, the Vote tab enters a locked read-only state. Two things change:

**1. Submitted info card**

Rendered as the first item in the scroll area, above the event/showtime cards. Dim, non-interactive, informational:

```
🔒  Your vote is locked in
    Tap ✓ DONE above to change your selections or opt out.
```

Style: dark background (`#16161F`), muted border (`#2A2A3E`), border-radius matches other cards. Lock icon and first line in muted white (`#9A9AAE`), second line dimmer (`#5A5A6E`). No amber, no green — deliberately quiet.

**2. Locked showtime/option cards**

All `ShowtimeCard` and `SingleOptionCard` components render in a read-only locked mode:
- Toggle/checkbox affordance: replace active color with a muted filled icon (e.g. `✓` in `#3A3A4E` instead of bright green bordered checkbox)
- Card border: `#1E1E2E` (same as unselected) regardless of selection state — remove the green highlight border
- Opacity: `0.65` on the entire card
- `pointer-events: none` on the toggle element specifically (card itself can still be tapped to expand, just can't change the vote)
- Do NOT hide or collapse cards — voter should be able to see what they voted for

The `EventGroup` collapse/expand still works in submitted state. Only the vote toggles are locked.

---

## Mockup Reference

The file `docs/groupgo-voter-flow.jsx` contains all 25 screens as runnable React components. It is the source of truth for:
- Every component's exact inline styles
- All conditional rendering logic (banner states, locked states, etc.)
- The complete design token set
- Screen labels and IDs

**How to use it:** Open the mockup in a browser to see any screen. The selector at the top lets you navigate all 25. Then port each component to `voter-spa/src/` replacing mock data with real API calls.

The mockup ZIP of all 25 screens as PNGs is at `docs/mockup_images/` (or regenerate from the JSX).

---

## Screens to Port (priority order)

| Priority | Screen | Notes |
|----------|--------|-------|
| 1 | Shell (AppHeader + ProgressBar + TabBar + StatusChip + VoteTabFooter) | Everything depends on this |
| 2 | Secure Entry (`/join/{uuid}`) | Keep as Jinja2 — already works |
| 3 | Discover tab | Info-only cards |
| 4 | Vote tab | Core loop |
| 5 | Vote Submitted state | Chip + footer change only |
| 6 | Results tab — all states | 5 variants |
| 7 | Edge cases (no active poll, opted out, countdown urgent) | Minor variants |
| 8 | Opted Out | Banner variant |
| 9 | Countdown Urgent | Header variant |
| 10 | Change Vote / Editing | Banner variant |
| 11 | Toast variants | 3 messages |
| 12 | Trailer Expanded | Inline player |
| 13 | Poll Closed | Results variant |
| 14 | No Active Poll | Empty state |

---

## Outstanding Issues (from QUESTIONS.md + analysis)

### Must fix before voter React app works:

1. **`voting_closes_at` missing from Poll model** — add field, wire to New Poll modal in admin, implement `countdown_str` filter
2. **`group_id` missing from Poll model** — add field, wire to New Poll modal
3. **`GET /api/voter/me` doesn't exist** — React bootstrap endpoint, must create
4. **Vote endpoints return HTML** — need JSON response mode (accept `Content-Type: application/json`)

### Admin gaps (fix in parallel or after voter):

5. **Poll edit screen** — Edit button exists on dashboard but no route/template
6. **Winner declaration UX** — Results page needs explicit "Declare as Official Plan" button per row
7. **Fetch history** — "Last fetched: today at 2:14 PM · 25 sessions" line on showtimes page
8. **Time window filter** — already in UI, confirm it's wired to backend

### Cleanup (low priority):

9. **Double toast system** — `#gg-toast` (floating) vs `#gg-inline-toast` (inline) — consolidate
10. **Double group progress component** — `group_progress.html` and `gg_group_progress.html` — remove old one
11. **Admin CSS** — uses `text-slate-400` etc. instead of `--gg-*` tokens — cosmetic, not functional

---

## Test Strategy

### Existing tests (keep, they pass):
```
tests/test_vote_service.py      # 15 unit tests on scoring algorithm
tests/test_showtime_service.py  # showtime grouping logic
tests/test_route_smoke.py       # basic route 200/302 checks
```

### To add — Playwright E2E:

Install alongside `voter-spa`:
```bash
cd groupgo
pip install playwright pytest-playwright
playwright install chromium
```

Test structure:
```
tests/
├── e2e/
│   ├── conftest.py         # seed DB fixture, start dev server fixture
│   ├── test_admin_setup.py # create group, members, theater, poll, movies, showtimes
│   ├── test_voter_flow.py  # happy path: join → vote → submit
│   ├── test_validation.py  # toast states (no movie, no showtime, both)
│   └── test_results.py     # multi-user results states
```

Key fixture pattern:
```python
@pytest.fixture
def seeded_poll(test_db):
    """Creates a fully configured OPEN poll with 2 movies, 5 showtimes, 3 members."""
    # Direct DB inserts — faster than driving admin UI for every test
    ...
```

---

## Development Workflow

```bash
# Terminal 1 — FastAPI backend
cd groupgo
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Vite dev server (proxies /api to backend)
cd groupgo/voter-spa
npm run dev
# Voter SPA available at http://localhost:5173/vote/movies
# Admin still at http://localhost:8000/admin

# Build for production (outputs to static/voter/)
npm run build
# Then FastAPI serves the built SPA at /vote/*
```

---

## Sequence of Work

**Session 1 — Foundation (do this first, nothing else works without it)**
1. Add `voting_closes_at` + `group_id` to `Poll` model + migrate DB
2. Create `voter-spa/` with Vite + React + TypeScript setup
3. Add `GET /api/voter/me` endpoint
4. Make vote endpoints return JSON when `Accept: application/json`
5. Add `/vote/{path:path}` catch-all in FastAPI to serve SPA

**Session 2 — Shell components**
1. Port `PhoneShell`, `AppHeader`, `ProgressBar`, `TabBar`, `StatusChip`, `VoteTabFooter`, `ScrollArea` from mockup
2. Wire to `/api/voter/me` — get real user + poll data rendering in the shell
3. Verify auth flow: `/join/{uuid}` → PIN → cookie → React loads with correct user

**Session 3 — Movies tab**
1. Port `MovieCard` (all 4 modes)
2. Wire `POST /api/votes/movie` with optimistic updates
3. Verify badge count updates, progress bar segment 2 fills

**Session 4 — Showtimes tab**
1. Port `ShowtimeCard`, flexible toggle
2. Wire `POST /api/votes/session` + `POST /api/votes/flexible`
3. Verify tab lock/unlock, badge count, progress bar segment 3

**Session 5 — Submit + Results**
1. Wire `POST /api/votes/complete`
2. Port all Results tab variants
3. Wire `GET /api/results/json`

**Session 6 — Edge cases + overlays**
1. Opt out / rejoin flow
2. Change vote / editing state
3. Toast validation
4. Countdown urgent state
5. Poll closed state

**Session 7 — Playwright test suite**
1. DB seed fixtures
2. Happy path E2E test
3. Validation tests
4. Multi-user state tests


---

## Identity & Roles — Current Problems and Required Rework

### What's broken today

The current model treats admin as a **separate user type** rather than a **role on a regular user**. This creates several concrete problems:

**1. Admin cannot vote**
`voter.py` line 164 explicitly excludes admins from PIN validation:
```python
user = db.exec(
    select(User).where(User.member_pin == pin, User.is_admin == False)
).first()
```
The admin who sets up every poll can't participate in it.

**2. Admin has no PIN and no voter identity**
`api.py` lines 773–788: when creating an admin user, PIN generation is skipped entirely. The admin has no way to enter the voter flow even if the exclusion above were removed.

**3. Admin auth is HTTP Basic against shared env-var credentials**
The admin portal uses `Authorization: Basic <base64>` against `ADMIN_USERNAME` / `ADMIN_PASSWORD`. This is a single shared credential — not per-user, not tied to any User row. There's no way to tell *which* admin is logged in, and it can never be associated with a voter identity.

**4. Participation stats are wrong**
`vote_service.py` line 234 loads voters as `where(User.is_admin == False)`. The admin is never counted in group progress, participation panels, or the "N/M voted" display.

**5. Admin cannot be deleted**
`api.py` line 834 blocks deletion of admin users. No lifecycle management at all.

---

### Design principles for the new identity model

Three principles drive all the decisions below:

1. **Admin is a role, not a user type.** Any user can have `role="admin"`. It grants access to the admin portal. It has zero effect on voter capabilities.

2. **Build the full account model now, activate paths incrementally.** The schema supports passwords, OAuth, self-service profile management, and signup. Most of those paths are unimplemented for now — just nullable columns and stub routes. Adding them later is additive, not a migration.

3. **PIN is the active voter auth path until explicitly replaced.** Voters authenticate via PIN on invite link. Everything else (voter passwords, self-service PIN reset, OAuth) is deferred but the model supports it without changes.

---

### The target data model for identity

```python
class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100)

    # Contact — required, enables all future self-service flows
    email: str = Field(unique=True, index=True)          # required, not optional
    email_verified_at: Optional[str] = Field(default=None)

    # Auth credentials — all nullable, filled as paths are activated
    password_hash: Optional[str] = Field(default=None)   # bcrypt, for future password login
    member_pin: Optional[str] = Field(default=None, max_length=4, index=True)  # active voter path

    # Role & plan
    role: str = Field(default="voter")   # "admin" | "voter"
    plan: str = Field(default="free")    # "free" | "paid"

    # Group membership
    group_id: Optional[int] = Field(default=None, foreign_key="groups.id")

    # Legacy — keep during transition, remove after all auth uses AuthSession
    token: Optional[str] = Field(default=None, unique=True, index=True)

    created_at: str = Field(default_factory=_now)
    updated_at: str = Field(default_factory=_now)

    @property
    def is_admin(self) -> bool:
        """Backward-compatible property — keeps existing code working."""
        return self.role == "admin"


class AuthSession(SQLModel, table=True):
    """Server-side session record. Replaces the stateless token cookie."""
    __tablename__ = "auth_sessions"

    id: str = Field(primary_key=True)           # UUID
    user_id: int = Field(foreign_key="users.id", index=True)
    session_type: str = Field(default="voter")  # "voter" | "admin"
    device_hint: Optional[str] = Field(default=None)  # "iPhone / Safari" — display only
    is_trusted_device: bool = Field(default=False)     # longer expiry on trusted devices
    created_at: str = Field(default_factory=_now)
    expires_at: str                                    # ISO datetime
    last_active_at: str = Field(default_factory=_now)
    revoked_at: Optional[str] = Field(default=None)   # set on logout


class MagicLinkToken(SQLModel, table=True):
    """Single-use short-lived token for passwordless flows."""
    __tablename__ = "magic_link_tokens"

    token: str = Field(primary_key=True)         # UUID, indexed by definition
    user_id: int = Field(foreign_key="users.id", index=True)
    purpose: str                                 # "admin_login" | "voter_onboard" | "pin_reset" | "email_verify"
    created_at: str = Field(default_factory=_now)
    expires_at: str                              # 15 min for login, 24h for onboard
    used_at: Optional[str] = Field(default=None) # set on first use — token then invalid
```

---

### What each table enables, now vs later

| Capability | Now | Later |
|---|---|---|
| Admin logs in with email | ✓ magic link | ✓ + password fallback |
| Admin votes as themselves | ✓ PIN | unchanged |
| Voter joins poll | ✓ PIN on invite link | unchanged |
| Voter self-service PIN reset | — (admin resets) | ✓ magic link to email |
| New member onboarding | ✓ admin creates + tells PIN | ✓ onboard email with magic link |
| OAuth (Google/Apple) | — | ✓ add oauth_provider + oauth_id cols |
| Session revocation / logout | ✓ via AuthSession.revoked_at | already built |
| "Active sessions" / device list | ✓ via AuthSession rows | already built |
| Signup flow (open registration) | — | ✓ POST /signup → creates User + sends verify email |
| Email verification | — | ✓ MagicLinkToken purpose="email_verify" |

---

### Authentication flows — active now

**Admin login (replaces HTTP Basic):**
```
GET  /admin/login          → render email entry form
POST /admin/login          → look up User by email where role="admin"
                             → create MagicLinkToken(purpose="admin_login", expires=15min)
                             → send email with /admin/auth/{token}
                             → render "check your email" page
GET  /admin/auth/{token}   → validate token (exists, unexpired, unused)
                             → mark used_at
                             → create AuthSession(session_type="admin", expires=7days)
                             → set gg_admin_session cookie
                             → redirect /admin
GET  /admin/logout         → revoke AuthSession, clear cookie
```

**Voter join (unchanged flow, new session backing):**
```
GET  /join/{uuid}          → render PIN entry
POST /join/{uuid}          → validate PIN against User.member_pin (no is_admin filter)
                             → create AuthSession(session_type="voter", expires=30days)
                             → set gg_voter_session cookie
                             → redirect /vote/movies
```

**Trusted device:**
```
POST /join/{uuid}  with "trust this device" checked
  → AuthSession(is_trusted_device=True, expires=90days)
```

---

### Authentication flows — stub now, implement later

**New member onboarding email:**
```
Admin creates member → system sends email:
  "You've been added to [Group]. Your PIN is XXXX.
   Click here to join the current poll: /join/{uuid}"
```
Infrastructure: same MagicLinkToken table with purpose="voter_onboard".
Requires: email service (Resend) + email_verified_at tracking.

**Voter PIN reset (self-service):**
```
/join/{uuid} → "forgot PIN?" link
  → enter email
  → MagicLinkToken(purpose="pin_reset", expires=15min) sent to email
  → /auth/pin-reset/{token} → set new PIN form → save → redirect to /join/{uuid}
```

**Signup flow (open registration / hosted SaaS):**
```
GET  /signup               → name, email, group code or invite
POST /signup               → create User(role="voter", email_verified_at=null)
                             → MagicLinkToken(purpose="email_verify")
                             → send verify email
GET  /auth/verify/{token}  → mark email_verified_at, create AuthSession, redirect /vote
```

**OAuth:**
```
Add to User: oauth_provider (nullable), oauth_id (nullable)
GET /auth/google           → redirect to Google OAuth
GET /auth/google/callback  → upsert User, create AuthSession
```
No schema migration needed — just add two nullable columns when ready.

---

### Migration steps (code changes required now)

**Step 1 — Update User model**
- Replace `is_admin: bool` with `role: str = "voter"` (keep `is_admin` as property)
- Make `email` required (not Optional)
- Add `email_verified_at`, `password_hash`, `plan`, `updated_at`
- Keep `token` for transition period

**Step 2 — Add AuthSession + MagicLinkToken tables**
These are new tables — just `CREATE TABLE IF NOT EXISTS` via init_db.

**Step 3 — Implement admin magic link login**
- Add `/admin/login`, `/admin/auth/{token}` routes
- Add `get_admin_user(request, db)` dependency
- Replace all `verify_admin(request)` calls with `admin = get_admin_user(request, db)`
- Seed first admin user from env vars (email + temp magic link logged to console on first boot)

**Step 4 — Fix voter session backing**
- Replace stateless `token` cookie with `AuthSession` row
- `create_voter_session(user, poll_id, trusted_device)` → inserts AuthSession, returns UUID cookie
- `get_voter_session(request, db)` → looks up AuthSession, checks expiry + revoked_at

**Step 5 — Fix voter PIN lookup and participation queries**
- Remove `User.is_admin == False` from `voter.py:164`
- Remove `where(User.is_admin == False)` from `vote_service.py:234` and `vote_service.py:419`

**Step 6 — Update Members admin UI**
- Role dropdown (Voter / Admin) on every user
- PIN field enabled for admin users
- Email field required
- "Send magic link" button for admin users
- Remove delete block on admin users (just ensure ≥1 admin remains)

---

### Email requirement — handling existing data

Making email required is a breaking change if you have existing User rows without emails (likely in dev/test). Handle with:

```python
# In init_db() migration logic:
# Backfill placeholder emails for any users missing them
users_without_email = db.exec(select(User).where(User.email == None)).all()
for u in users_without_email:
    u.email = f"user_{u.id}@placeholder.local"
    db.add(u)
db.commit()
```

Then add a "complete your profile" banner in the voter app for anyone with a placeholder email.

---

## Productionization Considerations

### Tier model

The natural paid/free split based on the SerpApi constraint:

| Feature | Free | Paid |
|---------|------|------|
| Create and manage polls | ✓ | ✓ |
| Manual showtime entry | ✓ | ✓ |
| Invite via link + PIN | ✓ | ✓ |
| Voting + results algorithm | ✓ | ✓ |
| Shared showtime cache hits | ✓ | ✓ |
| Auto showtime fetch (SerpApi) | — | ✓ |
| Multiple groups | 1 | unlimited |
| Poll history | 3 polls | unlimited |
| Email notifications | — | ✓ |
| Multiple admin users | — | ✓ |

The core value proposition — solving the coordination problem — works entirely on free. Auto-fetch is a pure convenience upgrade with a real, visible API cost behind it. That's a clean upsell story.

### The shared showtime cache — key to making free viable

Currently `Session` records are tied to a `poll_id`. This means two polls wanting the same movie at the same theater on the same date trigger two SerpApi calls.

Decouple the cache from the poll:

```python
class ShowtimeCache(SQLModel, table=True):
    """Poll-agnostic SerpApi cache. Shared across all polls."""
    __tablename__ = "showtime_cache"
    id: Optional[int] = Field(default=None, primary_key=True)
    theater_id: int = Field(foreign_key="theaters.id")
    movie_title: str          # normalized for matching
    cache_date: str           # YYYY-MM-DD
    fetched_at: str
    raw_serpapi: str          # JSON
    expires_at: str           # fetched_at + 12h (existing rate limit logic)

class Session(SQLModel, table=True):
    # Stays poll-specific, but can be seeded from ShowtimeCache
    cache_id: Optional[int] = Field(default=None, foreign_key="showtime_cache.id")
    # ... rest unchanged
```

When a paid user fetches showtimes, results go into `ShowtimeCache`. When any user (free or paid) creates sessions for the same theater+date, the system checks the cache first. Zero additional API calls. Free users benefit from paid user activity — a natural network effect.

### Plan gate implementation

Add `plan: str = Field(default="free")` to `User` model (already noted in roles section above).

One decorator pattern, applied to SerpApi-triggering endpoints:

```python
def require_paid(user: User):
    if user.plan != "paid":
        raise HTTPException(
            status_code=402,
            detail="Auto showtime fetch requires a paid plan"
        )
```

In the admin portal, free users see the "Fetch Showtimes" button in a disabled state with an upgrade prompt. The manual "Add showtime" accordion is always available.

### Self-hosted vs hosted SaaS

**Self-hosted with license key** (recommended for V1 productionization):
- Customers run their own Docker instance (they already do this — it's a Portainer deploy)
- Paid plan unlocked by a license key validated server-side
- No multi-tenancy problem — SQLite stays fine
- Privacy-conscious customers love it
- Stripe for license key purchase, a simple key validation endpoint, done
- Model: Plausible, Metabase, Coolify

**Hosted SaaS** (higher revenue ceiling, higher complexity):
- You run the infrastructure, customers pay monthly
- Requires multi-tenancy (`tenant_id` on every table, or one DB per tenant)
- Requires Postgres (SQLite doesn't support concurrent writers at scale)
- Requires real DevOps (backups, monitoring, uptime SLA)
- Model: every other SaaS

**Recommendation:** Start self-hosted. The existing Docker + Portainer deploy story is already there. Add license key validation. If demand justifies hosted, the SQLModel abstraction makes Postgres migration straightforward — just a connection string change plus a few SQLite-specific query adjustments.

### SQLite → Postgres migration path

SQLModel supports both. The only SQLite-specific patterns to watch for:

```python
# SQLite-specific (won't work on Postgres):
Poll.status.in_(["OPEN", "CLOSED"])    # fine on both actually
JSON stored as strings                  # replace with JSONB columns on Postgres
```

The `target_dates` and `genres` fields stored as JSON strings are the main migration surface. On Postgres these become proper `JSONB` columns. Everything else is standard SQL.

When the time comes: add `DATABASE_URL=postgresql://...` to `.env`, run `alembic` migrations (add Alembic now even if you're not using it yet — it's free insurance). Zero application code changes if SQLModel abstractions are used consistently.

### Billing integration (Stripe)

Minimal integration for self-hosted license key model:

```
POST /billing/checkout  → create Stripe checkout session, redirect
GET  /billing/success   → validate payment, generate license key, email to customer
POST /billing/webhook   → handle subscription renewals, cancellations
```

License key stored on `User` (or a separate `License` table for multi-user installs).
Server-side validation: `GET /api/license/validate` called at startup and cached.

Libraries: `stripe` Python SDK, already works with FastAPI.

### What to defer

- **Email notifications** — useful but not blocking. Add when you add magic link auth (same email infrastructure).
- **Postgres migration** — only needed if going hosted SaaS. Self-hosted SQLite is fine indefinitely.
- **Alembic** — add it now but don't spend time writing migrations until the model stabilizes post-React migration.
- **OAuth (Google/Apple login)** — nice for hosted SaaS, overkill for self-hosted. Magic link covers the use case with less complexity.

---

## Updated Sequence of Work

**Session 1 — Model foundations (everything else depends on this)**
1. Replace `is_admin: bool` with `role: str` on User (keep `is_admin` as property)
2. Add `password_hash`, `plan` to User
3. Add `voting_closes_at`, `group_id` to Poll
4. Add `ShowtimeCache` table (poll-agnostic fetch cache)
5. Fix PIN lookup — remove `is_admin == False` filter
6. Fix participation queries — remove admin exclusion

**Session 2 — Admin auth replacement**
1. Implement magic link flow (`/admin/login`, `/admin/auth/{token}`)
2. Replace `verify_admin(request)` with `get_admin_user(request, db)`
3. Update Members UI — role dropdown, PIN on admin users, email field
4. Seed admin user from env vars (migration from HTTP Basic)

**Session 3 — Vite + React setup**
1. Create `voter-spa/` with Vite + React + TypeScript
2. Add `GET /api/voter/me` endpoint
3. Make vote endpoints return JSON
4. Add `/vote/{path:path}` catch-all in FastAPI

**Sessions 4–9 — React voter UI (unchanged from previous plan)**

**Session 10 — Plan gating**
1. Add `require_paid` decorator
2. Gate SerpApi fetch endpoint
3. Wire shared cache for free-tier showtime reuse
4. Admin UI: disabled fetch button with upgrade prompt for free users


---

## Data Model Review — Future-Proofing Assessment

A systematic review of every table for decisions that would impede future enhancements. Rated by urgency: 🔴 fix now (before Session 1 work), 🟡 fix soon (before launch), 🟢 defer (V2+).

---

### All datetimes stored as strings 🟡

**Current:** Every `created_at`, `updated_at`, `expires_at` is `str` storing an ISO-8601 string. SQLite has no native datetime type, so this is common — but it means all date comparisons happen as string comparisons, which only works correctly because ISO-8601 sorts lexicographically when formatted consistently.

**The risk:** The moment you want to query "polls closing in the next 24 hours" or "sessions that expired before now", you're doing string comparisons in SQLite. This works today. It breaks if anyone ever stores a non-ISO format (timezone offset variations, missing zero-padding, etc.), and it's invisible until it fails.

**Fix:** Enforce strictly in the application layer and add a note. When adding `voting_closes_at` to Poll, store it as ISO-8601 UTC string with a consistent format helper — the same `_now()` pattern already in the model. Add a validator.

**Postgres path:** When/if you migrate to Postgres, these become proper `TIMESTAMP WITH TIME ZONE` columns. The SQLModel field type stays `str` but the DB column type changes — one line in the migration.

---

### `Vote.target_type` / `Vote.target_id` polymorphic reference 🟡

**Current:**
```python
target_type: str   # "event" or "session"
target_id: int     # FK to either events.id or sessions.id — but not enforced
```

This is a "polymorphic association" — one table references two different tables via a type discriminator. It works, but has specific costs:

- **No foreign key enforcement.** SQLite (and most DBs) can't enforce a FK that points to two different tables. A bug that writes `target_type="event"` with a session ID silently corrupts data.
- **Joins require conditional logic.** Any query that needs to join Vote to its target has to branch on `target_type`. This is visible in `vote_service.py` everywhere.
- **Harder to extend.** If you add a third voteable type (e.g., "venue" for non-movie events), every query that handles `target_type` needs updating.

**Better long-term model:** Separate vote tables, or explicit FKs:
```python
class Vote(SQLModel, table=True):
    id: Optional[int] = ...
    user_id: int = Field(foreign_key="users.id")
    poll_id: int = Field(foreign_key="polls.id")
    event_id: Optional[int] = Field(default=None, foreign_key="events.id")
    session_id: Optional[int] = Field(default=None, foreign_key="sessions.id")
    vote_value: str
    veto_reason: Optional[str] = ...
    # Constraint: exactly one of event_id / session_id must be non-null
```

**Recommendation:** Don't change it now — the polymorphic model works and the scoring algorithm is built around it. Flag it for a refactor when/if you add a third voteable type. Add a comment in the code warning about the lack of FK enforcement.

---

### `Poll.target_dates` stored as JSON string 🟡

**Current:**
```python
target_dates: str = Field(default="[]")  # JSON array of YYYY-MM-DD strings
```

This is a JSON array serialized into a text column. Every reader has to `json.loads()` it. It can't be queried, indexed, or joined. You can't ask "show me all polls that include March 21st" without loading every poll and parsing.

**Why it matters for future features:**
- Recurring polls — "every weekend" needs to generate target_dates automatically
- Showtime cache lookup — "do we have cached showtimes for any of this poll's dates?" requires parsing all dates
- Calendar view of upcoming polls — can't query efficiently

**Fix options:**
1. **PollDate junction table** (cleanest):
```python
class PollDate(SQLModel, table=True):
    poll_id: int = Field(foreign_key="polls.id", primary_key=True)
    date: str = Field(primary_key=True)  # YYYY-MM-DD
```
2. **Keep JSON string, add queryable copy** — add a generated column or materialized view (SQLite 3.31+ supports generated columns)

**Recommendation:** Migrate to `PollDate` junction table when doing the Session 1 model work. It's a small change with a big future payoff. The migration is: parse existing `target_dates` JSON for each poll, insert rows into `PollDate`, drop the column.

---

### `Event.genres` stored as JSON string 🟢

**Current:**
```python
genres: Optional[str] = Field(default=None)  # JSON array e.g. '["Action","Comedy"]'
```

Same pattern as `target_dates`. Can't query "all polls with Action movies." Fine for V1 since genres are display-only. If you ever want to filter or recommend by genre, extract to a junction table. Defer until needed.

---

### `Session` naming collision 🔴

**Current:** The movie showtime table is named `Session` / `sessions`. SQLModel imports clash with FastAPI's `Session` (database session dependency) and Python's own naming conventions. Look at the existing workaround in `vote_service.py`:

```python
from app.models import Session as ShowSession
```

This aliasing is a constant source of confusion and bugs. Every file that imports both the DB session and the showtime model needs this alias dance.

**Fix:** Rename the model now, before adding more code that imports it:
```python
class Showtime(SQLModel, table=True):
    __tablename__ = "showtimes"   # or keep "sessions" for DB backward compat
                                   # and just rename the Python class
```

**Recommended:** Rename the Python class to `Showtime` and keep the DB table as `sessions` for now (no DB migration needed). Find-replace `ShowSession` → `Showtime` and `Session as ShowSession` → `Showtime` across the codebase. Do this in Session 1 before adding any new code.

---

### `Group` is underpowered 🟡

**Current:**
```python
class Group(SQLModel, table=True):
    id, name, created_at
```

Groups exist on `User.group_id` but do almost nothing. There's no `Poll.group_id` (already flagged for addition), no group-level settings, no group access control. The group concept is implied but not enforced anywhere.

**What groups should eventually control:**
- Which users are counted in participation for a poll
- Which users receive notifications
- Which users can see each other's votes (if privacy features are added)
- Default theaters for a group (e.g., Group A always uses Cedar Park, Group B uses Domain)

**Add now:**
```python
class Group(SQLModel, table=True):
    id: Optional[int] = ...
    name: str
    access_code: Optional[str] = Field(default=None, unique=True)  # for self-join signup
    default_theater_ids: Optional[str] = Field(default=None)       # JSON array, optional convenience
    created_at: str = ...
    updated_at: str = ...
```

`access_code` is important for the signup flow — when someone signs up, they enter a group access code to join the right group without admin intervention. Without this, every new signup requires admin action to assign group membership.

---

### `Poll` missing key fields 🔴

Already documented but consolidated here for completeness. Add all of these in Session 1:

```python
class Poll(SQLModel, table=True):
    # ... existing fields ...
    group_id: Optional[int] = Field(default=None, foreign_key="groups.id")
    voting_closes_at: Optional[str] = Field(default=None)  # ISO datetime, UTC
    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    description: Optional[str] = Field(default=None)  # optional flavor text shown to voters
```

`created_by_user_id` is important for multi-admin scenarios and audit history. Without it, you can't answer "who created this poll?" — which matters for notifications ("Tony created a new poll") and for the hosted SaaS model where different users own different polls.

---

### `UserPollPreference` missing a field 🟡

**Current:** Tracks `is_flexible`, `has_completed_voting`, `is_participating`, `opt_out_reason`.

**Missing:** `joined_at` timestamp. You can't currently answer "when did this voter join the poll?" which is useful for:
- Sorting participation list by join order
- "X joined 2 hours ago" in the participation panel
- Analytics on time-to-vote

Small addition, low effort:
```python
joined_at: Optional[str] = Field(default=None)  # set when is_participating first becomes True
```

---

### `Theater` missing location data 🟢

**Current:** Has `name`, `address`, `website_url`, `serpapi_query`. No coordinates.

**Why it matters later:** If you want to show "X miles away" on the voter showtime cards, or sort theaters by distance from the group's location, you need lat/lng. SerpApi often returns coordinates in the response — worth storing when you have them.

**Add (nullable, populate when available):**
```python
latitude: Optional[float] = Field(default=None)
longitude: Optional[float] = Field(default=None)
google_place_id: Optional[str] = Field(default=None)  # for future Maps integration
```

---

### `DbVersion` table vs Alembic 🟡

**Current:** A hand-rolled `DbVersion` table tracks schema version as an integer. `init_db()` does `CREATE TABLE IF NOT EXISTS` for everything — meaning you can add new tables but can't alter existing columns without manual SQL.

**The problem:** You're about to make several ALTER TABLE changes (adding columns to `User`, `Poll`, `Group`, `Session`). SQLite supports `ALTER TABLE ADD COLUMN` for nullable columns, but not rename, drop, or change type. The current "just recreate" approach works for new installs but breaks for upgrades.

**Recommendation:** Add Alembic now, before the Session 1 model changes. It's a one-time setup cost that pays off every time you need to ship a schema change to a running instance. Since you're self-hosted on Docker, you control the migration cadence — run `alembic upgrade head` as part of the container startup script.

```python
# requirements.txt addition:
alembic==1.13.0

# alembic/env.py — point at SQLModel metadata
from app.models import SQLModel
target_metadata = SQLModel.metadata
```

If Alembic feels like too much setup overhead right now, the minimum viable alternative is to expand the `DbVersion` integer logic into a proper migration runner:

```python
MIGRATIONS = {
    2: "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'voter'",
    3: "ALTER TABLE users ADD COLUMN email_verified_at TEXT",
    4: "ALTER TABLE polls ADD COLUMN group_id INTEGER REFERENCES groups(id)",
    # etc.
}
```

Either approach beats the current "recreate everything on first boot" model.

---

### Summary — what to do in Session 1

| Change | Why now |
|--------|---------|
| Rename `Session` → `Showtime` (Python class only) | Eliminates import aliasing before more code is written |
| Add Alembic (or migration runner) | Required to safely ship all the other changes |
| `Poll`: add `group_id`, `voting_closes_at`, `created_by_user_id`, `description` | Blocks voter countdown UI and multi-admin |
| `User`: add `role`, `email` (required), `password_hash`, `plan`, `email_verified_at`, `updated_at` | Blocks identity rework |
| `Group`: add `access_code`, `updated_at` | Enables signup flow |
| `UserPollPreference`: add `joined_at` | Low effort, useful for participation display |
| `Theater`: add `latitude`, `longitude`, `google_place_id` | Nullable, populate later — cheap to add now |
| Replace `Poll.target_dates` JSON string with `PollDate` junction table | Queryable dates, enables recurring polls |
| Add `AuthSession`, `MagicLinkToken` tables | Required for identity rework |
| Add `ShowtimeCache` table | Required for shared fetch cache / free tier |


---

## Voter Flow & UI Review — Final Assessment

A screen-by-screen and flow-by-flow review of what's working, what's broken, what's missing, and what the React port needs to get right. This is the definitive reference for the voter SPA implementation.

---

### Flow gaps to fix in the React port

**1. Submit doesn't go anywhere useful**

Current behavior: clicking Submit on the banner calls `POST /api/votes/complete`, which responds with `HX-Refresh: true` — a full page reload back to the same page. The voter ends up on Movies again, now in submitted state, with no clear "you're done" moment.

The mockup spec shows Screen 25 (`vote-submitted`) — a green "Vote submitted" banner, locked movie cards, and a "View Live Results →" CTA. This transition needs to be deliberate:

```
Submit click
  → optimistic UI: show submitted state immediately
  → POST /api/votes/complete
  → on success: navigate to /vote/movies with submitted=true
  → green banner, locked cards, "View Live Results →" CTA prominent
```

The React router makes this easy — push a state change after the API call resolves instead of relying on a full page reload.

**2. `is_editing` / Change Vote state is never actually set**

The HTMX implementation had a fully designed "Editing your vote" state but `is_editing` is always `false` — the editing state never appears. The "Change Vote" button calls `POST /api/votes/complete` with `is_complete=false` (which also triggers `HX-Refresh`), and the voter is back in voting state with no editing indicator.

In React this is local state: `const [isEditing, setIsEditing] = useState(false)`. When "Change Vote" is triggered (via chip popover): set `is_complete=false` via API, set `isEditing=true`. The header chip shows EDITING ▾, and the Vote tab shows a small inline hint bar. When Resubmit is clicked: `is_complete=true`, `isEditing=false`, chip returns to ✓ DONE. Clean.

**3. Preview → Join transition is abrupt**

Current flow: voter lands on `/join/{uuid}/preview`, gets redirected to `/identify` (if no cookie) or `/vote/movies` directly. If they hit `/vote/movies` in preview mode and click "Join" on the banner, it posts to `/api/votes/participation` which triggers `HX-Refresh` — a full page reload back to movies.

This is the one transition where the full-page reload is most jarring. The voter just tapped "JOIN →" on the header chip and the whole page reloads. In React: the chip's Join action calls the API, gets back `{is_participating: true}`, updates local state — the chip smoothly transitions from blue JOIN → to amber VOTING ▾ with no reload.

**4. Tab navigation reloads the page**

Current tab bar uses `<a href="/vote/movies">` etc. — real navigations, full page reloads between tabs. Every tab switch requires a server round-trip and full re-render.

In React this is just `<Link to="/vote/movies">` with the shell persisting. Tab switches are instant. State (votes, preferences) is already in memory.

**5. Results auto-refresh is polling-based with no visual indicator**

The results page polls `GET /api/results` every 10 seconds via HTMX. There's no visual indicator that results are live or when they last updated. A voter has no way to know if the standings they're looking at are 2 seconds old or 9 seconds old.

In React: use a `useEffect` with a 10-second interval (same behavior), but add a subtle "Updated just now / X seconds ago" timestamp in the results header. Small UX improvement, easy to add.

---

### Screen-by-screen notes

**Secure Entry (`/join/{uuid}`) — keep as Jinja2**

The PIN entry screen is good. Keep it as a server-rendered Jinja2 page — it's a natural boundary before the React SPA loads (the cookie needs to be set before React can bootstrap). The visual design already matches the dark theme. No changes needed.

One improvement: the error state currently shows all 4 PIN dots in red. The mockup spec (Screen 2) shows this correctly. Confirm the CSS class `gg-pin-box.error` is applied to all 4 dots on wrong PIN, not just the container.

**Movies tab — mostly correct, three specific issues**

The movie card implementation is solid — poster, rating, genres, synopsis truncation, trailer inline expand, yes/no toggle, submitted state ribbon. Three things to port carefully:

- The "Zero Yes Preview" state (Screen 4) — when joined but 0 Yes votes, the dashed hint card shows and the Showtimes tab is locked (grayed + pointer-events: none). The tab lock logic is `showtimes_locked = yes_count == 0`. Replicate exactly in React.
- Trailer expand auto-scroll — the current JS loads the iframe but doesn't scroll to it. On mobile the iframe is often below the fold. Add `containerRef.current.scrollIntoView({ behavior: 'smooth' })` after loading the iframe.
- Veto reason — the No button currently shows a "Why not?" secondary input for veto_reason. This is present in the template via `movie_vote_toggle.html`. Port the full toggle component including the veto reason field.

**Showtimes tab — correct logic, one UX gap**

The flexible toggle, location filter pills, and date-grouped session cards are all well-designed. The "needs movie pick first" guard (redirecting to all showtimes if no yes-votes) is implemented and correct.

One gap: when a voter is in "needs_movie_pick_first" mode (joined but all-no on movies), the showtimes tab shows all showtimes with a warning. The mockup spec (Screen 15) shows a toast: "Pick at least one movie before voting on showtimes." The current template shows a card but not the inline amber toast. Use the inline toast pattern consistently.

One addition worth making: a "Back to Movies" link at the top of the showtimes tab when the voter has 0 Yes votes. Makes the tab feel less like a dead end.

**Results tab — three states need careful handling**

The results panel handles most states correctly. Three things to nail in React:

- **"No votes yet" vs "no valid combinations"** — these are different empty states (`results.ranked == []` when `no_valid_options=True` means there are candidates but none have any support; `results.ranked == []` when `no_valid_options=False` means there are literally no showtime candidates yet). The current template conflates them slightly. The mockup spec (Screen 18 vs Screen 19) shows different copy for each. Match the spec.

- **"MY PICK" ribbon** — this requires comparing `personal_results.ranked` against `results.ranked`. The current template does `result in personal_results.ranked` — this is an object identity check that may not work correctly if the result objects are different instances. In React, compare by `(event_id, session_id)` tuple explicitly.

- **Results for preview-mode voter** — the current template shows standings to preview-mode viewers (correct per spec — Screen 22 shows live standings with a "Join to Vote" CTA). Confirm the results endpoint returns data even when `is_participating=False`. It does — the `voter_results` route runs `calculate_results` regardless of participation. Just ensure the React component shows the "Join" CTA overlay when in preview mode.

**No Active Poll screen — correct**

Simple empty state, implemented well. The `closed_poll` branch (showing "View Final Results →") is correct. No changes needed.

**Opt-out dialog — use centered modal, not bottom sheet**

The opt-out action lives in the chip popover at the top of the screen. A bottom sheet would create a jarring top-to-bottom eye journey. Use a centered modal with dim overlay instead — this matches the spatial origin of the action.

Dialog content:
- Title: `"Opt out of this poll?"`
- Body: `"Your selections will be removed. You can rejoin at any time."`  (softer than "votes will be cleared")
- Confirm button: neutral/amber — **not red**. The destructive weight is in the text, not the color. Opt-out is reversible.
- Cancel button: ghost

The action triggered from the Vote tab footer's "Opt out" ghost button also opens this same centered modal — consistent regardless of entry point.

One addition: the backend accepts `opt_out_reason` but the UI never collects it. Either add an optional text field to the dialog or remove the backend param — don't leave them out of sync.

---

### Admin flow — don't touch, but note two things

The admin portal is staying as HTMX + Jinja2. Two specific items to note for later:

**Poll edit flow is undefined.** The dashboard has an "Edit" button on every poll card. Clicking it goes nowhere (no route, no template). Before launch, either: implement a basic edit screen (change title, dates, group), or hide the Edit button on non-DRAFT polls and make it open the existing movie/showtime setup flow for DRAFT polls.

**Winner declaration UX is ambiguous.** The admin results page (`admin/results.html`) shows the ranked combinations table. There's a "Declare Winner" action but it's not clear from the current UI which row it applies to — it may just declare the #1 ranked option. The spec shows a per-row "Declare as Official Plan" button. Worth clarifying before launch but not blocking.

---

### The three React-specific patterns to establish early

These decisions affect every component — establish them in the shell before porting individual screens:

**1. Optimistic updates pattern**

Every vote action should feel instant. The pattern:
```typescript
// In useVotes.ts
async function castMovieVote(eventId: number, value: 'yes' | 'no' | 'abstain') {
  // 1. Update local state immediately
  setVotes(prev => ({ ...prev, [`event:${eventId}`]: value }))
  setYesMovieCount(prev => /* recalculate */)
  
  // 2. POST to API in background
  try {
    const result = await api.votes.movie({ event_id: eventId, vote: value })
    // 3. Sync with server response (in case server disagrees)
    setYesMovieCount(result.yes_movie_count)
  } catch {
    // 4. Rollback on failure + show toast
    setVotes(prev => ({ ...prev, [`event:${eventId}`]: previousValue }))
    setToast('Failed to save vote — try again')
  }
}
```

**2. Single state owner**

All voter state lives in `VoterApp` (the root component) and flows down as props. No component fetches its own data. This makes the "tab switch" behavior trivial — switching tabs doesn't re-fetch anything, the data is already in memory.

**3. URL as tab state, not as page navigation**

The tab bar uses React Router `<Link>` components, but the shell (AppHeader, ProgressBar, StatusChip, VoteTabFooter, TabBar) never unmounts. The URL changes, the active tab changes, the scroll area content swaps — but the voter state in `VoterApp` persists across tab changes. This is the core advantage over the current HTMX full-page-reload tab navigation.

---

### Summary — what the React port needs to get right that HTMX got wrong

| Issue | HTMX behavior | React fix |
|-------|--------------|-----------|
| Submit UX | Page reload, no transition | Optimistic state → chip turns ✓ DONE, footer hides |
| Change Vote / editing state | `is_editing` always false | Local state, EDITING chip + inline hint bar on Vote tab |
| Preview → Join | Jarring reload | Smooth chip transition: JOIN → → VOTING ▾ |
| Tab switches | Full page reload | Instant, no data re-fetch |
| Results freshness | Silent 10s poll | Same interval + "Updated X seconds ago" |
| Opt-out reason | Backend field, no UI | Add text field or remove backend param |
| Trailer scroll | Iframe loads off-screen | scrollIntoView after load |
| Toast consistency | Two systems (floating + inline) | Single inline toast, one system |


---

## Generalization Session — Rename & Extend for Generic Events

This session should be completed before Sessions 7-10. It prepares the codebase for use beyond movies — restaurants, concerts, bars, weekend activities — without breaking any existing functionality.

---

### Philosophy

GroupGo is becoming a general-purpose group decision tool. The movie use case is the primary one and stays fully supported. The goal is to make the data model and UI generic enough that other event types work without special-casing, not to build a full event management system.

**Rule:** If a change requires touching the scoring algorithm, the vote flow, or the results tab — it's out of scope for this session. Those are agnostic already.

---

### Model changes

**`Event` — add generic fields alongside existing movie fields**

```python
class Event(SQLModel, table=True):
    # Existing movie fields — keep all of these
    tmdb_id: Optional[int]
    poster_path: Optional[str]
    trailer_key: Optional[str]
    tmdb_rating: Optional[float]
    runtime_mins: Optional[int]
    rating: Optional[str]          # MPAA rating
    genres: Optional[str]          # JSON array string
    synopsis: Optional[str]

    # New generic fields
    event_type: str = "movie"      # "movie" | "restaurant" | "concert" | "bar" | "other"
    image_url: Optional[str]       # generic image, used when poster_path is None
    external_url: Optional[str]    # website, booking link, etc.
    venue_name: Optional[str]      # for events not tied to a Venue/Theater
```

`event_type` defaults to `"movie"` so all existing data is unaffected.

**`Theater` → rename Python class to `Venue`**

Keep `__tablename__ = "theaters"` to avoid a DB migration — this is a Python-only rename. Add a comment:

```python
class Venue(SQLModel, table=True):
    __tablename__ = "theaters"  # kept for migration compatibility
    # ... existing fields unchanged
```

Update all imports and references from `Theater` / `TheaterModel` → `Venue`.

**`Showtime` — no rename needed**

`Showtime` is already generic enough. `session_date` + `session_time` + `format` work fine for any event type. The `theater_id` FK stays — it now points to `Venue` rows which can represent any location.

---

### Admin flow changes

The admin currently adds movies exclusively via TMDB search. Add a second path: **manual event entry**.

New endpoint:
```
POST /api/admin/polls/{poll_id}/events/manual
```

Body:
```json
{
  "title": "Khruangbin at Stubb's",
  "event_type": "concert",
  "description": "An evening of global groove...",
  "image_url": "https://...",
  "external_url": "https://stubbs.com/...",
  "venue_name": "Stubb's Waller Creek Amphitheater"
}
```

The existing `POST /api/admin/polls/{poll_id}/movies` (TMDB path) stays unchanged and is now the "movie" path.

In the admin UI, the "Add Movie" button becomes "Add Event" with two options:
- **Search TMDB** (existing flow, for movies)
- **Add Manually** (new form, for anything else)

---

### Voter UI changes

**Tab labels and icons:**
```
🎬 Movies  →  🎟️ Discover   (or just "Info")
🕐 Showtimes → 🗳️ Vote
🏆 Results  →  🏆 Results    (unchanged)
```

**MovieInfoPanel — enriched**

The info card on the Discover tab becomes a richer panel:

For `event_type = "movie"`:
- Poster, title, year, runtime, MPAA rating
- Genre pills
- Synopsis (collapsed to 3 lines, "Read more" expands)
- TMDB rating + up to 3 user review excerpts (from TMDB reviews endpoint)
- Watch Trailer button

For `event_type = "other"` / generic:
- `image_url` in place of poster (full-width banner style)
- Title, `event_type` badge
- `description` in place of synopsis
- `external_url` as "More Info →" link
- `venue_name` if set and no Venue FK

The card detects which mode to use from `event_type` — no prop needed.

**Empty states and copy:**

Global find-and-replace on voter-facing copy:
```
"No movies yet"      → "No events yet"
"Pick your movies"   → "Browse events"
"movie"              → "event" (lowercase, in copy only)
"Vote Yes on a movie" → "Mark what works for you"
```

Admin-facing copy stays more specific since admin is always adding movies or events explicitly.

---

### Navigation restructure

Current tab bar: Movies · Showtimes · Results
New tab bar: **Discover · Vote · Results**

**Discover tab** (replaces Movies tab):
- Rich event info cards
- No vote buttons on the cards themselves
- Trailer, synopsis, reviews, external links
- Read-only, purely informational

**Vote tab** (replaces Showtimes tab):
- All voteable options (event + showtime combinations)
- Filter pills: Event · Location · Date
- Grouped by event, collapsible
- ShowtimeCard with ✓/✕ availability toggles
- Flexible toggle
- Submit button

**Results tab** — unchanged

This separation cleanly maps to the mental model: **learn** (Discover) → **decide** (Vote) → **see outcome** (Results).

---

### VoteTab component structure

```
VoteTab
├── FilterBar (sticky)
│   ├── FilterPill (event filter)
│   ├── FilterPill (location filter)
│   ├── FilterPill (date filter)
│   └── FlexibleButton ("I'm in for anything")
│
├── HintCard (inline, shown when 0 selections and participating)
│
└── EventGroup[] (one per event)
    ├── EventGroupHeader
    │   ├── Thumbnail (poster_path or image_url)
    │   ├── Title + event_type badge
    │   └── Collapse chevron (hidden when only 1 showtime)
    │
    └── ShowtimeCard[] (collapsed by default)
        ├── Venue · Date · Time · Format
        ├── [📍 Directions]  [🔗 More Info / Book]
        └── [✓ Works]  [✕ Can't]
```

**Single-showtime detection:**
```typescript
// When an event has exactly one showtime, render as a flat card
// No collapse chevron, no nested list
function renderEventGroup(event, sessions) {
  if (sessions.length === 1) {
    return <SingleOptionCard event={event} session={sessions[0]} />
  }
  return <EventGroup event={event} sessions={sessions} />
}
```

**Filter pill behavior:**
- Tapping a pill opens a bottom sheet with options (correct pattern — filter sheets are a standard mobile convention)
- Active filter shown as dismissable amber pill with ✕
- Multiple filters are AND'd
- Groups with no matching showtimes are hidden when filters active
- Groups with partial matches show only matching showtimes but keep full event header

**Filter bottom sheet — required details:**

The sheet needs four things to feel complete:

1. **Selection state on each row** — active options get a visible indicator (amber checkmark or amber text color). The user must be able to see what's currently filtered at a glance.

2. **"All / Clear" option at the top of each list** — lets the user reset without manually deselecting. Label: "All events", "All locations", "All dates" depending on the pill. Tapping it deselects all options in that filter and dismisses.

3. **Tap affordance on list rows** — plain text on dark background doesn't read as tappable. Each row gets a subtle border-bottom `#1E1E2E` separator and a press highlight (`#1E1E2E` background flash on tap).

4. **Close affordance** — a small `✕` or "Done" button in the sheet header. Tapping outside to dismiss is fine as secondary behavior but isn't obvious to all users.

Sheet header format: `"Filter by event"` / `"Filter by location"` / `"Filter by date"` — matches the pill label.

---

### Progress bar update

Current: Joined → Movie → Showtime → Submitted
New: **Joined → Voted → Submitted** (3 steps)

`step` derives from:
- 0 — not participating
- 1 — participating, 0 selections
- 2 — participating, ≥1 session vote or flexible
- 3 — submitted

---

### What does NOT change

- Scoring algorithm (`vote_service.py`) — completely untouched
- All vote endpoints — untouched
- `POST /api/votes/complete` — untouched
- `GET /api/results/json` — untouched
- Results tab component — untouched
- Auth system — untouched
- Poll lifecycle — untouched
- `StatusChip` — untouched
- `VoteTabFooter` — untouched
- `AppHeader` — untouched

---

### Session checklist

**Backend:**
- [ ] Add `event_type`, `image_url`, `external_url`, `venue_name` to `Event` model
- [ ] Rename `Theater` Python class → `Venue` (keep `__tablename__ = "theaters"`)
- [ ] Update all `Theater`/`TheaterModel` imports → `Venue`
- [ ] Add `POST /api/admin/polls/{poll_id}/events/manual` endpoint
- [ ] Add TMDB reviews fetch to `movie_service.py` (2-3 reviews, cached)
- [ ] Update `_serialize_event()` in `api.py` to include new fields

**Frontend:**
- [ ] Rename `MoviesTab` → `DiscoverTab`, update route `/vote/movies` → `/vote/discover`
- [ ] Rename `ShowtimesTab` → `VoteTab`, update route `/vote/showtimes` → `/vote`
- [ ] Update `TabBar` — 3 tabs: Discover · Vote · Results
- [ ] Update `ProgressBar` — 3 steps: Joined · Voted · Submitted
- [ ] Build `FilterBar` with 3 filter pills + flexible button
- [ ] Build `EventGroup` with collapsible showtime list
- [ ] Build `SingleOptionCard` for single-showtime events
- [ ] Enrich `MovieInfoPanel` — synopsis expand, reviews, external links
- [ ] Global copy pass — "movie" → "event" in voter-facing strings
- [ ] Update `AppHeader` subtitle logic if needed

**Admin UI:**
- [ ] Rename "Add Movie" → "Add Event"
- [ ] Add manual entry form alongside TMDB search
- [ ] Update members/event labels where movie-specific