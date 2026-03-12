# GroupGo Voter Flow Redesign — Questions & Outstanding Items

Generated during `feat-voter-flow-redesign` branch work.

---

## 🔴 Blocking / Needs Answer Before Ship

### 1. `fromjson` filter availability
`movies.html` uses `{{ event.genres | fromjson }}` and `{{ poll.target_dates | fromjson | first | display_date }}` on the join_poll page. Verify `fromjson` is registered as a Jinja2 custom filter in `app/main.py` — if not, these will throw a `TemplateError` at render time.

### 2. `countdown_str` / `countdown_urgent` filters
`gg_app_header.html` and movies/showtimes/results pages reference `poll.voting_closes_at | countdown_str` and `| countdown_urgent`. These are custom filters that need to exist in `app/main.py`. If `Poll` doesn't have a `voting_closes_at` field, these references need to be guarded.

### 3. `yes_movie_count` / `voted_session_count` / `is_flexible` context vars on results page
`results.html` now reads `yes_movie_count`, `voted_session_count`, `is_flexible` from context — confirm `app/routers/api.py` `get_results` endpoint injects these variables (same as the movies page does).

### 4. `/join/{uuid}/preview` route
`join_poll.html` links to `/join/{{ poll.access_uuid }}/preview` for the "Preview Without Voting" button. This route needs to exist in the backend and set `is_participating=False` without requiring a PIN.

---

## 🟡 Design / UX Decisions Needed

### 5. Progress bar step logic
Current spec maps step 0 = none, 1 = joined, 2 = movie yes, 3 = showtime, 4 = submitted. The results page currently displays step 0 when in preview mode — is that correct, or should it show the voter's own step even on the results tab?

### 6. "Change Vote" flow — editing state in participation banner
The `gg_participation_banner.html` has an `is_editing` prop but current voter pages always set `is_editing = false`. The spec shows an "Editing" banner state distinct from "Voting". Decision needed: does clicking "Change Vote" reload the page with an `editing=true` query param, or does HTMX toggle it in place?

### 7. Submit button in participation banner vs dedicated CTA
The banner's "Submit" button calls `ggHandleSubmit()` JS, which then calls `/api/votes/complete` via `fetch()`. This is a bit fragile — consider whether submit should instead be a plain form POST to `/api/votes/complete` with HTMX redirect, so it works without JS.

### 8. Opt-out flow — where does user land after opting out?
After the "Yes, opt out" form POST to `/api/votes/participation` with `is_participating=false`, the backend redirects somewhere. Should it stay on Movies (in preview mode) or go to a dedicated "opted out" screen?

---

## 🟢 Nice-to-Have / Post-Ship

### 9. `identify.html` not yet redesigned
`templates/voter/identify.html` still uses the old desktop-style layout with the name-picker list. It should be rebuilt as a voter-shell mobile-first screen consistent with the new design.

### 10. Admin pages use old Tailwind slate color classes
The admin pages (`dashboard.html`, `members.html`, etc.) reference hardcoded Tailwind classes like `text-slate-400`, `bg-slate-700`, `border-slate-600`. These still work because Tailwind CDN generates them, but they don't use the new `--gg-*` design tokens. Consider a future pass to unify the admin UI.

### 11. `results_panel.html` "Your choices" section (personal results)
Lines 1–154 of `results_panel.html` (the "Your choices / personal results" section) still use old Tailwind classes. Only the "Overall results / GROUP STANDINGS" section was updated. A future pass should restyle the personal results section to match the new card design.

### 12. `group_progress.html` (old component) vs `gg_group_progress.html`
The old `group_progress.html` is still present and used by `results_panel.html` (line 9 — `{% include "components/group_progress.html" %}`). The results page now includes `gg_group_progress.html` separately above the panel. This creates a double group-progress card on the results page. Decision: remove the `{% include "components/group_progress.html" %}` call from `results_panel.html` OR update `results_panel.html` to use the new component.

### 13. Toast system — legacy `#gg-toast` vs inline `#gg-inline-toast`
There are now two toast mechanisms: the legacy floating `#gg-toast` (from `app.js`) and the new inline `#gg-inline-toast` used in movies.html. Consolidate these into a single system.

### 14. Trailer expand UX
When a trailer is opened on the movies page, the card gets a gold border (`trailer-open` class) but the scroll position doesn't adjust. On mobile the iframe may be below the fold. Consider auto-scrolling to the trailer on open.

### 15. No `countdown_urgent` threshold defined
The spec mentions urgency when less than 24 hours remain. The `countdown_urgent` filter needs to implement this threshold. Confirm what the threshold should be (24h? 12h? 6h?).

---

## Backend / API Questions

### 16. `/api/votes/complete` form POST
`gg_participation_banner.html` renders two forms that both POST to `/api/votes/complete`. One sets `is_complete=true` (Submit) and one sets `is_complete=false` (Change Vote). Confirm the backend handles the `is_complete=false` case to reopen editing mode.

### 17. Poll `access_uuid` — is it always populated?
The join_poll template uses `poll.access_uuid`. If a poll was created before the secure-link feature was added, it may have `access_uuid = None`. Backend should ensure all polls get a UUID on creation or migration.
