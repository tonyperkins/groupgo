import asyncio
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Depends, HTTPException, Form
from fastapi.responses import HTMLResponse, JSONResponse
from sqlmodel import Session, select

from app.db import get_db
from app.middleware.identity import get_current_user
from app.middleware.auth import verify_admin
from app.models import Poll, FetchJob, User, Group, Event as EventModel, Theater as TheaterModel
from app.models import Session as ShowSession
from app.services import vote_service, movie_service, showtime_service, theater_service
from app.tasks.fetch_tasks import run_fetch_job, create_fetch_job
from app.templates_config import templates

router = APIRouter()


# ─── Health ───────────────────────────────────────────────────────────────────

@router.get("/api/admin/serpapi/status")
async def serpapi_status(request: Request):
    verify_admin(request)
    import httpx as _httpx
    from app.config import settings as _s
    try:
        r = await _httpx.AsyncClient(timeout=10).get(
            "https://serpapi.com/account",
            params={"api_key": _s.SERPAPI_KEY},
        )
        d = r.json()
        return JSONResponse({
            "account_status": d.get("account_status", "unknown"),
            "plan": d.get("plan_name"),
            "searches_left": d.get("total_searches_left"),
            "ready": str(d.get("account_status", "")).lower() == "active",
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=502)


@router.get("/healthz")
def healthz(db: Session = Depends(get_db)):
    try:
        db.exec(select(User)).first()
        db_status = "ok"
    except Exception:
        db_status = "error"
    status = "ok" if db_status == "ok" else "degraded"
    code = 200 if status == "ok" else 503
    return JSONResponse({"status": status, "db": db_status, "version": 1}, status_code=code)


# ─── Vote endpoints ────────────────────────────────────────────────────────────

@router.post("/api/votes/movie", response_class=HTMLResponse)
async def vote_movie(
    request: Request,
    event_id: int = Form(...),
    vote: str = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = db.exec(select(Poll).where(Poll.status == "OPEN")).first()
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")
    if vote not in ("yes", "no", "abstain"):
        raise HTTPException(status_code=400, detail="Invalid vote value")

    vote_service.cast_vote(user.id, poll.id, "event", event_id, vote, db)

    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    current = user_votes.get(("event", event_id), "abstain")
    response = templates.TemplateResponse(
        "components/movie_vote_toggle.html",
        {"request": request, "event_id": event_id, "current_vote": current},
    )
    response.headers["HX-Trigger"] = "voteSaved"
    return response


@router.post("/api/votes/session", response_class=HTMLResponse)
async def vote_session(
    request: Request,
    session_id: int = Form(...),
    vote: str = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = db.exec(select(Poll).where(Poll.status == "OPEN")).first()
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")
    if vote not in ("can_do", "cant_do", "abstain"):
        raise HTTPException(status_code=400, detail="Invalid vote value")

    vote_service.cast_vote(user.id, poll.id, "session", session_id, vote, db)

    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    current = user_votes.get(("session", session_id), "abstain")
    response = templates.TemplateResponse(
        "components/session_vote_toggle.html",
        {"request": request, "session_id": session_id, "current_vote": current},
    )
    response.headers["HX-Trigger"] = "voteSaved"
    return response


@router.post("/api/votes/flexible", response_class=HTMLResponse)
async def vote_flexible(
    request: Request,
    is_flexible: str = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = db.exec(select(Poll).where(Poll.status == "OPEN")).first()
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    flexible = is_flexible.lower() in ("true", "1", "yes")
    vote_service.set_flexible(user.id, poll.id, flexible, db)

    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    yes_event_ids = [tid for (tt, tid), val in user_votes.items() if tt == "event" and val == "yes"]
    grouped = showtime_service.get_sessions_grouped(poll.id, db, event_ids=yes_event_ids or None)
    response = templates.TemplateResponse(
        "components/logistics_panel.html",
        {
            "request": request,
            "is_flexible": flexible,
            "grouped": grouped,
            "user_votes": user_votes,
            "poll": poll,
        },
    )
    response.headers["HX-Trigger"] = "voteSaved"
    return response


@router.post("/api/votes/complete")
async def vote_complete(
    request: Request,
    db: Session = Depends(get_db),
):
    """Mark user's voting as complete for the current poll"""
    user = get_current_user(request, db)
    poll = db.exec(select(Poll).where(Poll.status == "OPEN")).first()
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    vote_service.mark_voting_complete(user.id, poll.id, db)
    
    from fastapi.responses import JSONResponse
    response = JSONResponse({"status": "complete"})
    response.headers["HX-Trigger"] = "voteSaved"
    return response


# ─── Results ──────────────────────────────────────────────────────────────────

@router.get("/api/results", response_class=HTMLResponse)
async def results_fragment(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = db.exec(select(Poll).where(Poll.status.in_(["OPEN", "CLOSED"]))).first()

    if not poll:
        return templates.TemplateResponse(
            "components/no_poll.html", {"request": request}
        )

    results = vote_service.calculate_results(poll.id, db)
    participation = vote_service.get_participation(poll.id, db)

    return templates.TemplateResponse(
        "components/results_panel.html",
        {
            "request": request,
            "results": results,
            "participation": participation,
            "poll": poll,
            "poster_url": movie_service.poster_url,
        },
    )


@router.get("/api/results/json")
async def results_json(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = db.exec(select(Poll).where(Poll.status.in_(["OPEN", "CLOSED"]))).first()
    if not poll:
        raise HTTPException(status_code=404, detail="No active poll")

    results = vote_service.calculate_results(poll.id, db)
    participation = vote_service.get_participation(poll.id, db)

    return {
        "poll_id": poll.id,
        "poll_status": poll.status,
        "participation": {
            "total_voters": participation["total"],
            "fully_voted": participation["fully_voted_count"],
            "voters": [
                {"name": p["user"].name, "fully_voted": p["fully_voted"]}
                for p in participation["participants"]
            ],
        },
        "results": [
            {
                "rank": r["rank"],
                "score": r["score"],
                "event": {"id": r["event"].id, "title": r["event"].title},
                "session": {
                    "id": r["session"].id,
                    "session_date": r["session"].session_date,
                    "session_time": r["session"].session_time,
                    "format": r["session"].format,
                    "theater_id": r["session"].theater_id,
                },
            }
            for r in results["ranked"][:5]
        ],
        "no_valid_options": results["no_valid_options"],
    }


# ─── Admin: Movies ────────────────────────────────────────────────────────────

@router.get("/api/admin/movies/search", response_class=HTMLResponse)
async def admin_search_movies(
    request: Request,
    q: str,
    poll_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query required")

    try:
        results = await movie_service.search_tmdb(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TMDB error: {exc}")

    return templates.TemplateResponse(
        "components/movie_search_results.html",
        {"request": request, "results": results, "poll_id": poll_id, "poster_url": movie_service.poster_url},
    )


@router.post("/api/admin/polls/{poll_id}/movies", response_class=HTMLResponse)
async def admin_add_movie(
    request: Request,
    poll_id: int,
    tmdb_id: int = Form(...),
    db: Session = Depends(get_db),
):
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    try:
        tmdb_data = await movie_service.fetch_tmdb_details(tmdb_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TMDB error: {exc}")

    try:
        movie_service.add_movie_to_poll(poll_id, tmdb_data, db)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    events = movie_service.get_poll_events(poll_id, db)
    return templates.TemplateResponse(
        "components/admin_movie_list.html",
        {
            "request": request,
            "events": events,
            "poll": poll,
            "poster_url": movie_service.poster_url,
        },
    )


@router.delete("/api/admin/polls/{poll_id}/movies/{event_id}", response_class=HTMLResponse)
async def admin_remove_movie(
    request: Request,
    poll_id: int,
    event_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    try:
        movie_service.remove_movie_from_poll(poll_id, event_id, db)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    events = movie_service.get_poll_events(poll_id, db)
    poll = db.get(Poll, poll_id)
    return templates.TemplateResponse(
        "components/admin_movie_list.html",
        {
            "request": request,
            "events": events,
            "poll": poll,
            "poster_url": movie_service.poster_url,
        },
    )


# ─── Admin: Showtimes ─────────────────────────────────────────────────────────

@router.post("/api/admin/showtimes/fetch")
async def admin_fetch_showtimes(
    request: Request,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    body = await request.json()
    poll_id = body.get("poll_id")
    theater_ids = body.get("theater_ids", [])
    dates = body.get("dates", [])

    if not poll_id or not theater_ids or not dates:
        raise HTTPException(status_code=400, detail="poll_id, theater_ids, and dates required")

    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    job_id = create_fetch_job(poll_id, theater_ids, dates, db)
    asyncio.create_task(run_fetch_job(job_id, poll_id, theater_ids, dates))

    return JSONResponse(
        {"job_id": job_id, "total_tasks": len(theater_ids) * len(dates)},
        status_code=202,
    )


@router.post("/api/admin/showtimes", response_class=HTMLResponse)
async def admin_add_manual_showtime(
    request: Request,
    poll_id: int = Form(...),
    event_id: int = Form(...),
    theater_id: int = Form(...),
    session_date: str = Form(...),
    session_time: str = Form(...),
    format: str = Form("Standard"),
    db: Session = Depends(get_db),
):
    verify_admin(request)
    try:
        showtime_service.add_manual_session(
            poll_id, event_id, theater_id, session_date, session_time, format, db
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    poll = db.get(Poll, poll_id)
    theaters = {t.id: t for t in theater_service.get_all_theaters(db)}
    events = {e.id: e for e in movie_service.get_poll_events(poll_id, db)}

    return templates.TemplateResponse(
        "components/admin_session_list.html",
        {
            "request": request,
            "sessions": sessions,
            "poll": poll,
            "theaters": theaters,
            "events": events,
        },
    )


@router.delete("/api/admin/showtimes/{session_id}", response_class=HTMLResponse)
async def admin_delete_showtime(
    request: Request,
    session_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    session_obj = db.get(ShowSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")
    poll_id = session_obj.poll_id
    try:
        showtime_service.delete_session(session_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    poll = db.get(Poll, poll_id)
    theaters = {t.id: t for t in theater_service.get_all_theaters(db)}
    events = {e.id: e for e in movie_service.get_poll_events(poll_id, db)}

    return templates.TemplateResponse(
        "components/admin_session_list.html",
        {
            "request": request,
            "sessions": sessions,
            "poll": poll,
            "theaters": theaters,
            "events": events,
        },
    )


# ─── Admin: Theaters ──────────────────────────────────────────────────────────

@router.get("/api/admin/theaters/search")
async def admin_search_theaters(request: Request, q: str = ""):
    verify_admin(request)
    if not q.strip():
        raise HTTPException(status_code=400, detail="q required")
    from app.config import settings as _s
    import httpx as _httpx
    if not _s.SERPAPI_KEY:
        raise HTTPException(status_code=503, detail="SerpApi key not configured")
    try:
        async with _httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://serpapi.com/search",
                params={
                    "engine": "google_local",
                    "q": f"movie theater {q}",
                    "api_key": _s.SERPAPI_KEY,
                    "hl": "en",
                    "gl": "us",
                },
            )
        data = r.json()
    except BaseException as exc:
        raise HTTPException(status_code=502, detail=f"Search error: {type(exc).__name__}: {exc}")

    if "error" in data:
        raise HTTPException(status_code=502, detail=data["error"])

    results = []
    for item in data.get("local_results", [])[:12]:
        results.append({
            "name": item.get("title", ""),
            "address": item.get("address", ""),
            "type": item.get("type", ""),
        })
    return JSONResponse({"results": results})


@router.post("/api/admin/theaters")
async def admin_add_theater(
    request: Request,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    body = await request.json()
    name = body.get("name", "").strip()
    address = body.get("address", "")
    serpapi_query = body.get("serpapi_query", "").strip()
    if not name or not serpapi_query:
        raise HTTPException(status_code=400, detail="name and serpapi_query required")
    t = theater_service.add_theater(name, address, serpapi_query, db)
    return JSONResponse(
        {"id": t.id, "name": t.name, "address": t.address, "is_active": t.is_active},
        status_code=201,
    )


@router.delete("/api/admin/theaters/{theater_id}")
async def admin_delete_theater(
    request: Request,
    theater_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    theater = db.get(TheaterModel, theater_id)
    if not theater:
        raise HTTPException(status_code=404, detail="Theater not found")
    db.delete(theater)
    db.commit()
    return {"deleted": theater_id}


@router.patch("/api/admin/theaters/{theater_id}")
async def admin_update_theater(
    request: Request,
    theater_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    body = await request.json()
    try:
        t = theater_service.update_theater(
            theater_id,
            name=body.get("name"),
            address=body.get("address"),
            serpapi_query=body.get("serpapi_query"),
            is_active=body.get("is_active"),
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"id": t.id, "name": t.name, "address": t.address, "is_active": t.is_active}


# ─── Admin: Sessions visibility ──────────────────────────────────────────────

@router.patch("/api/admin/sessions/{session_id}/visibility")
async def admin_toggle_session_visibility(
    request: Request,
    session_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    session_obj = db.get(ShowSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")
    body = await request.json()
    session_obj.is_included = body.get("is_included", not session_obj.is_included)
    db.add(session_obj)
    db.commit()
    return {"id": session_id, "is_included": session_obj.is_included}


@router.post("/api/admin/sessions/bulk-visibility")
async def admin_bulk_session_visibility(
    request: Request,
    db: Session = Depends(get_db),
):
    """Set is_included on sessions for a poll filtered by time window."""
    verify_admin(request)
    body = await request.json()
    poll_id = body.get("poll_id")
    time_start = body.get("time_start")  # "HH:MM" or None
    time_end = body.get("time_end")      # "HH:MM" or None

    sessions = db.exec(select(ShowSession).where(ShowSession.poll_id == poll_id)).all()
    updated = 0
    for s in sessions:
        include = True
        if time_start and s.session_time < time_start:
            include = False
        if time_end and s.session_time > time_end:
            include = False
        s.is_included = include
        db.add(s)
        updated += 1
    db.commit()
    return {"updated": updated}


# ─── Admin: Users & Groups ─────────────────────────────────────────────────────

@router.get("/api/admin/groups")
async def admin_list_groups(request: Request, db: Session = Depends(get_db)):
    verify_admin(request)
    groups = db.exec(select(Group)).all()
    return [{"id": g.id, "name": g.name} for g in groups]


@router.post("/api/admin/groups")
async def admin_create_group(request: Request, db: Session = Depends(get_db)):
    verify_admin(request)
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    g = Group(name=name)
    db.add(g)
    db.commit()
    db.refresh(g)
    return JSONResponse({"id": g.id, "name": g.name}, status_code=201)


@router.delete("/api/admin/groups/{group_id}")
async def admin_delete_group(request: Request, group_id: int, db: Session = Depends(get_db)):
    verify_admin(request)
    g = db.get(Group, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(g)
    db.commit()
    return {"deleted": group_id}


@router.get("/api/admin/users")
async def admin_list_users(request: Request, db: Session = Depends(get_db)):
    verify_admin(request)
    users = db.exec(select(User).order_by(User.id)).all()
    groups = {g.id: g.name for g in db.exec(select(Group)).all()}
    return [
        {
            "id": u.id, "name": u.name, "email": u.email,
            "is_admin": u.is_admin, "group_id": u.group_id,
            "group_name": groups.get(u.group_id) if u.group_id else None,
        }
        for u in users
    ]


@router.post("/api/admin/users")
async def admin_create_user(request: Request, db: Session = Depends(get_db)):
    verify_admin(request)
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    u = User(
        name=name,
        email=body.get("email") or None,
        is_admin=body.get("is_admin", False),
        group_id=body.get("group_id") or None,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return JSONResponse({"id": u.id, "name": u.name}, status_code=201)


@router.patch("/api/admin/users/{user_id}")
async def admin_update_user(request: Request, user_id: int, db: Session = Depends(get_db)):
    verify_admin(request)
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    body = await request.json()
    if "name" in body and body["name"].strip():
        u.name = body["name"].strip()
    if "email" in body:
        u.email = body["email"] or None
    if "group_id" in body:
        u.group_id = body["group_id"] or None
    db.add(u)
    db.commit()
    return {"id": u.id, "name": u.name, "email": u.email, "group_id": u.group_id}


@router.delete("/api/admin/users/{user_id}")
async def admin_delete_user(request: Request, user_id: int, db: Session = Depends(get_db)):
    verify_admin(request)
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.is_admin:
        raise HTTPException(status_code=403, detail="Cannot delete admin user")
    db.delete(u)
    db.commit()
    return {"deleted": user_id}


# ─── Admin: Polls ─────────────────────────────────────────────────────────────

@router.post("/api/admin/polls")
async def admin_create_poll(request: Request, db: Session = Depends(get_db)):
    verify_admin(request)
    body = await request.json()
    title = body.get("title", "").strip()
    target_dates = body.get("target_dates", [])
    if not title or not target_dates:
        raise HTTPException(status_code=400, detail="title and target_dates required")

    poll = Poll(
        title=title,
        target_dates=json.dumps(target_dates),
        status="DRAFT",
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(poll)
    db.commit()
    db.refresh(poll)
    return JSONResponse(
        {
            "id": poll.id,
            "title": poll.title,
            "status": poll.status,
            "target_dates": target_dates,
        },
        status_code=201,
    )


@router.post("/api/admin/polls/{poll_id}/publish")
async def admin_publish_poll(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    other_open = db.exec(select(Poll).where(Poll.status == "OPEN")).first()
    if other_open and other_open.id != poll_id:
        raise HTTPException(status_code=409, detail="Another poll is already OPEN")

    events = movie_service.get_poll_events(poll_id, db)
    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    if not events or not sessions:
        raise HTTPException(status_code=422, detail="Poll needs movies and showtimes before publishing")

    poll.status = "OPEN"
    poll.updated_at = datetime.now(timezone.utc).isoformat()
    db.add(poll)
    db.commit()
    return {"id": poll.id, "status": poll.status}


@router.post("/api/admin/polls/{poll_id}/close")
async def admin_close_poll(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    poll.status = "CLOSED"
    poll.updated_at = datetime.now(timezone.utc).isoformat()
    db.add(poll)
    db.commit()
    return {"id": poll.id, "status": poll.status}


@router.post("/api/admin/polls/{poll_id}/declare-winner")
async def admin_declare_winner(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if poll.status != "CLOSED":
        raise HTTPException(status_code=403, detail="Poll must be CLOSED first")

    body = await request.json()
    event_id = body.get("event_id")
    session_id = body.get("session_id")

    event = db.get(EventModel, event_id)
    session = db.get(ShowSession, session_id)

    if not event or not session:
        raise HTTPException(status_code=404, detail="Event or session not found")

    theater = db.get(TheaterModel, session.theater_id)
    theater_name = theater.name if theater else "Unknown Theater"

    try:
        dt = datetime.strptime(session.session_date, "%Y-%m-%d")
        date_str = dt.strftime("%A, %B %d")
    except Exception:
        date_str = session.session_date

    try:
        t = datetime.strptime(session.session_time, "%H:%M")
        h = t.hour % 12 or 12
        period = "AM" if t.hour < 12 else "PM"
        time_str = f"{h}:{t.minute:02d} {period}"
    except Exception:
        time_str = session.session_time

    fmt = f" ({session.format})" if session.format != "Standard" else ""
    summary = f"We're seeing {event.title} at {theater_name} on {date_str} at {time_str}{fmt}."

    poll.winner_event_id = event_id
    poll.winner_session_id = session_id
    db.add(poll)
    db.commit()

    return {"winner": {"event_id": event_id, "session_id": session_id, "summary": summary}}


@router.post("/api/admin/polls/{poll_id}/archive")
async def admin_archive_poll(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    poll.status = "ARCHIVED"
    poll.updated_at = datetime.now(timezone.utc).isoformat()
    db.add(poll)
    db.commit()
    return {"id": poll.id, "status": poll.status}


@router.post("/api/admin/polls/{poll_id}/reopen")
async def admin_reopen_poll(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    """Reopen a closed poll - resets winner and changes status back to OPEN"""
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if poll.status not in ["CLOSED", "ARCHIVED"]:
        raise HTTPException(status_code=400, detail="Can only reopen CLOSED or ARCHIVED polls")
    
    # Reset winner
    poll.winner_event_id = None
    poll.winner_session_id = None
    poll.status = "OPEN"
    poll.updated_at = datetime.now(timezone.utc).isoformat()
    db.add(poll)
    db.commit()
    return {"id": poll.id, "status": poll.status}


@router.delete("/api/admin/polls/{poll_id}")
async def admin_delete_poll(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    """Permanently delete a poll and all related data (votes, sessions, etc.)"""
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    
    # Import models needed for cascade delete
    from app.models import Vote, PollEvent, UserPollPreference
    
    # Delete all fetch jobs for this poll
    fetch_jobs = db.exec(select(FetchJob).where(FetchJob.poll_id == poll_id)).all()
    for job in fetch_jobs:
        db.delete(job)
    
    # Delete all votes for this poll
    votes = db.exec(select(Vote).where(Vote.poll_id == poll_id)).all()
    for vote in votes:
        db.delete(vote)
    
    # Delete all poll events
    poll_events = db.exec(select(PollEvent).where(PollEvent.poll_id == poll_id)).all()
    for pe in poll_events:
        db.delete(pe)
    
    # Delete all sessions for this poll
    sessions = db.exec(select(ShowSession).where(ShowSession.poll_id == poll_id)).all()
    for session in sessions:
        db.delete(session)
    
    # Delete user preferences for this poll
    prefs = db.exec(select(UserPollPreference).where(UserPollPreference.poll_id == poll_id)).all()
    for pref in prefs:
        db.delete(pref)
    
    # Finally delete the poll itself
    db.delete(poll)
    db.commit()
    
    return {"success": True, "deleted_poll_id": poll_id}


# ─── Admin: Jobs ──────────────────────────────────────────────────────────────

@router.get("/api/admin/jobs/{job_id}", response_class=HTMLResponse)
async def admin_job_status(
    request: Request,
    job_id: str,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    job = db.get(FetchJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = templates.TemplateResponse(
        "components/job_progress.html",
        {"request": request, "job": job},
    )
    if job.status in ("complete", "failed"):
        response.headers["HX-Trigger"] = "jobComplete"
    return response


@router.get("/api/admin/jobs/{job_id}/json")
async def admin_job_status_json(
    request: Request,
    job_id: str,
    db: Session = Depends(get_db),
):
    verify_admin(request)
    job = db.get(FetchJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    pct = int((job.completed_tasks / job.total_tasks * 100)) if job.total_tasks else 0
    return {
        "job_id": job.id,
        "status": job.status,
        "total_tasks": job.total_tasks,
        "completed_tasks": job.completed_tasks,
        "failed_tasks": job.failed_tasks,
        "percent": pct,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
    }
