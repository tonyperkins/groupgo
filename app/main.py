import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse

from app.config import settings
from app.db import init_db, engine
from app.routers import api, voter, admin
import app.templates_config  # registers Jinja2 filters

logging.basicConfig(level=logging.INFO)
logging.getLogger("app").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    # Mark any jobs that were left running from a previous server crash
    from sqlmodel import Session, select
    from app.models import FetchJob
    from datetime import datetime, timezone
    with Session(engine) as db:
        stale = db.exec(select(FetchJob).where(FetchJob.status == "running")).all()
        for job in stale:
            job.status = "failed"
            job.last_error = "Server restarted while job was running"
            job.finished_at = datetime.now(timezone.utc).isoformat()
            db.add(job)
        if stale:
            db.commit()
    yield


app = FastAPI(
    title="GroupGo",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url=None,
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory="static"), name="static")

if os.path.exists("static/voter"):
    app.mount("/static/voter", StaticFiles(directory="static/voter"), name="voter-static")

from app.routers import api, voter, admin, admin_spa, auth_api, auth_web

app.include_router(voter.router)
app.include_router(admin.router)
app.include_router(admin_spa.router)
app.include_router(api.router)
app.include_router(auth_api.router)
app.include_router(auth_web.router)


@app.get("/manifest.json")
async def manifest():
    return FileResponse("static/voter/manifest.json")


@app.get("/profile", response_class=HTMLResponse)
@app.get("/vote/{path:path}", response_class=HTMLResponse)
async def voter_spa(path: str = ""):
    """Catch-all for React SPA — must be registered after all API routers."""
    spa_index = os.path.join("static", "voter", "index.html")
    if os.path.exists(spa_index):
        return FileResponse(spa_index)
    return HTMLResponse(
        "<p>Voter SPA not built yet. Run <code>npm run build</code> in voter-spa/.</p>",
        status_code=503,
    )


@app.exception_handler(404)
async def not_found_handler(request, exc):
    return JSONResponse(
        {"error": {"code": "NOT_FOUND", "message": str(exc.detail), "status": 404}},
        status_code=404,
    )


@app.exception_handler(403)
async def forbidden_handler(request, exc):
    return JSONResponse(
        {"error": {"code": "FORBIDDEN", "message": str(exc.detail), "status": 403}},
        status_code=403,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    import traceback
    logging.getLogger(__name__).error(
        "Unhandled exception on %s %s: %s\n%s",
        request.method, request.url.path,
        exc, traceback.format_exc(),
    )
    accept = request.headers.get("accept", "")
    if "text/html" in accept:
        return HTMLResponse(
            """<!DOCTYPE html><html><head><title>Error — GroupGo</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;
display:flex;align-items:center;justify-content:center;min-height:100dvh;margin:0;}
.card{background:rgba(30,41,59,0.9);border:1px solid rgba(148,163,184,0.15);
border-radius:1.25rem;padding:2.5rem 2rem;max-width:420px;text-align:center;}
h1{font-size:1.25rem;margin-bottom:.5rem;}p{color:#94a3b8;font-size:.9rem;}
a{color:#818cf8;}</style></head>
<body><div class="card"><div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
<h1>Something went wrong</h1>
<p>An unexpected error occurred. The issue has been logged.</p>
<p style="margin-top:1.5rem"><a href="javascript:history.back()">← Go back</a>
&nbsp;&nbsp;<a href="/admin">Admin home</a></p>
</div></body></html>""",
            status_code=500,
        )
    return JSONResponse(
        {"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred.", "status": 500}},
        status_code=500,
    )
