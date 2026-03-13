# GroupGo — Project Analysis & Recommendations

## Overall Assessment

The brief is well-structured and unusually precise for an MVP doc. The stack choice (HTMX + FastAPI + SQLite) is appropriately matched to the scale, the SerpApi caching strategy is correctly designed, and the V2 generic schema flag is a smart low-cost hedge. The gaps below are not criticisms — they are the natural "second pass" items that any real implementation will hit.

---

## 1. Authentication & Identity

**The biggest risk in the current design.**

- `?user=alex` as a URL parameter means anyone can vote as anyone else — intentionally or accidentally (e.g., sharing the wrong link, re-clicking an old message).
- There is no admin authentication mentioned. Anyone who discovers the URL could trigger SerpApi queries (burning quota) or publish polls.

**Recommendations:**
- Issue each family member a unique persistent token (UUID stored in a cookie or `localStorage`) on first "who are you?" selection. Subsequent visits auto-identify them.
- Protect admin routes with a single shared password (HTTP Basic Auth or a simple hardcoded env-var secret is sufficient for a family app). Do **not** skip this even for V1.
- Rate-limit the admin "fetch showtimes" endpoint to prevent accidental double-triggers wasting SerpApi quota.

---

## 2. Result Calculation Algorithm

The brief states "maximum mutual approval, automatically eliminating any option with a veto" but leaves several edge cases unspecified that will directly affect the UI and backend logic:

- **Cross-dimensional vetoes:** A user voting "Yes" on Movie A but "Can't Do Saturday" should effectively veto the combo *Movie A + Saturday*, not just Saturday in isolation. The current description implies movies and logistics are scored independently, which would produce incorrect winners.
- **No-winner scenario:** What is displayed if every combination has at least one veto? ("No options work this weekend" needs a graceful state.)
- **Tiebreaker:** When two combinations have equal approval scores, what wins? (Earliest time? Alphabetical? Admin-chosen priority?)
- **Quorum:** Does the result calculate live with partial votes, or only once all 5 have voted? A live "current leader" display with a "waiting on 2 more votes" banner would be more useful than a binary "calculating/done."

**Recommendation:** Formalize the algorithm before writing the scoring logic. Suggested model:
1. Build a matrix of (Movie × Showtime) combinations.
2. Eliminate any cell where *any* voter has vetoed either the movie *or* the showtime.
3. Score remaining cells by sum of "Yes" votes across both dimensions.
4. Return ranked results, not just the winner.

---

## 3. Poll Lifecycle Management

Not addressed in the brief at all:

- Can there be **multiple active polls** simultaneously? (e.g., admin creates a new one before the last outing happened)
- What happens to **past polls**? Are they archived, viewable, or deleted?
- Can an admin **close voting** and lock in a result?
- What if a **showtime is cancelled** after the poll is published and people have voted?
- Can users **change their votes** after submission?

**Recommendation:** Define a `Poll` status enum at minimum: `DRAFT → OPEN → CLOSED → ARCHIVED`. Even if V1 only uses `OPEN` and `CLOSED`, the schema needs this column from day one.

---

## 4. SerpApi Fragility & Fallback

SerpApi wraps Google's "showtimes widget" — a UI scraping target that Google has changed without notice before.

- **No fallback strategy** is defined for when SerpApi returns 0 results (theater not indexed, widget format changed, API outage).
- The admin has no way to **manually enter or correct showtimes** if the scrape fails or returns wrong data.
- **Cache staleness:** Showtimes can be pulled Wednesday but screenings added/removed by Saturday. The UI should display a "last fetched" timestamp and give the admin a one-click "re-fetch" button.

**Recommendations:**
- Build a simple admin UI for manually adding/editing/removing individual showtime entries.
- Display fetch timestamp prominently in both admin and voter views.
- Add a `fetch_status` field to cached records (`success`, `partial`, `failed`) so the admin can see at a glance which theaters need attention.

---

## 5. Notification & Coordination

The current model is "share a URL and hope everyone votes." There is no way to know if everyone has voted without checking the app.

- No **push notifications** when a poll is published.
- No **vote completion alerts** when all members have voted.
- No way to **nudge** someone who hasn't voted.

**Recommendation (V1-feasible):**
- Add a simple "copy reminder link" button that generates a pre-filled iMessage/SMS deep link.
- Display a voter participation summary in the results view: "4/5 voted — waiting on Mom."
- A simple "email results" button that formats the winner into a plain-text email is low-effort and high-value.

**V2 option:** Cloudflare Workers + Cloudflare Email Routing can send notifications with zero additional infrastructure since you're already using Cloudflare Tunnel.

---

## 6. Theater List Management

The brief hardcodes geographic logic in prose ("Cinemark Cedar Park or Domain area") but doesn't define where this list lives in the system.

- Is it **hardcoded** in the backend config?
- Can the **admin add/remove theaters** from a UI?
- Does each theater have a stored **SerpApi query string** (e.g., `"Alamo Drafthouse Lakeline showtimes"`) that may need tuning?

