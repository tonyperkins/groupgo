import json
import logging
from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from app.db import get_db
from app.middleware.auth import verify_admin, get_admin_user
from app.models import Poll, PollDate, User, Group, Showtime, UserGroup, PollGroup
from app.services import movie_service, showtime_service, vote_service, theater_service
from app.services.auth_service import (
    ADMIN_SESSION_COOKIE,
    ADMIN_SESSION_TTL_DAYS,
    send_admin_magic_link,
    consume_magic_link,
    create_admin_session,
    revoke_admin_session,
)
from app.templates_config import templates

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin")


# ─── Auth routes ──────────────────────────────────────────────────────────────

@router.get("/login", response_class=HTMLResponse)
async def admin_login_page(request: Request):
    return templates.TemplateResponse(
        request, "admin/login.html", {"request": request, "sent": False, "error": None}
    )


@router.post("/login", response_class=HTMLResponse)
async def admin_login_submit(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db),
):
    try:
        send_admin_magic_link(email.strip().lower(), db)
    except Exception as exc:
        logger.error("[LOGIN] Failed to send magic link to %s: %s", email, exc)
        return templates.TemplateResponse(
            request, "admin/login.html",
            {"request": request, "sent": False,
             "error": "Could not send login email. Check server SMTP configuration."},
            status_code=500,
        )
    return templates.TemplateResponse(
        request, "admin/login.html", {"request": request, "sent": True, "error": None}
    )


@router.get("/auth/{token}", response_class=HTMLResponse)
async def admin_auth_token(
    request: Request,
    token: str,
    db: Session = Depends(get_db),
):
    user = consume_magic_link(token, "admin_login", db)
    if not user:
        return templates.TemplateResponse(
            request,
            "admin/login.html",
            {"request": request, "sent": False, "error": "This login link is invalid or has expired."},
            status_code=400,
        )

    session_id = create_admin_session(user, dict(request.headers), db)
    response = RedirectResponse("/admin", status_code=302)
    response.set_cookie(
        ADMIN_SESSION_COOKIE,
        session_id,
        max_age=60 * 60 * 24 * ADMIN_SESSION_TTL_DAYS,
        path="/",
        httponly=True,
        secure=False,
        samesite="lax",
    )
    return response


@router.get("/logout")
@router.post("/logout")
async def admin_logout(
    request: Request,
    db: Session = Depends(get_db),
):
    session_id = request.cookies.get(ADMIN_SESSION_COOKIE)
    if session_id:
        revoke_admin_session(session_id, db)
    response = RedirectResponse("/admin/login", status_code=302)
    response.delete_cookie(ADMIN_SESSION_COOKIE, path="/")
    return response


@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def admin_dashboard(request: Request, db: Session = Depends(get_db)):
    verify_admin(request, db)
    polls = db.exec(
        select(Poll).order_by(Poll.id.desc())
    ).all()
    open_polls = db.exec(select(Poll).where(Poll.status == "OPEN")).all()
    draft_poll = db.exec(select(Poll).where(Poll.status == "DRAFT")).first()
    groups = db.exec(select(Group)).all()

    all_pg = db.exec(select(PollGroup)).all()
    poll_group_map: dict[int, list[int]] = {}
    for pg in all_pg:
        poll_group_map.setdefault(pg.poll_id, []).append(pg.group_id)

    all_poll_dates = db.exec(select(PollDate)).all()
    poll_dates_map: dict[int, list[str]] = {}
    for pd in all_poll_dates:
        poll_dates_map.setdefault(pd.poll_id, []).append(pd.date)

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
            "group_ids": poll_group_map.get(p.id, [p.group_id] if p.group_id else []),
            "dates": sorted(poll_dates_map.get(p.id, [])),
        })

    return templates.TemplateResponse(
        request,
        "admin/dashboard.html",
        {
            "request": request,
            "polls": poll_summaries,
            "open_poll_count": len(open_polls),
            "draft_poll": draft_poll,
            "groups": groups,
            "poll_group_map": poll_group_map,
        },
    )


