---
description: Run GroupGo locally for development
---

## Prerequisites
- Python 3.12 installed
- Node 18+ installed (for SPA)
- `.env.development` exists (copy from `.env.development` in repo)

## Steps

1. Make sure `.env` points at development settings. The `.env.development` file in the repo has the right values for local use — copy it:
```powershell
Copy-Item .env.development .env
```

2. Install Python dependencies (first time or after requirements.txt changes):
```powershell
pip install -r requirements.txt
```

3. Start the FastAPI dev server:
```powershell
python -m uvicorn app.main:app --reload --port 8001
```

4. The admin portal is at http://localhost:8001/admin (HTTP Basic Auth — see `.env.development` for credentials).

5. If you are working on the voter SPA, run the Vite dev server in parallel:
```powershell
cd voter-spa
npm install   # first time only
npm run dev   # starts at http://localhost:5173
```
Note: The Vite dev server proxies `/api/*` to `http://localhost:8001` (configured in `vite.config.ts`).

6. When SPA changes are ready to test in the full stack (FastAPI serving the built SPA):
```powershell
cd voter-spa
npm run build
cd ..
```
Then reload http://localhost:8001/vote/movies.

## Switching back to production settings
```powershell
Copy-Item .env.production .env
```
Or use the helper script: `scripts/use_env.ps1`.

## Notes
- In development mode (`APP_ENV=development`), the `/identify` route is available for picking a voter identity without a PIN.
- `APP_BASE_URL=http://localhost:8001` means `settings.use_https_cookies = False` — cookies will work over HTTP.
- The local DB is at `data/groupgo.db`. Delete it to reset to seed data (the seed runs automatically on startup).
