import uuid
from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlmodel import Session, select

from app.db import get_db
from app.middleware.identity import get_current_user_optional
from app.models import Poll, User
from app.services import movie_service, showtime_service, vote_service
from app.templates_config import templates

router = APIRouter()


@router.get("/", response_class=HTMLResponse)
async def voter_home(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if not user:
        return RedirectResponse("/identify", status_code=302)

    poll = db.exec(select(Poll).where(Poll.status == "OPEN")).first()
    if not poll:
        closed_poll = db.exec(select(Poll).where(Poll.status == "CLOSED")).first()
        return templates.TemplateResponse(
            "voter/no_poll.html",
            {"request": request, "user": user, "closed_poll": closed_poll},
        )

    return RedirectResponse("/vote/movies", status_code=302)


@router.get("/identify", response_class=HTMLResponse)
async def identify_page(request: Request, db: Session = Depends(get_db)):
    users = db.exec(select(User).where(User.is_admin == False)).all()
    return templates.TemplateResponse(
        "voter/identify.html", {"request": request, "users": users}
    )


@router.post("/identify", response_class=HTMLResponse)
async def identify_submit(
    request: Request,
    user_id: int = Form(...),
    db: Session = Depends(get_db),
):
    user = db.get(User, user_id)
    if not user:
        users = db.exec(select(User).where(User.is_admin == False)).all()
        return templates.TemplateResponse(
            "voter/identify.html",
            {"request": request, "users": users, "error": "Invalid selection"},
        )

    if not user.token:
        user.token = str(uuid.uuid4())
        db.add(user)
        db.commit()
        db.refresh(user)

    response = RedirectResponse("/", status_code=302)
    response.set_cookie(
        "token",
        user.token,
        max_age=60 * 60 * 24 * 365,
        httponly=True,
        samesite="lax",
    )
    return response


@router.get("/vote/movies", response_class=HTMLResponse)
async def voter_movies(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if not user:
        return RedirectResponse("/identify", status_code=302)

    poll = db.exec(select(Poll).where(Poll.status == "OPEN")).first()
    if not poll:
        return RedirectResponse("/", status_code=302)

    events = movie_service.get_poll_events(poll.id, db)
    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    participation = vote_service.get_participation(poll.id, db)

    return templates.TemplateResponse(
        "voter/movies.html",
        {
            "request": request,
            "user": user,
            "poll": poll,
            "events": events,
            "user_votes": user_votes,
            "participation": participation,
            "poster_url": movie_service.poster_url,
            "active_tab": "movies",
        },
    )


@router.get("/vote/logistics", response_class=HTMLResponse)
async def voter_logistics(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if not user:
        return RedirectResponse("/identify", status_code=302)

    poll = db.exec(select(Poll).where(Poll.status == "OPEN")).first()
    if not poll:
        return RedirectResponse("/", status_code=302)

    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    yes_event_ids = [tid for (tt, tid), val in user_votes.items() if tt == "event" and val == "yes"]
    grouped = showtime_service.get_sessions_grouped(poll.id, db, event_ids=yes_event_ids or None)
    is_flexible = vote_service.get_is_flexible(user.id, poll.id, db)
    participation = vote_service.get_participation(poll.id, db)

    return templates.TemplateResponse(
        "voter/logistics.html",
        {
            "request": request,
            "user": user,
            "poll": poll,
            "grouped": grouped,
            "user_votes": user_votes,
            "is_flexible": is_flexible,
            "participation": participation,
            "active_tab": "logistics",
        },
    )


@router.get("/results", response_class=HTMLResponse)
async def voter_results(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if not user:
        return RedirectResponse("/identify", status_code=302)

    poll = db.exec(select(Poll).where(Poll.status.in_(["OPEN", "CLOSED"]))).first()
    if not poll:
        return RedirectResponse("/", status_code=302)

    results = vote_service.calculate_results(poll.id, db)
    participation = vote_service.get_participation(poll.id, db)

    winner_event = None
    winner_session = None
    if poll.status == "CLOSED" and poll.winner_event_id:
        from app.models import Event, Session as ShowSession
        winner_event = db.get(Event, poll.winner_event_id)
        winner_session = db.get(ShowSession, poll.winner_session_id)

    return templates.TemplateResponse(
        "voter/results.html",
        {
            "request": request,
            "user": user,
            "poll": poll,
            "results": results,
            "participation": participation,
            "poster_url": movie_service.poster_url,
            "winner_event": winner_event,
            "winner_session": winner_session,
            "active_tab": "results",
        },
    )
