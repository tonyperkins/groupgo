# GroupGo

A lightweight, mobile-first web app for coordinating group movie outings. Eliminates the "what movie / when / where" group chat thread using a curated polling model with approval voting and veto power.

**Stack:** Python · FastAPI · HTMX · Tailwind CSS · SQLite · Docker · Cloudflare Tunnel

---

## Quick Start

```powershell
# 1. Clone and set up environment
git clone <repo-url> groupgo
cd groupgo
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2. Configure environment
Copy-Item .env.example .env
# Edit .env with your TMDB_API_KEY, SERPAPI_KEY, ADMIN_PASSWORD, and APP_BASE_URL

# 3. Run
uvicorn app.main:app --reload --port 8000
```

App runs at `http://localhost:8000` · Admin at `http://localhost:8000/admin`

See **[docs/dev-setup.md](docs/dev-setup.md)** for full setup, Docker deployment, and Cloudflare Tunnel configuration.

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/requirements.md](docs/requirements.md) | Full PRD — user stories, acceptance criteria, algorithm spec |
| [docs/architecture.md](docs/architecture.md) | System/component/sequence diagrams, tech decisions, directory structure |
| [docs/schema.md](docs/schema.md) | SQLite schema with ERD, table definitions, indexes, seed data |
| [docs/api-spec.md](docs/api-spec.md) | All API endpoints, request/response shapes, HTMX conventions |
| [docs/dev-setup.md](docs/dev-setup.md) | Local dev, Docker, Cloudflare Tunnel, backup, troubleshooting |

---

## How It Works

**Admin (Wednesday/Thursday):**
1. Add family members via **Members** page (one-time setup)
2. Search for movies → TMDB fetches poster, synopsis, trailer
3. Select target weekend dates → backend fetches showtimes via SerpApi and caches in SQLite
4. Review and toggle individual showtimes on/off as needed
5. Publish poll → generate the secure invite link and share it with the group

**Family Members (vote on phone):**
1. Tap the secure poll link → enter your unique 4-digit member PIN → GroupGo opens your ballot directly
2. Screen 1: Approve (**Yes**) or reject (**No**) each movie
3. Screen 2: Sessions default to **Can't Do** — tap to toggle any you **can** make to **Can Do**
4. Optionally tap **"I'm In — Whatever You Choose!"** to skip logistics and approve everything
5. Tap **"Done Voting"** to confirm completion → redirects to live results

**Veto logic:** Any combination where a non-flexible voter voted "No" on the movie OR left a showtime as "Can't Do" is eliminated. Winner = highest approval score among surviving combinations.

---

## Project Structure

```
groupgo/
├── app/                   # FastAPI application
│   ├── routers/           # Route handlers (admin, voter, api)
│   ├── services/          # Business logic (movies, showtimes, votes)
│   ├── tasks/             # Background fetch jobs
│   └── middleware/        # Auth, identity resolution
├── templates/             # Jinja2 HTML templates (admin/, voter/, components/)
├── static/                # CSS (light/dark mode) and JS (toasts, HTMX config)
├── tests/                 # pytest test suite
├── data/                  # SQLite DB (Docker volume mount)
├── docs/                  # Full project documentation
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## Key Constraints

- SerpApi free tier: 250 searches/month — all voter reads come from SQLite cache only
- One active poll at a time
- Admin routes protected by HTTP Basic Auth (env var credentials)
- Public poll links are generated from `APP_BASE_URL`, so deployments behind DuckDNS, port forwarding, or tunnels can share the correct external URL
- All data in one SQLite file — backup = copy one file