**Recommendation:** Store theaters as a named table in SQLite with columns: `id`, `name`, `serpapi_query`, `address`, `is_active`. Expose a minimal admin UI to toggle theaters active/inactive. This costs one day of work and prevents needing a code deploy to add a new venue.

---

## 7. Voting UX Edge Cases

- **Partial votes:** What if a user votes on movies but closes the app before voting on logistics? Is this a valid partial response, or is the vote discarded?
- **"I'm in, whatever you choose" bypass:** This is a good feature but needs precise definition. Does it mean the user's vote is counted as "Yes" for all remaining options, or are they simply excluded from the veto pool?
- **Back navigation:** The two-screen flow (Movies → Logistics) needs a clear back button and state preservation (don't reset movie votes when returning from logistics screen).
- **Vote confirmation:** Is there a final "Submit" action, or are votes saved on toggle? HTMX makes real-time saves natural, but users need feedback ("Your votes are saved").

---

## 8. TMDB Search & Movie Selection

- TMDB search returns **multiple results** for any title. The brief doesn't address how the admin disambiguates (e.g., "The Batman" returns ~15 entries).
- What if the **trailer is unavailable** for a particular movie? (TMDB doesn't always have YouTube trailer data.)
- **Adult content filter:** TMDB returns adult content by default unless filtered. Add `include_adult=false` to all API queries.

**Recommendation:** Admin movie search should return a result list with poster thumbnails and year for disambiguation, not just the top result.

---

## 9. Deployment & Operations

The Docker + Portainer + Cloudflare Tunnel stack is solid, but the brief omits operational concerns:

- **SQLite persistence:** The Docker container needs a named volume mount for the SQLite file. If the container is recreated without this, all data is lost.
- **Backup strategy:** Even a weekly `cron` job copying the SQLite file to a mounted backup directory is sufficient and should be mentioned.
- **Health check endpoint:** A `GET /healthz` route should be defined for Portainer/Docker to monitor container status.
- **Container restart policy:** `restart: unless-stopped` should be in the `docker-compose.yml` to survive server reboots.
- **Environment variable management:** TMDB API key and SerpApi key must be passed via `.env` file, never baked into the image. Document this explicitly.

---

## 10. Schema Design Additions

Beyond the `is_custom_event` flag mentioned in the brief, consider these fields from day one:

| Table | Missing Column | Reason |
|---|---|---|
| `Events` | `created_at`, `updated_at` | Audit trail, ordering |
| `Sessions` | `fetch_timestamp`, `fetch_status` | Cache freshness visibility |
| `Sessions` | `format` (Standard / 3D / IMAX / Dolby) | Normalized from deduplication |
| `Votes` | `voted_at`, `updated_at` | Detect stale votes if poll changes |
| `Users` | `token` (UUID) | Persistent identity beyond dropdown |
| `Polls` | `status` enum | Lifecycle management |
| `Theaters` | `serpapi_query`, `is_active` | Dynamic theater management |

---

## 11. Showtime Deduplication — Suggested Approach

The brief flags this as a known hard problem. A concrete approach:

1. **Normalize the time string** first: strip all whitespace, parse to `HH:MM AM/PM`.
2. **Extract format tags** via keyword matching: if the raw string contains `3D`, `IMAX`, `Dolby`, `D-BOX`, `Laser`, etc., tag the session. Default to `Standard`.
3. **Group by** `(theater_id, date, time, movie_id)` — deduplicate on this composite key, keeping the most specific format label.
4. **Present in UI as** time buttons with optional format badge (e.g., `7:00 PM · IMAX`) rather than a flat list.

---

## 12. Minor Items

- **Timezone:** All users are local but store all datetimes as UTC in SQLite with timezone offset in a config setting. Prevents DST-related display bugs.
- **Trailer loading:** Lazy-load YouTube iframes (use `loading="lazy"` on the iframe or a click-to-load poster pattern) to prevent the movie list from being slow on mobile.
- **Accessibility basics:** Ensure toggle buttons meet 44×44px touch target minimum and have `aria-pressed` states. HTMX makes this easy to overlook.
- **PWA manifest:** A 30-minute addition of a `manifest.json` and service worker shell lets family members "Add to Home Screen" for an app-like experience. Pairs well with the mobile-first approach.
- **"5 person" assumption:** The user table and vote tallying logic should not hardcode `5`. Use `COUNT(DISTINCT user_id)` for quorum checks so the group size can change without code edits.

---

## Priority Summary

| Priority | Item |
|---|---|
| **Critical** | Admin authentication (protect SerpApi quota + poll management) |
| **Critical** | Cross-dimensional veto logic in result algorithm |
| **High** | Poll status/lifecycle (`DRAFT / OPEN / CLOSED`) |
| **High** | Manual showtime override + fetch timestamp display |
| **High** | Docker volume mount + env var documentation |
| **Medium** | Theater table in SQLite with admin toggle UI |
| **Medium** | Persistent user token (UUID cookie) |
| **Medium** | Vote participation tracker ("waiting on 2 more") |
| **Low** | PWA manifest |
| **Low** | Notification / nudge mechanism |
