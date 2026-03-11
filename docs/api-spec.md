# GroupGo — API Specification

**Version:** 1.1  
**Date:** March 2026  
**Base URL:** `https://groupgo.yourdomain.com`  

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Conventions](#2-conventions)
3. [Health & Status](#3-health--status)
4. [Voter — Page Routes](#4-voter--page-routes)
5. [Admin — Page Routes](#5-admin--page-routes)
6. [API — Votes](#6-api--votes)
7. [API — Results](#7-api--results)
8. [API — Admin: Movies](#8-api--admin-movies)
9. [API — Admin: Showtimes & Sessions](#9-api--admin-showtimes--sessions)
10. [API — Admin: Theaters](#10-api--admin-theaters)
11. [API — Admin: Polls](#11-api--admin-polls)
12. [API — Admin: Members & Groups](#12-api--admin-members--groups)
13. [API — Admin: Jobs](#13-api--admin-jobs)
14. [Error Responses](#14-error-responses)
15. [HTMX Partial Response Conventions](#15-htmx-partial-response-conventions)

---

## 1. Authentication

### Voter Routes
Voter routes read a `token` from:
1. `Cookie: token=<uuid>` (preferred)
2. `X-User-Token: <uuid>` header (HTMX requests)

If no token is found, the server redirects to `GET /identify`.

### Admin Routes
All `/admin/*` routes require **HTTP Basic Authentication**:
```
Authorization: Basic base64(ADMIN_USERNAME:ADMIN_PASSWORD)
```
Credentials are defined via environment variables. Returning `401` includes `WWW-Authenticate: Basic realm="GroupGo Admin"` to trigger browser native login.

---

## 2. Conventions

- **Page routes** return full `text/html` documents (Jinja2 rendered).
- **HTMX partial routes** return `text/html` fragments for in-place DOM swapping. These are triggered by `HX-Request: true` header.
- **JSON API routes** (`/api/*`) return `application/json`.
- All timestamps in JSON are **UTC ISO-8601** strings: `"2026-03-14T19:00:00Z"`.
- HTTP status codes follow REST conventions. See [Error Responses](#13-error-responses).
- Pagination is not required in V1 (max ~10 movies, ~50 sessions per poll).

---

## 3. Health & Status

### `GET /healthz`

Returns application health status. Used as Docker health check.

**Auth:** None  
**Response:** `200 OK`

```json
{
  "status": "ok",
  "db": "ok",
  "version": 1
}
```

If the database is unreachable, returns `503 Service Unavailable`:
```json
{
  "status": "degraded",
  "db": "error",
  "version": 1
}
```

---

### `GET /api/admin/serpapi/status`

Checks the SerpApi account status and remaining quota. Used by the admin Showtimes page "Check API Status" button.

**Auth:** HTTP Basic  
**Response:** `200 application/json`

```json
{
  "account_status": "active",
  "plan": "Free",
  "searches_left": 187,
  "ready": true
}
```

**Errors:**
- `502` — SerpApi unreachable

---

## 4. Voter — Page Routes

### `GET /`

Voter home page. Redirects to `/identify` if no token cookie is present, otherwise renders the active poll.

**Auth:** Token cookie  
**Redirects:**
- `→ /identify` if no token
- `→ /no-poll` if no active poll exists

---

### `GET /identify`

Identity selection page. Renders a list of all family members for first-time identification.

**Auth:** None  
**Response:** `200 text/html` — renders `voter/identify.html`

---

### `POST /identify`

Processes identity selection. Sets identity token cookie.

**Auth:** None  
**Content-Type:** `application/x-www-form-urlencoded`

**Request Body:**
```
user_id=2
```

**Response:** `302 Redirect` to `/`  
**Sets Cookie:** `token=<uuid>; HttpOnly; SameSite=Lax; Max-Age=31536000`

**Errors:**
- `400` — `user_id` not provided
- `404` — `user_id` does not exist

---

### `GET /vote/movies`

Movie voting screen. Displays all movies in the active poll with current voter's votes pre-populated.

**Auth:** Token cookie  
**Response:** `200 text/html` — renders `voter/movies.html`

---

### `GET /vote/logistics`

Logistics voting screen. Displays all sessions grouped by date/theater with current voter's votes.

**Auth:** Token cookie  
**Response:** `200 text/html` — renders `voter/logistics.html`

---

### `GET /results`

Results screen. Displays ranked valid combinations and participation status.

**Auth:** Token cookie  
**Response:** `200 text/html` — renders `voter/results.html`

---

## 5. Admin — Page Routes

All admin page routes require HTTP Basic Auth and return full HTML pages.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin` | Admin dashboard — all polls overview |
| `GET` | `/admin/polls/{id}/movies` | Search and manage movies in a specific poll |
| `GET` | `/admin/polls/{id}/showtimes` | View and manage cached showtimes for a specific poll |
| `GET` | `/admin/polls/{id}/results` | Full results view with declare-winner controls |
| `GET` | `/admin/theaters` | Manage theater list |
| `GET` | `/admin/members` | Manage group members (add, edit, delete users) |

---

## 6. API — Votes

### `POST /api/votes/movie`

Cast or update a movie vote. Returns an HTMX HTML fragment replacing the movie toggle button.

**Auth:** Token cookie  
**Content-Type:** `application/x-www-form-urlencoded`  
**Headers:** `HX-Request: true`

**Request Body:**
```
event_id=3&vote=yes
```

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `event_id` | integer | — | Must exist in active poll |
| `vote` | string | `yes`, `no`, `abstain` | `abstain` clears the vote |

**Response:** `200 text/html` — HTMX fragment of the updated toggle button

```html
<button 
  hx-post="/api/votes/movie"
  hx-vals='{"event_id": 3, "vote": "no"}'
  hx-target="#movie-toggle-3"
  hx-swap="outerHTML"
  id="movie-toggle-3"
  aria-pressed="true"
  class="btn-vote btn-yes-active">
  ✓ Yes
</button>
```

**Errors:**
- `400` — missing or invalid fields
- `403` — poll is not OPEN
- `404` — event not found in active poll

---

### `POST /api/votes/session`

Cast or update a logistics vote. Returns HTMX fragment for the session toggle.

**Auth:** Token cookie  
**Content-Type:** `application/x-www-form-urlencoded`  
**Headers:** `HX-Request: true`

**Request Body:**
```
session_id=12&vote=can_do
```

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `session_id` | integer | — | Must exist in active poll |
| `vote` | string | `can_do`, `cant_do`, `abstain` | `abstain` clears the vote |

**Response:** `200 text/html` — HTMX fragment of updated session toggle

**Errors:**
- `400` — missing or invalid fields
- `403` — poll is not OPEN
- `404` — session not found in active poll

---

### `POST /api/votes/flexible`

Toggle the "I'm in — whatever you choose" bypass for the current user.

**Auth:** Token cookie  
**Content-Type:** `application/x-www-form-urlencoded`  
**Headers:** `HX-Request: true`

**Request Body:**
```
is_flexible=true
```

| Field | Type | Values |
|-------|------|--------|
| `is_flexible` | boolean string | `true`, `false` |

**Response:** `200 text/html` — HTMX fragment of updated logistics panel

**Errors:**
- `403` — poll is not OPEN

---

### `POST /api/votes/complete`

Explicitly marks the current user's voting as complete for the active poll. This is the action triggered by the **"Done Voting"** button on the logistics screen. Once set, the user appears as green/complete in the participation bar regardless of how many individual session votes they have cast.

**Auth:** Token cookie  
**Body:** None

**Response:** `200 application/json`
```json
{ "status": "complete" }
```
Also sends `HX-Trigger: voteSaved` header.

After the HTMX request completes, the client redirects to `/results`.

**Errors:**
- `403` — poll is not OPEN

---

## 7. API — Results

### `GET /api/results`

Returns the current ranked results. Called by HTMX polling on the results page every 10 seconds.

**Auth:** Token cookie  
**Headers:** `HX-Request: true`

**Response:** `200 text/html` — HTMX fragment of the results table

The fragment contains ranked combinations + participation summary.

---

### `GET /api/results/json`

JSON version for debugging or future mobile client.

**Auth:** Token cookie  
**Response:** `200 application/json`

```json
{
  "poll_id": 1,
  "poll_status": "OPEN",
  "participation": {
    "total_voters": 5,
    "fully_voted": 3,
    "voters": [
      { "name": "Alice", "fully_voted": true },
      { "name": "Bob",   "fully_voted": true },
      { "name": "Carol", "fully_voted": false },
      { "name": "Dave",  "fully_voted": true },
      { "name": "Eve",   "fully_voted": false }
    ]
  },
  "results": [
    {
      "rank": 1,
      "score": 8,
      "event": {
        "id": 3,
        "title": "Dune: Part Three",
        "poster_path": "/abc123.jpg",
        "year": 2026
      },
      "session": {
        "id": 12,
        "theater_name": "Cinemark Cedar Park",
        "session_date": "2026-03-14",
        "session_time": "19:00",
        "format": "IMAX"
      }
    }
  ],
  "no_valid_options": false
}
```

---

## 8. API — Admin: Movies

### `GET /api/admin/movies/search`

Searches TMDB for movies. Returns an HTMX HTML fragment with the result list.

**Auth:** HTTP Basic  
**Query Parameters:**

| Param | Type | Required | Notes |
|-------|------|----------|-------|
| `q` | string | Yes | Movie title search query |

**Example:** `GET /api/admin/movies/search?q=Dune`

**Response:** `200 text/html` — HTMX fragment of search results list

Each result includes: poster thumbnail, title, year, TMDB rating, "Add to Poll" button.

**Errors:**
- `400` — `q` is empty
- `502` — TMDB API unreachable

---

### `POST /api/admin/polls/{poll_id}/movies`

Adds a TMDB movie to a poll. Fetches full movie details from TMDB and stores in `events`.

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "tmdb_id": 693134
}
```

**Response:** `200 text/html` — HTMX fragment of updated movies list in the poll

**Errors:**
- `400` — `tmdb_id` not provided
- `404` — Poll not found
- `409` — Movie already in this poll
- `502` — TMDB API unreachable

---

### `DELETE /api/admin/polls/{poll_id}/movies/{event_id}`

Removes a movie from a poll. Only allowed while poll is in `DRAFT` status.

**Auth:** HTTP Basic  
**Response:** `200 text/html` — HTMX fragment with movie removed from list

**Errors:**
- `403` — Poll is not in DRAFT status
- `404` — Movie not in this poll

---

## 9. API — Admin: Showtimes & Sessions

### `POST /api/admin/showtimes/fetch`

Triggers async background job to fetch showtimes from SerpApi for specified theaters and dates.

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "poll_id": 1,
  "theater_ids": [1, 2, 3, 4],
  "dates": ["2026-03-13", "2026-03-14", "2026-03-15"]
}
```

**Rate limiting:** Max 1 request per `(theater_id, date)` per 12-hour window. Requests exceeding the limit return a `429` with `Retry-After` header.

**Response:** `202 Accepted`
```json
{
  "job_id": "a1b2c3d4-...",
  "total_tasks": 12,
  "message": "Fetch job started. Poll /api/admin/jobs/a1b2c3d4-... for progress."
}
```

**Errors:**
- `400` — Missing required fields
- `404` — Poll or theater IDs not found
- `429` — Rate limit exceeded for one or more theater/date combos

---

### `POST /api/admin/showtimes`

Manually add a single showtime. Sets `is_custom = true` and `fetch_status = 'manual'`.

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "poll_id": 1,
  "event_id": 3,
  "theater_id": 1,
  "session_date": "2026-03-14",
  "session_time": "19:00",
  "format": "IMAX"
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `session_time` | string | Yes | `HH:MM` 24-hour format |
| `format` | string | No | Default: `Standard` |

**Response:** `201 Created` + HTMX fragment of new session row

**Errors:**
- `400` — Missing or malformed fields
- `409` — Duplicate session (same event/theater/date/time/format)

---

### `DELETE /api/admin/showtimes/{session_id}`

Delete a single session record.

**Auth:** HTTP Basic  
**Response:** `200 text/html` — HTMX fragment confirming deletion (removes row from DOM)

**Errors:**
- `404` — Session not found

---

### `PATCH /api/admin/sessions/{session_id}/visibility`

Toggle whether a specific session is included in voter logistics and result calculation. Excluded sessions (`is_included=false`) are still stored but hidden from voters and not considered in scoring.

**Auth:** HTTP Basic  
**Response:** `200 application/json`

```json
{ "id": 12, "is_included": false }
```

**Errors:**
- `404` — Session not found

---

### `POST /api/admin/sessions/bulk-visibility`

Set `is_included` for multiple sessions in a single request.

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "session_ids": [1, 2, 5, 8],
  "is_included": false
}
```

**Response:** `200 application/json` — count of sessions updated

---

## 10. API — Admin: Theaters

### `GET /api/admin/theaters`

Returns the full theater list.

**Auth:** HTTP Basic  
**Response:** `200 application/json`

```json
[
  {
    "id": 1,
    "name": "Cinemark Cedar Park",
    "address": "3000 E Whitestone Blvd, Cedar Park, TX 78613",
    "serpapi_query": "Cinemark Cedar Park Texas showtimes",
    "is_active": true
  }
]
```

---

### `PATCH /api/admin/theaters/{theater_id}`

Update a theater's fields (name, address, serpapi_query, is_active).

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body** (all fields optional):
```json
{
  "is_active": false
}
```

**Response:** `200 application/json` — updated theater object

**Errors:**
- `404` — Theater not found

---

### `POST /api/admin/theaters`

Add a new theater to the database.

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "name": "Alamo Drafthouse South Lamar",
  "address": "1120 S Lamar Blvd, Austin, TX 78704",
  "serpapi_query": "Alamo Drafthouse South Lamar Austin showtimes",
  "is_active": true
}
```

**Response:** `201 Created` — new theater object

**Errors:**
- `400` — Missing `name` or `serpapi_query`

---

## 11. API — Admin: Polls

### `POST /api/admin/polls`

Create a new poll in DRAFT status.

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "title": "Weekend of March 14",
  "target_dates": ["2026-03-13", "2026-03-14", "2026-03-15"]
}
```

**Response:** `201 Created`
```json
{
  "id": 2,
  "title": "Weekend of March 14",
  "status": "DRAFT",
  "target_dates": ["2026-03-13", "2026-03-14", "2026-03-15"],
  "created_at": "2026-03-10T18:00:00Z"
}
```

**Errors:**
- `400` — Missing required fields or invalid dates

---

### `POST /api/admin/polls/{poll_id}/publish`

Transitions poll from `DRAFT` to `OPEN`. Only one poll may be OPEN at a time.

**Auth:** HTTP Basic  
**Response:** `200 application/json`

```json
{
  "id": 2,
  "status": "OPEN",
  "share_url": "https://groupgo.yourdomain.com/"
}
```

**Errors:**
- `409` — Another poll is already OPEN
- `422` — Poll has no movies or no sessions

---

### `POST /api/admin/polls/{poll_id}/close`

Transitions poll from `OPEN` to `CLOSED`. Votes are no longer accepted.

**Auth:** HTTP Basic  
**Response:** `200 application/json` — poll object with `status: "CLOSED"`

---

### `POST /api/admin/polls/{poll_id}/declare-winner`

Sets the official winning combination and generates the shareable summary.

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body:**
```json
{
  "event_id": 3,
  "session_id": 12
}
```

**Response:** `200 application/json`
```json
{
  "winner": {
    "event_id": 3,
    "session_id": 12,
    "summary": "We're seeing Dune: Part Three at Cinemark Cedar Park on Saturday, March 14 at 7:00 PM (IMAX)."
  }
}
```

**Errors:**
- `403` — Poll is not CLOSED
- `404` — event_id or session_id not in this poll

---

### `POST /api/admin/polls/{poll_id}/archive`

Transitions poll from `CLOSED` to `ARCHIVED`.

**Auth:** HTTP Basic  
**Response:** `200 application/json` — poll object with `status: "ARCHIVED"`

---

### `POST /api/admin/polls/{poll_id}/reopen`

Reopens a `CLOSED` or `ARCHIVED` poll. Resets `winner_event_id` and `winner_session_id` to NULL and sets status back to `OPEN`.

**Auth:** HTTP Basic  
**Response:** `200 application/json`

```json
{ "id": 1, "status": "OPEN" }
```

**Errors:**
- `400` — Poll is not in `CLOSED` or `ARCHIVED` status
- `404` — Poll not found

---

### `DELETE /api/admin/polls/{poll_id}`

Permanently deletes a poll and all related data (votes, sessions, poll_events, user_poll_preferences, fetch_jobs).

**Auth:** HTTP Basic  
**Response:** `200 application/json`

```json
{ "success": true, "deleted_poll_id": 1 }
```

**Errors:**
- `404` — Poll not found

---

## 12. API — Admin: Members & Groups

### `GET /api/admin/users`

Returns all registered users.

**Auth:** HTTP Basic  
**Response:** `200 application/json`

```json
[
  { "id": 1, "name": "Admin", "is_admin": true, "email": null, "group_id": 1 },
  { "id": 2, "name": "Tony", "is_admin": false, "email": null, "group_id": 1 }
]
```

---

### `POST /api/admin/users`

Create a new user (family member).

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body:**
```json
{ "name": "Laurie", "email": null, "group_id": 1 }
```

**Response:** `201 Created`
```json
{ "id": 3, "name": "Laurie" }
```

---

### `PATCH /api/admin/users/{user_id}`

Update a user's name, email, or group assignment.

**Auth:** HTTP Basic  
**Content-Type:** `application/json`

**Request Body** (all fields optional):
```json
{ "name": "Lawrence", "email": "l@example.com", "group_id": 1 }
```

**Response:** `200 application/json` — updated user object

**Errors:**
- `404` — User not found

---

### `DELETE /api/admin/users/{user_id}`

Delete a user.

**Auth:** HTTP Basic  
**Response:** `200 application/json` — `{ "deleted": user_id }`

**Errors:**
- `404` — User not found

---

### `GET /api/admin/groups`

Returns all groups.

**Auth:** HTTP Basic  
**Response:** `200 application/json` — array of `{ id, name }`

---

### `POST /api/admin/groups`

Create a new group.

**Auth:** HTTP Basic  
**Request Body:** `{ "name": "Weekend Crew" }`  
**Response:** `201 Created` — `{ "id": 2, "name": "Weekend Crew" }`

---

### `DELETE /api/admin/groups/{group_id}`

Delete a group.

**Auth:** HTTP Basic  
**Response:** `200 application/json` — `{ "deleted": group_id }`

---

## 13. API — Admin: Jobs

### `GET /api/admin/jobs/{job_id}`

Returns progress of a background fetch job. Called by HTMX polling in admin UI.

**Auth:** HTTP Basic  
**Headers:** `HX-Request: true`

**Response:** `200 text/html` — HTMX fragment of progress indicator

When `status = 'complete'` or `status = 'failed'`, the response includes `HX-Trigger: jobComplete` header so HTMX can trigger a page section refresh.

JSON equivalent available at `GET /api/admin/jobs/{job_id}/json`:

```json
{
  "job_id": "a1b2c3d4-...",
  "status": "running",
  "total_tasks": 12,
  "completed_tasks": 7,
  "failed_tasks": 1,
  "percent": 58,
  "started_at": "2026-03-10T18:05:00Z",
  "finished_at": null
}
```

**Errors:**
- `404` — Job not found

---

## 14. Error Responses

All JSON error responses follow this structure:

```json
{
  "error": {
    "code": "POLL_NOT_OPEN",
    "message": "Votes cannot be cast because the poll is not currently open.",
    "status": 403
  }
}
```

### Error Codes

| HTTP Status | Code | Meaning |
|-------------|------|---------|
| 400 | `VALIDATION_ERROR` | Missing or malformed request fields |
| 401 | `UNAUTHORIZED` | Admin credentials missing or invalid |
| 403 | `POLL_NOT_OPEN` | Vote submitted to non-OPEN poll |
| 403 | `POLL_NOT_CLOSED` | Declare winner attempted on non-CLOSED poll |
| 404 | `NOT_FOUND` | Resource does not exist |
| 409 | `DUPLICATE` | Resource already exists (duplicate movie, session, etc.) |
| 409 | `POLL_CONFLICT` | Attempt to open a second poll while one is OPEN |
| 422 | `PUBLISH_BLOCKED` | Poll missing movies or sessions |
| 429 | `RATE_LIMITED` | SerpApi trigger rate limit exceeded |
| 502 | `UPSTREAM_ERROR` | TMDB or SerpApi returned an error |
| 503 | `DB_ERROR` | Database unreachable |

---

## 15. HTMX Partial Response Conventions

The application uses HTMX for all interactive updates. The following conventions apply to all HTMX routes:

### Target ID Naming
Each swappable DOM element has a predictable ID:

| Element | ID Pattern | Example |
|---------|-----------|---------|
| Movie vote toggle | `movie-toggle-{event_id}` | `movie-toggle-3` |
| Session vote toggle | `session-toggle-{session_id}` | `session-toggle-12` |
| Flexible bypass / logistics panel | `logistics-panel` | — |
| Results panel | `results-panel` | — |
| Job progress indicator | `job-progress` | — |
| Movie list (admin) | `admin-movie-list` | — |
| Showtime list (admin) | `admin-session-list` | — |

### Response Headers Used

| Header | When Used | Purpose |
|--------|-----------|---------|
| `HX-Trigger: voteSaved` | After any vote POST | Triggers toast notification |
| `HX-Trigger: jobComplete` | When fetch job finishes | Triggers showtime list refresh |
| `HX-Redirect: /identify` | Token not found | Full redirect for non-HTMX fallback |
| `HX-Reswap: outerHTML` | Default for toggle buttons | Replaces entire element |
