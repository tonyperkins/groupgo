# GroupGo — Architecture Document

**Version:** 1.1  
**Date:** March 2026  

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Infrastructure Diagram](#2-infrastructure-diagram)
3. [Application Component Diagram](#3-application-component-diagram)
4. [Data Flow Diagrams](#4-data-flow-diagrams)
5. [Sequence Diagrams](#5-sequence-diagrams)
6. [Technology Decisions](#6-technology-decisions)
7. [Directory Structure](#7-directory-structure)
8. [Configuration & Environment](#8-configuration--environment)

---

## 1. System Overview

GroupGo is a server-rendered web application following a **thin-client / thick-server** model. There is no JavaScript SPA framework. The browser receives HTML fragments from the server via HTMX and renders them directly. All business logic — vote tallying, showtime deduplication, result calculation — lives in the Python backend.

### Key Design Principles

- **No client-side state management.** The server is the single source of truth. Browser localStorage stores only the identity token.
- **Cache-first data access.** External APIs (TMDB, SerpApi) are called by the admin workflow only. All voter-facing reads come from SQLite.
- **Progressive enhancement.** Core read flows (view movies, view results) work without JavaScript. HTMX enhances vote toggling.
- **Deployment simplicity.** A single Docker container runs the entire application. No microservices, no message queues, no external caches.

---

## 2. Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL INTERNET                            │
│                                                                     │
│   Family Member's Phone          Admin's Browser                   │
│   (iOS Safari / Android Chrome)  (Desktop or Mobile)               │
└──────────────────┬───────────────────────┬──────────────────────────┘
                   │  HTTPS                │  HTTPS
                   │                       │
         ┌─────────▼───────────────────────▼──────────┐
         │           CLOUDFLARE TUNNEL                 │
         │   (Automatic HTTPS · No Port Forwarding)    │
         │   groupgo.yourdomain.com → localhost:8000   │
         └──────────────────────┬──────────────────────┘
                                │  HTTP (internal)
                                │
         ┌──────────────────────▼──────────────────────┐
         │              HOME LINUX SERVER               │
         │                                              │
         │   ┌──────────────────────────────────────┐  │
         │   │         PORTAINER (Management)        │  │
         │   └──────────────────────────────────────┘  │
         │                                              │
         │   ┌──────────────────────────────────────┐  │
         │   │      DOCKER CONTAINER: groupgo        │  │
         │   │                                       │  │
         │   │   FastAPI (Uvicorn, port 8000)        │  │
         │   │   ├── /admin/*  (HTTP Basic Auth)     │  │
         │   │   ├── /api/*    (token auth)          │  │
         │   │   └── /*        (public voter UI)     │  │
         │   │                                       │  │
         │   │   SQLite DB (named volume mount)      │  │
         │   └──────────────────────────────────────┘  │
         │              │                               │
         │   ┌──────────▼──────────────────────────┐   │
         │   │     Docker Named Volume: db_data     │   │
         │   │     /data/groupgo.db                 │   │
         │   └─────────────────────────────────────┘   │
         └──────────────────────────────────────────────┘
                                │
                   ┌────────────▼─────────────┐
                   │     EXTERNAL APIS        │
                   │                          │
                   │  TMDB API (free tier)    │
                   │  api.themoviedb.org      │
                   │                          │
                   │  SerpApi (250/mo free)   │
                   │  serpapi.com             │
                   └──────────────────────────┘
```

---

## 3. Application Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                       FASTAPI APPLICATION                           │
│                                                                     │
│  ┌─────────────────┐   ┌──────────────────┐   ┌─────────────────┐  │
│  │   ROUTERS       │   │    SERVICES       │   │   TEMPLATES     │  │
│  │                 │   │                   │   │                 │  │
│  │ admin.py        │──▶│ movie_service.py  │   │ base.html       │  │
│  │  - dashboard    │   │  - tmdb_search()  │   │ admin/          │  │
│  │  - movies       │   │  - add_to_poll()  │   │   dashboard.html│  │
│  │  - showtimes    │   │                   │   │   movies.html   │  │
│  │  - theaters     │   │ showtime_service  │   │   showtimes.html│  │
│  │  - polls        │   │  - fetch_all()    │   │ voter/          │  │
│  │                 │   │  - deduplicate()  │   │   identify.html │  │
│  │ voter.py        │──▶│  - cache_result() │   │   movies.html   │  │
│  │  - identify     │   │                   │   │   logistics.html│  │
│  │  - movies       │   │ vote_service.py   │   │   results.html  │  │
│  │  - logistics    │   │  - cast_vote()    │   │ components/     │  │
│  │  - results      │   │  - get_results()  │   │   movie_card.html│ │
│  │                 │   │  - score_combos() │   │   toggle.html   │  │
│  │ api.py          │──▶│                   │   │   result_row.html│ │
│  │  - /healthz     │   │ theater_service   │   └─────────────────┘  │
│  │  - vote POST    │   │  - list_active()  │                        │
│  │  - results GET  │   │  - toggle()       │   ┌─────────────────┐  │
│  └─────────────────┘   └──────────────────┘   │   DATABASE      │  │
│                                │               │                 │  │
│  ┌─────────────────┐           │               │ db.py           │  │
│  │   MIDDLEWARE    │           ▼               │  - get_db()     │  │
│  │                 │   ┌──────────────────┐    │  - init_db()    │  │
│  │ auth.py         │   │    MODELS        │    │                 │  │
│  │  - BasicAuth    │   │ (SQLModel/ORM)   │    │ models.py       │  │
│  │  - TokenCheck   │   │                 │    │  - Users        │  │
│  │                 │   │  User           │    │  - Events       │  │
│  │ rate_limit.py   │   │  Event          │    │  - Sessions     │  │
│  │  - serpapi_gate │   │  Session        │    │  - Votes        │  │
│  └─────────────────┘   │  Vote           │    │  - Theaters     │  │
│                         │  Theater        │    │  - Polls        │  │
│  ┌─────────────────┐   │  Poll           │    └─────────────────┘  │
│  │  STATIC ASSETS  │   └──────────────────┘                        │
│  │                 │                                                │
│  │  /static/       │   ┌──────────────────┐                        │
│  │   tailwind.css  │   │  BACKGROUND JOBS │                        │
│  │   htmx.min.js   │   │                  │                        │
│  │   app.js        │   │ tasks.py         │                        │
│  └─────────────────┘   │  - fetch_worker()│                        │
│                         │  (asyncio tasks) │                        │
│                         └──────────────────┘                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Flow Diagrams

### 4.1 Admin: Showtime Fetch & Cache Flow

```
Admin Browser                FastAPI Backend              External APIs
     │                             │                            │
     │  POST /admin/showtimes/fetch│                            │
     │  {theater_ids, dates}       │                            │
     │────────────────────────────▶│                            │
     │                             │                            │
     │  202 Accepted               │                            │
     │  {job_id: "abc123"}         │  asyncio.create_task()     │
     │◀────────────────────────────│─────────────────┐          │
     │                             │                 │          │
     │  [polls /admin/jobs/abc123  │    For each theater × date:│
     │   every 2s via HTMX]        │                 │          │
     │                             │    GET serpapi.com/search  │
     │                             │    ?q="[theater] showtimes"│
     │                             │    &date=[date]            │
     │                             │◀────────────────┼─────────▶│
     │                             │                 │          │
     │                             │    raw_json = response     │
     │                             │                 │          │
     │                             │    deduplicate(raw_json)   │
     │                             │    normalize_times()       │
     │                             │    extract_formats()       │
     │                             │                 │          │
     │                             │    INSERT INTO sessions    │
     │                             │    (with fetch_timestamp)  │
     │                             │◀────────────────┘          │
     │                             │                            │
     │  [HTMX poll returns HTML    │                            │
     │   fragment: updated status] │                            │
     │◀────────────────────────────│                            │
     │                             │                            │
```

### 4.2 Voter: Vote Submission Flow

```
Voter Browser (HTMX)          FastAPI Backend              SQLite DB
     │                             │                            │
     │  [Page load]                │                            │
     │  GET /vote                  │                            │
     │  Cookie: token=<uuid>       │                            │
     │────────────────────────────▶│                            │
     │                             │  SELECT users WHERE        │
     │                             │  token = <uuid>            │
     │                             │───────────────────────────▶│
     │                             │◀───────────────────────────│
     │                             │                            │
     │  Full page HTML             │                            │
     │◀────────────────────────────│                            │
     │                             │                            │
     │  [User taps "Yes" on a movie]                            │
     │  POST /api/votes/movie       │                            │
     │  {event_id: 1, vote: "yes"} │                            │
     │  HX-Request: true           │                            │
     │────────────────────────────▶│                            │
     │                             │  UPSERT votes              │
     │                             │  SET vote="yes"            │
     │                             │  WHERE user_id=X,          │
     │                             │  event_id=1                │
     │                             │───────────────────────────▶│
     │                             │◀───────────────────────────│
     │                             │                            │
     │  HTML fragment: updated     │                            │
     │  toggle button (green/Yes)  │                            │
     │◀────────────────────────────│                            │
     │                             │                            │
     │  [HTMX swaps button HTML    │                            │
     │   in-place, no page reload] │                            │
     │                             │                            │
```

### 4.3 Results Calculation Flow

```
Voter Browser                 FastAPI Backend              SQLite DB
     │                             │                            │
     │  GET /results               │                            │
     │  (or HTMX poll every 10s)   │                            │
     │────────────────────────────▶│                            │
     │                             │  1. SELECT all events      │
     │                             │     in active poll         │
     │                             │  2. SELECT all sessions    │
     │                             │     for those events       │
     │                             │  3. SELECT all votes       │
     │                             │     for all users          │
     │                             │───────────────────────────▶│
     │                             │◀───────────────────────────│
     │                             │                            │
     │                             │  score_service:            │
     │                             │  ┌──────────────────────┐  │
     │                             │  │ Build (event×session) │  │
     │                             │  │ candidate matrix      │  │
     │                             │  │                       │  │
     │                             │  │ Eliminate vetoed      │  │
     │                             │  │ combinations          │  │
     │                             │  │                       │  │
     │                             │  │ Score remaining       │  │
     │                             │  │ combinations          │  │
     │                             │  │                       │  │
     │                             │  │ Sort by score desc    │  │
     │                             │  └──────────────────────┘  │
     │                             │                            │
     │  HTML fragment:             │                            │
     │  ranked results table       │                            │
     │◀────────────────────────────│                            │
     │                             │                            │
```

---

## 5. Sequence Diagrams

### 5.1 First-Time Voter Visit

```
sequenceDiagram
    participant B as Browser
    participant F as FastAPI
    participant DB as SQLite

    B->>F: GET / (no token cookie)
    F->>F: Token not found → redirect /identify
    F->>DB: SELECT * FROM users
    DB-->>F: [Alice, Bob, Carol, Dave, Eve]
    F-->>B: Render identify.html (dropdown)

    B->>F: POST /identify {user_id: 2}
    F->>F: Generate UUID token
    F->>DB: UPDATE users SET token=<uuid> WHERE id=2
    DB-->>F: OK
    F-->>B: 302 Redirect / + Set-Cookie: token=<uuid>

    B->>F: GET / (with token cookie)
    F->>DB: SELECT user WHERE token=<uuid>
    DB-->>F: User{id:2, name:"Bob"}
    F->>DB: SELECT active poll + movies + sessions
    DB-->>F: Poll data
    F-->>B: Render voter dashboard
```

### 5.2 Admin Poll Publication

```
sequenceDiagram
    participant A as Admin Browser
    participant F as FastAPI
    participant T as TMDB API
    participant S as SerpApi
    participant DB as SQLite

    A->>F: GET /admin (Basic Auth header)
    F->>F: Validate credentials
    F-->>A: Admin dashboard

    A->>F: POST /admin/movies/search {q: "Dune Part Three"}
    F->>T: GET /search/movie?query=Dune+Part+Three
    T-->>F: [{id, title, year, poster, ...}, ...]
    F-->>A: HTMX fragment: search result list

    A->>F: POST /admin/polls/1/movies {tmdb_id: 12345}
    F->>T: GET /movie/12345 (full details + trailers)
    T-->>F: Full movie object
    F->>DB: INSERT INTO events (...)
    F-->>A: HTMX fragment: updated movie list

    A->>F: POST /admin/showtimes/fetch {dates:[...], theater_ids:[...]}
    F->>F: asyncio.create_task(fetch_worker)
    F-->>A: 202 + job_id

    loop For each theater × date
        F->>S: GET /search?q="Cinemark Cedar Park showtimes"&date=...
        S-->>F: Raw showtime JSON
        F->>F: deduplicate + normalize
        F->>DB: INSERT INTO sessions (...)
    end

    A->>F: GET /admin/jobs/{job_id} (HTMX poll)
    F-->>A: Progress fragment

    A->>F: POST /admin/polls/1/publish
    F->>DB: UPDATE polls SET status='OPEN'
    F-->>A: Poll URL + confirmation
```

---

## 6. Technology Decisions

### 6.1 Frontend: HTML + Tailwind CSS + HTMX

| Decision | Rationale |
|----------|-----------|
| No React/Vue/Svelte | Zero build toolchain complexity. No `node_modules`. Deployment is just a Python container. |
| HTMX | Provides SPA-like interactivity (partial page swaps, real-time updates) using standard HTML attributes. Vote toggles and result polling require no JavaScript to be written. |
| Tailwind CSS (CDN) | Utility-first CSS with no build step for V1. If performance becomes a concern, a build step can be added later. |
| Jinja2 templates | Native FastAPI template engine. Allows component-style HTML fragments for HTMX partial responses. |

### 6.2 Backend: Python + FastAPI

| Decision | Rationale |
|----------|-----------|
| FastAPI | Native async support for concurrent SerpApi batch fetches. Automatic OpenAPI docs at `/docs`. Pydantic validation out of the box. |
| SQLModel | Combines SQLAlchemy ORM + Pydantic models in one definition. Works natively with FastAPI. Avoids duplicate model definitions. |
| asyncio tasks | Background showtime fetching runs as an asyncio task within the same process — no Celery, no Redis, no separate worker process. Appropriate for infrequent, low-throughput jobs. |
| Uvicorn | ASGI server. Single worker is sufficient; SQLite doesn't support high concurrency anyway. |

### 6.3 Database: SQLite

| Decision | Rationale |
|----------|-----------|
| SQLite | Zero infrastructure. Single file on a named Docker volume. Perfectly adequate for 5 concurrent users and weekly poll cadence. |
| WAL mode | Enable `PRAGMA journal_mode=WAL` to allow one writer + multiple readers, preventing lock contention during background fetch jobs. |
| No ORM migrations tool | Alembic adds complexity. Use `CREATE TABLE IF NOT EXISTS` in `init_db()` for V1. Add a simple version table for future migrations if needed. |

### 6.4 Infrastructure

| Decision | Rationale |
|----------|-----------|
| Docker | Reproducible environment. Single `docker-compose.yml` captures all config. |
| Portainer | Web UI for managing the container on the home server without SSH for routine operations. |
| Cloudflare Tunnel | No open ports on home router. Automatic HTTPS. Zero cost. Access control via Cloudflare Access can be layered on if desired. |
| SQLite volume mount | Ensures DB persists across container recreations. Mount point: `/data/groupgo.db`. |

---

## 7. Directory Structure

```
groupgo/
├── app/
│   ├── main.py                  # FastAPI app factory, lifespan, middleware
│   ├── config.py                # Settings loaded from environment variables
│   ├── db.py                    # Database engine, session factory, init_db(), migrations
│   ├── models.py                # SQLModel table definitions
│   ├── templates_config.py      # Jinja2 environment + template filters
│   │
│   ├── routers/
│   │   ├── admin.py             # Admin page routes (protected by BasicAuth)
│   │   ├── voter.py             # Voter-facing page routes
│   │   └── api.py               # All API routes (votes, results, admin CRUD, healthz)
│   │
│   ├── services/
│   │   ├── movie_service.py     # TMDB API calls, movie CRUD
│   │   ├── showtime_service.py  # SerpApi calls, deduplication, session grouping
│   │   ├── vote_service.py      # Vote CRUD, participation logic, result calculation
│   │   └── theater_service.py   # Theater CRUD
│   │
│   ├── tasks/
│   │   └── fetch_tasks.py       # Async background job for showtime fetching
│   │
│   └── middleware/
│       ├── auth.py              # HTTP Basic Auth for admin routes
│       └── identity.py          # Token resolution from cookie/header
│
├── templates/
│   ├── base.html                # Base voter layout (Tailwind + HTMX)
│   ├── admin/
│   │   ├── base_admin.html      # Base admin layout with light/dark mode CSS
│   │   ├── dashboard.html       # Poll list with actions (publish, close, reopen, delete)
│   │   ├── movies.html          # Movie search and poll movie management
│   │   ├── showtimes.html       # Showtime fetch, manual add, session list
│   │   ├── theaters.html        # Theater management
│   │   ├── members.html         # User/group management
│   │   └── results.html         # Admin results view with declare-winner
│   ├── voter/
│   │   ├── identify.html        # "Who are you?" identity selection
│   │   ├── movies.html          # Movie voting screen
│   │   ├── logistics.html       # Showtime availability voting screen
│   │   └── results.html         # Live results screen
│   └── components/
│       ├── admin_movie_list.html     # HTMX partial: admin movie list
│       ├── admin_session_list.html   # HTMX partial: admin showtime table
│       ├── bottom_nav.html           # Voter bottom navigation bar
│       ├── job_progress.html         # HTMX partial: fetch job progress bar
│       ├── logistics_panel.html      # HTMX partial: voter logistics panel + done button
│       ├── movie_search_results.html # HTMX partial: TMDB search results
│       ├── movie_vote_toggle.html    # HTMX partial: Yes/No movie vote button
│       ├── no_poll.html              # Shown when no active poll exists
│       ├── results_panel.html        # HTMX partial: results + participation bar
│       └── session_vote_toggle.html  # HTMX partial: single Can Do/Can't Do toggle
│
├── static/
│   ├── css/
│   │   └── app.css              # Custom styles, light/dark mode variables
│   └── js/
│       └── app.js               # Toast notifications, HTMX config, token sync
│
├── tests/
│   ├── conftest.py              # pytest fixtures, in-memory SQLite DB
│   ├── test_vote_service.py     # Unit tests for scoring algorithm
│   ├── test_showtime_service.py # Unit tests for deduplication logic
│   └── test_api.py              # Integration tests for key endpoints
│
├── data/                        # Docker volume mount point
│   └── .gitkeep
│
├── Dockerfile
├── docker-compose.yml
├── .env.example                 # Template for required environment variables
├── requirements.txt
├── requirements-dev.txt         # pytest, httpx, pytest-cov
└── README.md
```

---

## 8. Configuration & Environment

All sensitive values are injected via environment variables. The application uses `pydantic-settings` to load and validate them at startup.

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TMDB_API_KEY` | TMDB v3 API key | `abc123def456...` |
| `SERPAPI_KEY` | SerpApi API key | `xyz789...` |
| `ADMIN_USERNAME` | HTTP Basic Auth username for `/admin/*` | `admin` |
| `ADMIN_PASSWORD` | HTTP Basic Auth password for `/admin/*` | `s3cure!pass` |
| `SECRET_KEY` | Used for signing any future session tokens | 32+ random chars |
| `DATABASE_URL` | SQLite file path | `sqlite:////data/groupgo.db` |
| `APP_ENV` | `development` or `production` | `production` |

### docker-compose.yml Structure

```yaml
version: "3.9"
services:
  groupgo:
    build: .
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
```

### Cloudflare Tunnel Configuration

The tunnel routes `groupgo.yourdomain.com` → `localhost:8000`. Configured via `cloudflared` service running on the same host (not inside the app container). No changes to the application are needed.
