from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import init_db, engine
from app.routers import api, voter, admin
import app.templates_config  # registers Jinja2 filters


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

app.include_router(voter.router)
app.include_router(admin.router)
app.include_router(api.router)


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
