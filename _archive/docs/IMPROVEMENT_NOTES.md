# Improvement Notes

## Resolved in this pass

### 1. Vote service test failures
- The failing `tests/test_vote_service.py` cases were resolved.
- Root cause: the tests expected non-admin voters with IDs `2..5`, but the test fixture only seeded the admin user.
- Fix applied:
  - added explicit non-admin test voters in `tests/conftest.py`
- Verification:
  - `python -m pytest -q` now passes

### 2. Stale / duplicate frontend behavior between `base.html` and `static/js/app.js`
- Shared toast behavior is now centralized in `static/js/app.js`.
- Fixes applied:
  - `app.js` now targets `#gg-toast`
  - `app.js` exposes a shared `showToast()` helper
  - duplicate inline toast implementations were removed from `templates/base.html` and `templates/admin/base_admin.html`
  - shared `confirmHtmxButton()` helper was added for HTMX confirm flows

### 3. Unused or duplicate template artifact present
- The obsolete duplicate file `templates/admin/theaters_new.html` was removed.
- The active authoritative template is now `templates/admin/theaters.html`.

### 4. Limited automated coverage for UI/template regressions
- Added minimal rendering smoke coverage in `tests/test_route_smoke.py`.
- Current smoke coverage includes:
  - voter identify page
  - voter movies page
  - voter logistics page
  - admin dashboard
  - admin showtimes page

### 5. SQLAlchemy metadata warning during tests
- The test teardown warning from `drop_all()` on the in-memory schema cycle was resolved.
- Fixes applied in `tests/conftest.py`:
  - switched the in-memory SQLite engine to `StaticPool`
  - stopped calling `SQLModel.metadata.drop_all()` during teardown
  - dispose the engine directly instead

### 6. TemplateResponse deprecation warnings
- Updated route/template responses to use the current request-first `TemplateResponse` signature.
- Verification:
  - test suite now runs cleanly without the previous template deprecation warnings

## Partially improved

### 7. Template JavaScript is still somewhat inline-heavy
- This was improved, but not fully eliminated.
- Fixes applied:
  - several brittle Jinja-heavy inline handlers were converted to `data-*` driven handlers
  - shared HTMX confirmation behavior is now centralized for common delete flows
- Remaining follow-up:
  - continue moving page-local interaction helpers into shared JS modules
  - prefer delegated listeners over inline `onclick` where practical
  - add a lightweight lint pass for HTML with embedded JavaScript

## Still remaining

### 8. Admin mutations often force full page reloads
- Many admin actions still call `window.location.reload()` after success.
- This is functional, but still coarse from a UX perspective.
- Recommended follow-up:
  - replace reloads with targeted HTMX refreshes where practical
  - reserve full reloads for page-wide lifecycle transitions

### 9. Tailwind is loaded from CDN at runtime
- The application still uses the Tailwind CDN script directly in templates.
- Recommended follow-up:
  - move to a build-based Tailwind setup
  - pin the version explicitly
  - generate only the classes the app uses

## Current verification status

- `python -m pytest -q`
  - **33 passed**
