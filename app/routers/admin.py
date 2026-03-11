import json
from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from app.db import get_db
from app.middleware.auth import verify_admin
from app.models import Poll, User, Group
from app.services import movie_service, showtime_service, vote_service, theater_service
from app.templates_config import templates

router = APIRouter(prefix="/admin")


@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def admin_dashboard(request: Request, db: Session = Depends(get_db)):
    verify_admin(request)
    polls = db.exec(
        select(Poll).order_by(Poll.id.desc())
    ).all()
    active_poll = db.exec(select(Poll).where(Poll.status == "OPEN")).first()
    draft_poll = db.exec(select(Poll).where(Poll.status == "DRAFT")).first()

    poll_summaries = []
    for p in polls:
        events = movie_service.get_poll_events(p.id, db)
        sessions = showtime_service.get_sessions_for_poll(p.id, db)
        participation = vote_service.get_participation(p.id, db) if p.status in ("OPEN", "CLOSED") else None
        poll_summaries.append({
            "poll": p,
            "event_count": len(events),
            "session_count": len(sessions),
            "participation": participation,
        })

    return templates.TemplateResponse(
        "admin/dashboard.html",
        {
            "request": request,
            "polls": poll_summaries,
            "active_poll": active_poll,
            "draft_poll": draft_poll,
        },
    )


@router.get("/polls/{poll_id}/movies", response_class=HTMLResponse)
async def admin_movies(request: Request, poll_id: int, db: Session = Depends(get_db)):
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        return RedirectResponse("/admin", status_code=302)

    events = movie_service.get_poll_events(poll_id, db)

    return templates.TemplateResponse(
        "admin/movies.html",
        {
            "request": request,
            "poll": poll,
            "events": events,
            "poster_url": movie_service.poster_url,
        },
    )


@router.get("/polls/{poll_id}/showtimes", response_class=HTMLResponse)
async def admin_showtimes(request: Request, poll_id: int, db: Session = Depends(get_db)):
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        return RedirectResponse("/admin", status_code=302)

    events = movie_service.get_poll_events(poll_id, db)
    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    theaters = theater_service.get_active_theaters(db)
    theater_map = {t.id: t for t in theater_service.get_all_theaters(db)}
    event_map = {e.id: e for e in events}

    target_dates = json.loads(poll.target_dates) if poll.target_dates else []

    grouped_sessions: dict = {}
    for s in sessions:
        key = (s.session_date, s.theater_id)
        if key not in grouped_sessions:
            grouped_sessions[key] = []
        grouped_sessions[key].append(s)

    return templates.TemplateResponse(
        "admin/showtimes.html",
        {
            "request": request,
            "poll": poll,
            "events": events,
            "sessions": sessions,
            "theaters": theaters,
            "theater_map": theater_map,
            "event_map": event_map,
            "target_dates": target_dates,
            "grouped_sessions": grouped_sessions,
        },
    )


@router.get("/theaters", response_class=HTMLResponse)
async def admin_theaters(request: Request, db: Session = Depends(get_db)):
    verify_admin(request)
    theaters = theater_service.get_all_theaters(db)
    return templates.TemplateResponse(
        "admin/theaters.html",
        {"request": request, "theaters": theaters},
    )


@router.get("/members", response_class=HTMLResponse)
async def admin_members(request: Request, db: Session = Depends(get_db)):
    verify_admin(request)
    users = db.exec(select(User).order_by(User.id)).all()
    groups = db.exec(select(Group)).all()
    group_map = {g.id: g.name for g in groups}
    return templates.TemplateResponse(
        "admin/members.html",
        {
            "request": request,
            "users": users,
            "groups": groups,
            "group_map": group_map,
        },
    )


@router.get("/polls/{poll_id}/results", response_class=HTMLResponse)
async def admin_results(request: Request, poll_id: int, db: Session = Depends(get_db)):
    verify_admin(request)
    poll = db.get(Poll, poll_id)
    if not poll:
        return RedirectResponse("/admin", status_code=302)

    results = vote_service.calculate_results(poll_id, db)
    participation = vote_service.get_participation(poll_id, db)
    theater_map = {t.id: t for t in theater_service.get_all_theaters(db)}

    winner_event = None
    winner_session = None
    if poll.winner_event_id:
        from app.models import Event, Session as ShowSession
        winner_event = db.get(Event, poll.winner_event_id)
        winner_session = db.get(ShowSession, poll.winner_session_id)

    return templates.TemplateResponse(
        "admin/results.html",
        {
            "request": request,
            "poll": poll,
            "results": results,
            "participation": participation,
            "poster_url": movie_service.poster_url,
            "theater_map": theater_map,
            "winner_event": winner_event,
            "winner_session": winner_session,
        },
    )
