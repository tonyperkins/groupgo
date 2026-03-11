# GroupGo — Product Requirements Document (PRD)

**Version:** 1.1  
**Date:** March 2026  
**Status:** Active  

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [User Roles](#2-user-roles)
3. [Functional Requirements](#3-functional-requirements)
4. [Non-Functional Requirements](#4-non-functional-requirements)
5. [User Stories & Acceptance Criteria](#5-user-stories--acceptance-criteria)
6. [Result Calculation Algorithm](#6-result-calculation-algorithm)
7. [Out of Scope (V1)](#7-out-of-scope-v1)
8. [V2 Considerations](#8-v2-considerations)

---

## 1. Product Vision

GroupGo is a lightweight, mobile-first web application that eliminates friction in scheduling group movie outings. It solves the three-dimensional coordination problem — **Movie × Showtime × Location** — using a curated polling model with approval voting and veto power. An admin curates a shortlist; family members vote independently; the app surfaces the mathematically optimal choice.

### Goals
- Reduce "what movie / when / where" group chat threads to zero.
- Respect every member's constraints via veto power while maximizing overall participation.
- Keep operational cost near zero (free-tier APIs, self-hosted infrastructure).
- Complete the weekly planning cycle in under 10 minutes of total effort across all participants.

### Success Metrics (V1)
- Admin can generate and publish a poll in < 5 minutes.
- Any voter can complete their full vote on mobile in < 3 minutes.
- System reliably caches showtimes within SerpApi's 250/month free quota.

---

## 2. User Roles

### 2.1 Admin (Curator)
A single trusted family member who manages polls. Responsibilities:
- Search for and curate movie options.
- Trigger showtime fetching for target theaters and dates.
- Review and manually correct cached showtime data.
- Publish polls and share the URL.
- Close polls and lock in results.

### 2.2 Voter (Family Member)
Any of the five family members. Responsibilities:
- Identify themselves on first visit (persistent token stored client-side).
- Vote approval/rejection on each movie option.
- Vote availability on each Day/Time/Theater combination.
- Optionally invoke the "I'm in, whatever" bypass.

> **Assumption:** All voters are known, trusted individuals. The security model is anti-accident, not anti-adversarial.

---

## 3. Functional Requirements

### 3.1 Authentication & Identity

| ID | Requirement |
|----|-------------|
| AUTH-01 | The system MUST provide a "Who are you?" identity selection on first visit. |
| AUTH-02 | On selection, the system MUST persist the user's identity as a UUID token in `localStorage` and an HTTP-only cookie. |
| AUTH-03 | Returning visitors MUST be auto-identified without re-selecting. |
| AUTH-04 | Users MUST be able to switch identity via a menu option (covers shared devices). |
| AUTH-05 | Admin routes (`/admin/*`) MUST be protected by HTTP Basic Auth using credentials stored in server environment variables. |
| AUTH-06 | The SerpApi trigger endpoint MUST be rate-limited to 1 request per theater per date per 12-hour window to prevent quota waste. |

### 3.2 Movie Management (Admin)

| ID | Requirement |
|----|-------------|
| MOV-01 | Admin MUST be able to search for a movie by title via the TMDB API. |
| MOV-02 | Search results MUST display a disambiguated list showing poster thumbnail, title, release year, and TMDB rating — not just the top result. |
| MOV-03 | Admin MUST be able to add a selected movie to the active poll. |
| MOV-04 | Admin MUST be able to remove a movie from the poll while in DRAFT status. |
| MOV-05 | Each movie in the poll MUST display: poster image, title, year, synopsis (truncated), TMDB rating, runtime, and genre tags. |
| MOV-06 | Each movie MUST display an embedded YouTube trailer if a trailer ID exists in TMDB data. Trailers MUST be click-to-play (no autoplay). |
| MOV-07 | If no trailer exists in TMDB data, the movie card MUST display a "No trailer available" placeholder without breaking layout. |
| MOV-08 | The TMDB API MUST be queried with `include_adult=false` at all times. |

### 3.3 Showtime Management (Admin)

| ID | Requirement |
|----|-------------|
| SHO-01 | Admin MUST be able to select target dates for showtime fetching (calendar date picker, defaulting to upcoming Fri/Sat/Sun). |
| SHO-02 | The backend MUST loop through all active theaters × target dates and execute SerpApi queries asynchronously. |
| SHO-03 | Raw SerpApi responses MUST be cached in SQLite. The frontend MUST NEVER trigger SerpApi directly. |
| SHO-04 | The backend MUST deduplicate showtimes, normalizing time strings and extracting format tags (Standard, 3D, IMAX, Dolby, Laser, D-BOX). |
| SHO-05 | Each cached showtime record MUST store a `fetch_timestamp` and `fetch_status` (success / partial / failed). |
| SHO-06 | Admin MUST be able to manually add a showtime record if the scrape misses one. |
| SHO-07 | Admin MUST be able to manually delete an individual showtime record. |
| SHO-08 | Admin MUST be able to re-trigger a fetch for a specific theater/date combination with a single action. |
| SHO-09 | The admin UI MUST prominently display the `fetch_timestamp` for each theater/date block so freshness is always visible. |

### 3.4 Theater Management (Admin)

| ID | Requirement |
|----|-------------|
| THE-01 | Theaters MUST be stored in the SQLite database with: `name`, `address`, `serpapi_query` string, `is_active` flag. |
| THE-02 | Admin MUST be able to toggle a theater active/inactive without a code deployment. |
| THE-03 | Only `is_active = true` theaters are included in showtime fetch operations. |
| THE-04 | The initial theater list MUST include geographically balanced options for Leander and North Austin (e.g., Cinemark Cedar Park, Alamo Drafthouse Lakeline, Domain/Gateway area theaters). |

### 3.5 Poll Lifecycle

| ID | Requirement |
|----|-------------|
| POLL-01 | A poll MUST exist in one of four states: `DRAFT`, `OPEN`, `CLOSED`, `ARCHIVED`. |
| POLL-02 | Only one poll MAY be in `OPEN` status at a time. |
| POLL-03 | Admin MUST be able to transition a poll: `DRAFT → OPEN`, `OPEN → CLOSED`, `CLOSED → ARCHIVED`. |
| POLL-04 | Admin MUST be able to **reopen** a `CLOSED` or `ARCHIVED` poll, resetting any declared winner and returning status to `OPEN`. |
| POLL-05 | Admin MUST be able to **permanently delete** a poll and all related data (votes, sessions, preferences). |
| POLL-06 | Votes MUST NOT be accepted on polls in `DRAFT`, `CLOSED`, or `ARCHIVED` status. |
| POLL-07 | Admin MUST be able to view all past polls in any status on the dashboard. |
| POLL-08 | A poll MUST have a human-readable title (e.g., "Weekend of March 14") auto-generated from target dates, editable by admin. |

### 3.6 Voting — Movie Screen

| ID | Requirement |
|----|-------------|
| VOTE-01 | The voter's movie screen MUST display all movies in the active poll as swipeable/scrollable cards. |
| VOTE-02 | Each movie card MUST have a binary toggle: **Yes** (approval) or **No** (rejection). Default state is unvoted. |
| VOTE-03 | Votes MUST be saved to the backend in real time on each toggle (HTMX partial updates). |
| VOTE-04 | A visible "saved" confirmation (e.g., toast or icon pulse) MUST appear after each vote is persisted. |
| VOTE-05 | Users MUST be able to change their vote at any time while the poll is `OPEN`. |
| VOTE-06 | A voter who has not voted on a movie MUST be treated as **abstain** (neither approval nor veto) in the algorithm. |

### 3.7 Voting — Logistics Screen

| ID | Requirement |
|----|-------------|
| LOG-01 | The logistics screen MUST display all available Day/Time/Theater combinations from the cached showtime data (only `is_included=true` sessions). |
| LOG-02 | Each session MUST have a **single toggle button** that alternates between **Can Do** (green) and **Can't Do** (gray/default). Sessions default to Can't Do — voters only need to mark times they **can** attend. |
| LOG-03 | A global **"I'm In — Whatever You Choose!"** bypass toggle MUST be available at the top of the logistics panel. |
| LOG-04 | Activating the bypass MUST set `is_flexible=true` in `user_poll_preferences` — voter is excluded from all veto checks and counted as +1 approval for all combinations. |
| LOG-05 | Deactivating the bypass MUST restore the voter's individual combination votes. |
| LOG-06 | Logistics votes MUST be saved in real time via HTMX with a toast confirmation. |
| LOG-07 | A **"Done Voting"** button MUST be present at the bottom of the logistics panel (when not in flexible mode). Clicking it MUST set `has_completed_voting=true` in `user_poll_preferences` and redirect to `/results`. |
| LOG-08 | Back navigation from logistics to movie screen MUST preserve all previously entered votes without reset. |

### 3.8 Results

| ID | Requirement |
|----|-------------|
| RES-01 | The results view MUST be accessible to all voters and the admin at any time while the poll is `OPEN` or `CLOSED`. |
| RES-02 | The winning combination MUST be determined by the algorithm defined in Section 6. |
| RES-03 | The results view MUST display the top-ranked valid combinations (minimum 3 if available), not just the single winner, ranked by score. |
| RES-04 | Each displayed combination MUST show: movie poster/title, date, time, theater name, format, and approval score. |
| RES-05 | The results view MUST display a participation summary: "X of 5 members have fully voted." |
| RES-06 | If no valid combination exists (all options vetoed), the UI MUST display a clear "No valid options — contact the group" state. |
| RES-07 | Results MUST recalculate and update in real-time as votes are submitted (HTMX polling or SSE). |
| RES-08 | When the poll is `CLOSED`, admin MUST be able to mark one combination as the **official winner**, locking it visually. |
| RES-09 | The official winner MUST be shareable as a plain-text summary (copy-to-clipboard) for pasting into group chat. |

### 3.9 Participation Tracking

| ID | Requirement |
|----|-------------|
| PAR-01 | The app MUST display which members have voted and which have not on the results/admin view using colored initials badges. |
| PAR-02 | "Fully voted" is defined as ANY ONE of the following conditions being true: (a) voter has `is_flexible=true`, (b) voter has `has_completed_voting=true`, or (c) voter has cast a vote on all events in the poll AND on all `is_included` sessions for movies they voted "yes" on. |
| PAR-03 | Participation state MUST update in real-time as votes are cast. |

### 3.10 Member Management (Admin)

| ID | Requirement |
|----|-------------|
| MEM-01 | Admin MUST be able to add, rename, and delete group members via the **Members** admin page (`/admin/members`). |
| MEM-02 | Admin MUST be able to assign members to groups for future multi-group support. |
| MEM-03 | Only the Admin user is seeded on first install — all other members are created through the UI. |

### 3.11 Showtime Visibility (Admin)

| ID | Requirement |
|----|-------------|
| VIS-01 | Admin MUST be able to toggle individual sessions as included/excluded (`is_included`) without deleting them. |
| VIS-02 | Excluded sessions MUST NOT appear in voter logistics or be considered in result scoring. |
| VIS-03 | Admin MUST be able to bulk-toggle session visibility (e.g., exclude all sessions for a given date). |

---

## 4. Non-Functional Requirements

### 4.1 Performance
- Page initial load on a mobile 4G connection MUST be < 2 seconds.
- Vote toggle response (HTMX round-trip) MUST be < 300ms on local network.
- SerpApi batch fetch for 3 dates × 4 theaters MUST complete within 30 seconds (async background task).

### 4.2 Reliability
- The application MUST remain functional (read-only mode for voters) if TMDB or SerpApi are unreachable.
- SQLite database MUST be persisted on a named Docker volume — no data loss on container restart.
- A `/healthz` endpoint MUST return `{"status": "ok"}` and be used as the Docker health check.

### 4.3 Security
- Admin credentials MUST be stored in environment variables, never in source code or committed config files.
- API keys (TMDB, SerpApi) MUST be stored in environment variables.
- The `?user=` URL parameter MUST only be used for initial token seeding; all subsequent requests MUST use the cookie/localStorage token.
- All external traffic MUST be served over HTTPS via Cloudflare Tunnel.

### 4.4 Usability
- All interactive touch targets MUST meet the 44×44px minimum.
- All toggle states MUST have `aria-pressed` attributes for screen reader support.
- The application MUST function correctly on iOS Safari 16+ and Android Chrome 110+.
- YouTube trailer iframes MUST use `loading="lazy"` to prevent mobile slowdowns.

### 4.5 Maintainability
- The database schema MUST use generic entity names (`Events`, `Sessions`, `Votes`) per V2 future-proofing.
- All datetime values MUST be stored as UTC ISO-8601 strings in SQLite.
- The theater list MUST be database-driven, not hardcoded.

### 4.6 Cost
- Monthly operational cost MUST remain at or near $0 using free tiers.
- SerpApi usage MUST stay within 250 searches/month via caching and rate limiting.

---

## 5. User Stories & Acceptance Criteria

### Epic: Admin — Poll Creation

---

**US-01: Search for a movie**
> As an Admin, I want to search for a movie by title so I can add it to the poll.

**Acceptance Criteria:**
- [ ] Search input is present on the admin dashboard.
- [ ] Submitting the search calls TMDB `/search/movie` and returns a ranked list.
- [ ] Each result shows: poster thumbnail (or placeholder), title, release year, TMDB rating.
- [ ] Clicking "Add to Poll" on a result adds that movie to the current DRAFT poll.
- [ ] Duplicate movies cannot be added to the same poll.

---

**US-02: Fetch showtimes**
> As an Admin, I want to fetch showtimes for my target theaters and dates so voters have real scheduling data.

**Acceptance Criteria:**
- [ ] Admin can select 1–7 target dates on a calendar.
- [ ] "Fetch Showtimes" button triggers async backend jobs for each active theater × date.
- [ ] Admin sees a live progress indicator (e.g., "Fetching 3 of 12...").
- [ ] On completion, each theater/date block shows fetch status and timestamp.
- [ ] Failed fetches are clearly marked; admin can retry individually.

---

**US-03: Manually correct showtimes**
> As an Admin, I want to add or remove individual showtimes so the poll data is accurate even when the scraper misses something.

**Acceptance Criteria:**
- [ ] Admin can click "Add Showtime" on any theater/date block and enter time + format.
- [ ] Admin can click a trash icon on any individual showtime to delete it.
- [ ] Changes are reflected immediately in the voter's logistics view.

---

**US-04: Publish a poll**
> As an Admin, I want to publish the poll so family members can vote.

**Acceptance Criteria:**
- [ ] A "Publish Poll" button transitions the poll from DRAFT to OPEN.
- [ ] Publishing is blocked if no movies and no showtimes have been added.
- [ ] After publishing, admin is shown the shareable poll URL.
- [ ] Voters who visit the URL see the active poll immediately.

---

### Epic: Voter — Casting Votes

---

**US-05: Identify myself**
> As a Voter, I want to tell the app who I am on my first visit so my votes are attributed correctly.

**Acceptance Criteria:**
- [ ] A "Who are you?" modal appears on first visit (no prior token found).
- [ ] Modal shows a list of all registered family members.
- [ ] Selecting a name stores a UUID token in localStorage and cookie.
- [ ] Subsequent visits skip the modal and auto-identify the voter.
- [ ] A "Not you?" link allows switching identity.

---

**US-06: Vote on movies**
> As a Voter, I want to approve or reject each movie option so my preferences are captured.

**Acceptance Criteria:**
- [ ] Movie screen shows all poll movies as cards with full metadata.
- [ ] Each card has a Yes/No toggle; default is unvoted (neutral).
- [ ] Tapping Yes highlights the button green; tapping No highlights it red.
- [ ] Each toggle triggers a real-time HTMX POST; a save indicator confirms persistence.
- [ ] Voter can toggle back and forth freely.

---

**US-07: Vote on logistics**
> As a Voter, I want to mark each showtime as "Can Do" or "Can't Do" so the algorithm knows my availability.

**Acceptance Criteria:**
- [ ] Logistics screen groups showtimes by date, then theater.
- [ ] Each combination has a three-state toggle: Can Do / Can't Do / Unvoted.
- [ ] "Can't Do" is visually distinct (red/blocked) to clearly communicate veto intent.
- [ ] Votes save in real time.
- [ ] A "I'm in — whatever you choose" toggle at the top bypasses all individual logistics votes.

---

**US-08: View results**
> As a Voter, I want to see the current best combination so I know what the group is leaning toward.

**Acceptance Criteria:**
- [ ] Results tab/screen is accessible at any time during an open poll.
- [ ] Top-ranked valid combinations are shown (up to 5).
- [ ] Each result shows movie, date, time, theater, format, and vote score.
- [ ] Participation counter shows "X/5 fully voted."
- [ ] If no valid option exists, a clear message is shown.

---

### Epic: Admin — Closing a Poll

---

**US-09: Close poll and declare winner**
> As an Admin, I want to close the poll and mark the official winner so the group knows the plan.

**Acceptance Criteria:**
- [ ] Admin can close the poll from the admin dashboard.
- [ ] Closing transitions status to CLOSED; no new votes are accepted.
- [ ] Admin sees the ranked results and selects the official winner with one click.
- [ ] A shareable plain-text summary is generated: "We're seeing [Movie] at [Theater] on [Date] at [Time]."
- [ ] Copy-to-clipboard button is present on the summary.

---

## 6. Result Calculation Algorithm

### Inputs
- Set of voters `V` (size 5)
- Set of movies `M` in the poll
- Set of showtime sessions `S` (each session = date + time + theater + format)
- For each voter `v` and movie `m`: `movie_vote(v, m)` ∈ {Yes, No, Abstain}
- For each voter `v` and session `s`: `session_vote(v, s)` ∈ {CanDo, CantDo, Abstain}
- For each voter `v`: `flexible(v)` ∈ {true, false} (bypass flag)

### Step 1 — Build Candidate Combinations
Generate the Cartesian product: all `(m, s)` pairs where session `s` exists in the showtime data.

### Step 2 — Apply Veto Elimination
A combination `(m, s)` is **eliminated** if ANY of the following is true for any voter `v` where `flexible(v) = false`:
- `movie_vote(v, m) = No`
- `session_vote(v, s) = CantDo`

Flexible voters (`flexible(v) = true`) are **excluded from all veto checks**.

### Step 3 — Score Remaining Combinations
For each surviving `(m, s)`, compute a score:

```
score(m, s) = movie_approvals(m) + session_approvals(s)

movie_approvals(m)   = COUNT of voters where movie_vote(v, m) = Yes  (flexible voters count as Yes)
session_approvals(s) = COUNT of voters where session_vote(v, s) = CanDo  (flexible voters count as CanDo)
```

Maximum possible score = `2 × |V|` = 10.

### Step 4 — Rank and Return
Sort surviving combinations by `score` descending. On tie, secondary sort by: earlier date → earlier time.

Return the ranked list. The top entry is the **recommended winner**.

### Edge Cases
| Scenario | Behavior |
|----------|----------|
| No combinations survive Step 2 | Display "No valid options" state; do not calculate winner |
| Only one combination survives | Display it as winner regardless of score |
| All voters are flexible | All combinations survive; winner is highest scored by count of Yes votes on movies only |
| Voter has not voted on any option | Treated entirely as Abstain; not counted for or against |

---

## 7. Out of Scope (V1)

- Email or SMS notifications
- Push notifications / PWA service worker
- Integration with ticketing platforms (Fandango, AMC)
- User account creation or password management
- Multiple simultaneous open polls
- Non-movie event types (restaurants, activities)
- Mobile native app
- Streaming vs. theatrical distinction
- Accessibility beyond WCAG 2.1 AA touch/aria basics

---

## 8. V2 Considerations

These items are explicitly deferred but the V1 schema and architecture MUST NOT block them:

| Feature | V1 Preparation |
|---------|----------------|
| Generic events (lunches, activities) | `is_custom_event` flag + generic table names |
| Larger group size | No hardcoded group size; use `COUNT(DISTINCT user_id)` |
| Email nudges | `users` table has `email` column (nullable in V1) |
| PWA | `manifest.json` and service worker stub created but not wired |
| Booking links | `sessions` table has `booking_url` column (nullable in V1) |
| Multi-admin | `users` table has `is_admin` boolean |