@router.get("/polls/new")
async def admin_new_poll(request: Request, db: Session = Depends(get_db)):
    """Create a new DRAFT poll and redirect to curation."""
    from app.middleware.identity import get_current_user
    from datetime import datetime, timezone, timedelta

    user = get_current_user(request, db)
    
    # Create the poll
    new_poll = Poll(
        title="My New Movie Night",
        status="DRAFT",
        created_by_user_id=user.id,
        created_at=datetime.now(timezone.utc).isoformat(),
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(new_poll)
    db.commit()
    db.refresh(new_poll)

    # Add a default date (Tomorrow)
    default_date = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    db.add(PollDate(poll_id=new_poll.id, date=default_date))
    
    # Associate with user's groups if any
    from app.models import UserGroup, PollGroup
    user_groups = db.exec(select(UserGroup).where(UserGroup.user_id == user.id)).all()
    for ug in user_groups:
        db.add(PollGroup(poll_id=new_poll.id, group_id=ug.group_id))
    
    db.commit()

    # Redirect to SPA curation
    return RedirectResponse(url=f"/vote/admin", status_code=302)


@router.get("/polls/{poll_id}/movies", response_class=HTMLResponse)
async def admin_movies(request: Request, poll_id: int, db: Session = Depends(get_db)):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        return RedirectResponse("/admin", status_code=302)

    events = movie_service.get_poll_events(poll_id, db)
    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    theaters = theater_service.get_active_theaters(db)
    theater_map = {t.id: t for t in theater_service.get_all_theaters(db)}
    event_map = {e.id: e for e in events}
    event_ids_with_sessions = {s.event_id for s in sessions}
    target_dates = [pd.date for pd in db.exec(select(PollDate).where(PollDate.poll_id == poll_id)).all()]

    grouped_sessions: dict = {}
    for s in sessions:
        key = (s.session_date, s.theater_id)
        if key not in grouped_sessions:
            grouped_sessions[key] = []
        grouped_sessions[key].append(s)

    return templates.TemplateResponse(
        request,
        "admin/movies.html",
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
            "poster_url": movie_service.poster_url,
            "event_ids_with_sessions": event_ids_with_sessions,
        },
    )


@router.get("/polls/{poll_id}/showtimes", response_class=HTMLResponse)
async def admin_showtimes(request: Request, poll_id: int, db: Session = Depends(get_db)):
    return RedirectResponse(f"/admin/polls/{poll_id}/movies", status_code=302)


@router.get("/theaters", response_class=HTMLResponse)
async def admin_theaters(request: Request, db: Session = Depends(get_db)):
    verify_admin(request, db)
    theaters = theater_service.get_all_theaters(db)
    return templates.TemplateResponse(
        request,
        "admin/theaters.html",
        {"request": request, "theaters": theaters},
    )


@router.get("/members", response_class=HTMLResponse)
async def admin_members(request: Request, db: Session = Depends(get_db)):
    verify_admin(request, db)
    users = db.exec(select(User).order_by(User.id)).all()
    groups = db.exec(select(Group)).all()
    group_map = {g.id: g.name for g in groups}
    all_ug = db.exec(select(UserGroup)).all()
    user_group_map: dict[int, list[int]] = {}
    for ug in all_ug:
        user_group_map.setdefault(ug.user_id, []).append(ug.group_id)
    return templates.TemplateResponse(
        request,
        "admin/members.html",
        {
            "request": request,
            "users": users,
            "groups": groups,
            "group_map": group_map,
            "user_group_map": user_group_map,
        },
    )


@router.get("/polls/{poll_id}/results", response_class=HTMLResponse)
async def admin_results(request: Request, poll_id: int, db: Session = Depends(get_db)):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        return RedirectResponse("/admin", status_code=302)

    results = vote_service.calculate_results(poll_id, db)
    participation = vote_service.get_participation(poll_id, db)
    theater_map = {t.id: t for t in theater_service.get_all_theaters(db)}

    winner_event = None
    winner_session = None
    if poll.winner_event_id:
        from app.models import Event
        winner_event = db.get(Event, poll.winner_event_id)
        winner_session = db.get(Showtime, poll.winner_session_id)

    return templates.TemplateResponse(
        request,
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
