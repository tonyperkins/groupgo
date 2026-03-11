# GroupGo — Developer Setup Guide

**Version:** 1.1  
**Date:** March 2026  

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Local Development Setup](#2-local-development-setup)
3. [Environment Variables](#3-environment-variables)
4. [Running the Application](#4-running-the-application)
5. [Database Initialization & Seeding](#5-database-initialization--seeding)
6. [Running Tests](#6-running-tests)
7. [Docker Build & Deployment](#7-docker-build--deployment)
8. [Cloudflare Tunnel Setup](#8-cloudflare-tunnel-setup)
9. [SerpApi Usage & Quota Management](#9-serpapi-usage--quota-management)
10. [Common Tasks & Cheatsheet](#10-common-tasks--cheatsheet)
11. [Backup & Restore](#11-backup--restore)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

### Required
| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.12+ | Application runtime |
| pip / venv | bundled | Package management |
| Docker Desktop | 24+ | Container build and run |
| Docker Compose | v2 (bundled with Docker Desktop) | Multi-container orchestration |
| Git | Any | Version control |

### Required Accounts (free tier)
| Service | URL | What you need |
|---------|-----|---------------|
| The Movie Database (TMDB) | https://www.themoviedb.org/settings/api | API Key (v3 auth) |
| SerpApi | https://serpapi.com | API Key (100 free searches/month on dev plan) |
| Cloudflare | https://cloudflare.com | Account + domain (for production only) |

---

## 2. Local Development Setup

### 2.1 Clone & Create Virtual Environment

```powershell
git clone <repo-url> groupgo
cd groupgo
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2.2 Install Dependencies

```powershell
pip install -r requirements.txt
```

### 2.3 Copy Environment File

```powershell
Copy-Item .env.example .env
```

Then edit `.env` with your actual API keys (see [Section 3](#3-environment-variables)).

---

## 3. Environment Variables

All configuration is driven by environment variables loaded from `.env` in local dev and from Docker's `env_file` in production.

### `.env.example`

```dotenv
# ─── Application ──────────────────────────────────────────────
APP_ENV=development
SECRET_KEY=replace-with-32-random-chars-minimum

# ─── Database ─────────────────────────────────────────────────
# Local dev: relative path. Docker: absolute path inside container.
DATABASE_URL=sqlite:///./data/groupgo.db

# ─── Admin Credentials ────────────────────────────────────────
# Protects all /admin/* routes via HTTP Basic Auth
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-before-deploying

# ─── External APIs ────────────────────────────────────────────
TMDB_API_KEY=your_tmdb_v3_api_key_here
SERPAPI_KEY=your_serpapi_key_here

# ─── Rate Limiting ────────────────────────────────────────────
# Max SerpApi calls per (theater × date) per window (hours)
SERPAPI_RATE_LIMIT_HOURS=12

# ─── Application Settings ─────────────────────────────────────
# Group size — used for participation % calculations
GROUP_SIZE=5
```

> **Security:** Never commit `.env` to version control. It is in `.gitignore` by default.

### Generating a SECRET_KEY

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## 4. Running the Application

### 4.1 Development Server (with hot reload)

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The app is now available at `http://localhost:8000`.  
FastAPI auto-generated docs are at `http://localhost:8000/docs`.

### 4.2 Access Points

| URL | Description |
|-----|-------------|
| `http://localhost:8000/` | Voter interface |
| `http://localhost:8000/admin` | Admin dashboard (prompts for Basic Auth) |
| `http://localhost:8000/docs` | OpenAPI interactive docs (dev only) |
| `http://localhost:8000/healthz` | Health check endpoint |

### 4.3 Development vs. Production Differences

| Behavior | Development | Production |
|----------|-------------|------------|
| OpenAPI `/docs` | Enabled | **Disabled** |
| Uvicorn reload | Enabled | Disabled |
| Error detail in responses | Full tracebacks | Generic messages |
| `APP_ENV` | `development` | `production` |

---

## 5. Database Initialization & Seeding

### Auto-init on Startup

The application calls `init_db()` automatically on startup via FastAPI's `lifespan` event. This creates all tables (using `CREATE TABLE IF NOT EXISTS`) and inserts seed data if the tables are empty.

### Manual Init

```powershell
python -c "from app.db import init_db; import asyncio; asyncio.run(init_db())"
```

### Reset Database (Development Only)

```powershell
Remove-Item -Path .\data\groupgo.db -ErrorAction SilentlyContinue
python -c "from app.db import init_db; import asyncio; asyncio.run(init_db())"
```

### Seed Data

On first init, the following are automatically inserted:
- **1 user:** `Admin` (is_admin=true) only
- **1 theater:** Cinemark Cedar Park (customize `SEED_THEATERS` in `app/db.py` before first run)
- **1 group:** Default Group

All other family members are added via **Admin → Members** (`/admin/members`) after first run. No SQL or code changes required.

---

## 6. Running Tests

### Install Test Dependencies

```powershell
pip install -r requirements-dev.txt
```

`requirements-dev.txt` adds: `pytest`, `pytest-asyncio`, `httpx` (for FastAPI TestClient), `pytest-cov`.

### Run All Tests

```powershell
pytest tests/ -v
```

### Run with Coverage Report

```powershell
pytest tests/ --cov=app --cov-report=term-missing
```

### Key Test Files

| File | What it tests |
|------|--------------|
| `tests/test_vote_service.py` | Scoring algorithm — veto elimination, scoring, edge cases |
| `tests/test_showtime_service.py` | Deduplication logic, time normalization, format extraction |
| `tests/test_api.py` | End-to-end HTTP routes with in-memory SQLite |
| `tests/conftest.py` | Shared fixtures: test client, seeded in-memory DB |

### Running a Specific Test

```powershell
pytest tests/test_vote_service.py::test_veto_eliminates_combination -v
```

### Mocking External APIs

In tests, TMDB and SerpApi calls are **always mocked**. Fixtures in `conftest.py` use `unittest.mock.patch` to intercept `httpx.AsyncClient.get` calls and return fixture JSON from `tests/fixtures/`.

Never allow tests to make real API calls — this would waste SerpApi quota.

---

## 7. Docker Build & Deployment

### 7.1 File Structure

```
groupgo/
├── Dockerfile
├── docker-compose.yml
├── .env                  ← Not committed; created from .env.example
└── data/                 ← Mounted as Docker volume
```

### 7.2 Dockerfile

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/
COPY static/ ./static/

RUN mkdir -p /data

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
```

### 7.3 docker-compose.yml

```yaml
version: "3.9"

services:
  groupgo:
    build: .
    container_name: groupgo
    restart: unless-stopped
    ports:
      - "8000:8000"
    env_file:
      - .env
    volumes:
      - db_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  db_data:
    name: groupgo_db_data
```

### 7.4 Build and Start

```powershell
# Build image
docker compose build

# Start container (detached)
docker compose up -d

# View logs
docker compose logs -f groupgo

# Stop container
docker compose down
```

### 7.5 Update Deployment (After Code Changes)

```powershell
docker compose down
docker compose build --no-cache
docker compose up -d
```

### 7.6 Portainer Setup

1. In Portainer, go to **Stacks → Add Stack**.
2. Set method to **Git Repository** or paste the `docker-compose.yml` contents.
3. Add environment variables manually in Portainer's "Environment variables" section (do **not** upload the `.env` file through Portainer's UI — use the env vars panel instead).
4. Deploy the stack.
5. Portainer will show the container health status and allow restart/log viewing from the web UI.

---

## 8. Cloudflare Tunnel Setup

The Cloudflare Tunnel runs **outside** the app container — directly on the host Linux server. It does not need to be modified when the app updates.

### 8.1 Initial Setup (One-Time)

On the Linux home server:

```bash
# Install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# Authenticate with your Cloudflare account
cloudflared tunnel login

# Create the tunnel
cloudflared tunnel create groupgo

# Create the config file at ~/.cloudflared/config.yml
```

`~/.cloudflared/config.yml`:
```yaml
tunnel: <your-tunnel-id>
credentials-file: /root/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: groupgo.yourdomain.com
    service: http://localhost:8000
  - service: http_status:404
```

```bash
# Add DNS record
cloudflared tunnel route dns groupgo groupgo.yourdomain.com

# Install as a system service
sudo cloudflared service install
sudo systemctl start cloudflared
sudo systemctl enable cloudflared
```

### 8.2 Verify

After setup, visiting `https://groupgo.yourdomain.com/healthz` should return `{"status": "ok"}`.

### 8.3 Zero-Config HTTPS

Cloudflare Tunnel provides automatic TLS termination. The application itself only speaks HTTP. No certificates need to be managed on the server.

---

## 9. SerpApi Usage & Quota Management

### Free Tier Limits

| Plan | Searches/month |
|------|----------------|
| Free | 100 |
| Dev (paid) | 250+ |

The application is designed around **250 searches/month**. With 4 theaters × 3 dates per week × ~4 weeks = 48 searches/month in a typical usage pattern — well within limits.

### Quota Calculation

```
searches_per_week = active_theaters × target_dates
example: 4 theaters × 3 dates = 12 searches/week
monthly estimate: 12 × 4 = 48 searches/month
```

### Protecting Quota

- **Caching:** Once fetched, showtimes are stored in SQLite. The frontend never calls SerpApi.
- **Rate limiting:** The `/api/admin/showtimes/fetch` endpoint is rate-limited to 1 request per `(theater, date)` per 12 hours.
- **Admin re-fetch:** Manual re-fetch bypasses rate limit but requires deliberate admin action.

### Monitoring Usage

```powershell
# Check SerpApi account usage
Invoke-RestMethod "https://serpapi.com/account?api_key=$env:SERPAPI_KEY"
```

---

## 10. Common Tasks & Cheatsheet

### Add a New Family Member

Use the Admin Members page: `http://localhost:8000/admin/members`

Click **"Add Member"**, enter their name, and save. No SQL required.

Alternatively, via SQLite:
```sql
sqlite3 data/groupgo.db
INSERT INTO users (name, is_admin, group_id) VALUES ('NewMember', 0, 1);
.quit
```

### Change Admin Password

Update `ADMIN_PASSWORD` in `.env` and restart the container:
```powershell
docker compose down && docker compose up -d
```

### View Active Poll Status

```powershell
sqlite3 data/groupgo.db "SELECT id, title, status FROM polls ORDER BY id DESC LIMIT 5;"
```

### View Vote Counts

```powershell
sqlite3 data/groupgo.db "SELECT target_type, vote_value, COUNT(*) FROM votes WHERE poll_id=1 GROUP BY target_type, vote_value;"
```

### Manually Reset Votes for a User

```powershell
sqlite3 data/groupgo.db "DELETE FROM votes WHERE user_id=3 AND poll_id=1;"
```

### Check SerpApi Cache Status

```powershell
sqlite3 data/groupgo.db "SELECT t.name, s.session_date, s.fetch_status, s.fetch_timestamp FROM sessions s JOIN theaters t ON s.theater_id=t.id GROUP BY s.theater_id, s.session_date;"
```

---

## 11. Backup & Restore

### Manual Backup

The entire application state is in one SQLite file. Copy it to back up everything.

```powershell
# On Windows, from host (while container is running)
docker cp groupgo:/data/groupgo.db .\backups\groupgo-$(Get-Date -Format 'yyyy-MM-dd').db
```

On Linux host:
```bash
docker cp groupgo:/data/groupgo.db ~/backups/groupgo-$(date +%Y-%m-%d).db
```

### Automated Weekly Backup (Linux Cron)

Add to crontab (`crontab -e`) on the Linux server:
```cron
0 3 * * 0   docker cp groupgo:/data/groupgo.db /home/user/backups/groupgo-$(date +\%Y-\%m-\%d).db
```

This runs every Sunday at 3 AM.

### Restore from Backup

```bash
# Stop the container
docker compose down

# Copy backup over the named volume
docker run --rm -v groupgo_db_data:/data -v $(pwd)/backups:/backup alpine \
  cp /backup/groupgo-2026-03-14.db /data/groupgo.db

# Restart
docker compose up -d
```

---

## 12. Troubleshooting

### Container won't start

```powershell
docker compose logs groupgo
```
Check for: missing `.env` file, invalid `DATABASE_URL`, port 8000 already in use.

### `/healthz` returns `503`

The SQLite database is unreachable. Check:
- Volume mount is correct in `docker-compose.yml`
- `/data` directory exists inside the container
- `DATABASE_URL` points to the correct path

### SerpApi returns 0 results

- Test the `serpapi_query` string directly: search it in Google and see if the showtimes widget appears.
- The theater name in the query may be slightly wrong — try variations.
- Google's showtimes widget is date-sensitive; querying too far in the future returns nothing. Stick to the current week.
- Check SerpApi account quota at `https://serpapi.com/account`.

### TMDB search returns no results

- Verify `TMDB_API_KEY` is set correctly.
- Test directly: `https://api.themoviedb.org/3/search/movie?api_key=YOUR_KEY&query=Dune`
- TMDB API status: `https://status.themoviedb.org`

### Votes not saving

- Check browser console for HTMX request errors.
- Verify the token cookie is present: browser DevTools → Application → Cookies.
- Check that the poll status is `OPEN`: `SELECT status FROM polls WHERE id=1;`

### "Who are you?" modal keeps appearing

The identity token is stored as an HTTP cookie. If it keeps prompting:
- Check that the `token` cookie is set in browser DevTools → Application → Cookies
- Private/incognito mode will lose the cookie on session end — this is expected behavior
- The user can tap the identity selector again to re-establish their token

### Admin page asks for credentials on every page load

This is normal browser behavior for HTTP Basic Auth. The browser should cache credentials within a session. If it keeps asking, ensure `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` match what was entered.
