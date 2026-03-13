import os
from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse, Response
from sqlmodel import Session, select

from app.db import get_db
from app.middleware.identity import get_current_user_optional, get_secure_poll_id, is_secure_entry
from app.models import Poll, PollDate, Venue, User
from app.services import movie_service, showtime_service, vote_service
from app.services.security_service import ensure_user_token, normalize_member_pin, set_voter_identity_cookies
from app.templates_config import templates

router = APIRouter()

_SPA_PATH = os.path.join("static", "voter", "index.html")


def _serve_spa() -> Response:
    if os.path.exists(_SPA_PATH):
        return FileResponse(_SPA_PATH)
    return HTMLResponse(
        "<p>Voter SPA not built yet. Run <code>npm run build</code> in voter-spa/.</p>",
        status_code=503,
    )


def _get_poll_dates(poll_id: int, db: Session) -> list[str]:
    return [pd.date for pd in db.exec(select(PollDate).where(PollDate.poll_id == poll_id)).all()]


def _get_poll_for_request(request: Request, statuses: list[str], db: Session) -> Poll | None:
    secure_poll_id = get_secure_poll_id(request)
    if secure_poll_id is not None:
        return db.exec(
            select(Poll).where(Poll.id == secure_poll_id, Poll.status.in_(statuses))
        ).first()
    return db.exec(select(Poll).where(Poll.status.in_(statuses))).first()


def _identity_redirect(request: Request, db: Session) -> RedirectResponse:
    secure_poll_id = get_secure_poll_id(request)
    if secure_poll_id is not None:
        secure_poll = db.get(Poll, secure_poll_id)
        if secure_poll and secure_poll.access_uuid:
            return RedirectResponse(f"/join/{secure_poll.access_uuid}", status_code=302)
    return RedirectResponse("/identify", status_code=302)


def _redirect_if_secure_session_exists(request: Request, db: Session) -> RedirectResponse | None:
    if not is_secure_entry(request):
        return None

    user = get_current_user_optional(request, db)
    poll = _get_poll_for_request(request, ["OPEN", "CLOSED"], db)
    if user and poll:
        target = "/vote/movies" if poll.status == "OPEN" else "/results"
        return RedirectResponse(target, status_code=302)
    return None


@router.get("/", response_class=HTMLResponse)
async def voter_home(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if not user:
        return _identity_redirect(request, db)

    poll = _get_poll_for_request(request, ["OPEN"], db)
    if not poll:
        closed_poll = _get_poll_for_request(request, ["CLOSED"], db)
        return templates.TemplateResponse(
            request,
            "voter/no_poll.html",
            {
                "request": request,
                "user": user,
                "closed_poll": closed_poll,
                "secure_entry": is_secure_entry(request),
            },
        )

    return RedirectResponse("/vote/movies", status_code=302)


@router.get("/join/{access_uuid}", response_class=HTMLResponse)
async def secure_join_page(request: Request, access_uuid: str, db: Session = Depends(get_db)):
    poll = db.exec(select(Poll).where(Poll.access_uuid == access_uuid)).first()
    if not poll:
        return templates.TemplateResponse(
            request,
            "voter/join_poll.html",
            {"request": request, "poll": None, "poll_dates": [], "error": "This invite link is not valid."},
            status_code=404,
        )
    if poll.status != "OPEN":
        return templates.TemplateResponse(
            request,
            "voter/join_poll.html",
            {"request": request, "poll": poll, "poll_dates": _get_poll_dates(poll.id, db), "error": "This poll is not currently accepting votes."},
            status_code=403,
        )

    current_user = get_current_user_optional(request, db)
    if current_user and get_secure_poll_id(request) == poll.id:
        return RedirectResponse("/vote/movies", status_code=302)

    return templates.TemplateResponse(
        request,
        "voter/join_poll.html",
        {"request": request, "poll": poll, "poll_dates": _get_poll_dates(poll.id, db), "error": None},
    )


@router.get("/join/{access_uuid}/preview", response_class=HTMLResponse)
async def secure_join_preview(
    request: Request,
    access_uuid: str,
    db: Session = Depends(get_db),
):
    """Preview Without Voting: set the secure poll context then go to identify.
    After identifying, the user lands on /vote/movies in non-participating state.
    """
    poll = db.exec(select(Poll).where(Poll.access_uuid == access_uuid)).first()
    if not poll or poll.status != "OPEN":
        return RedirectResponse(f"/join/{access_uuid}", status_code=302)

    current_user = get_current_user_optional(request, db)
    if current_user:
        from app.services.security_service import ensure_user_token, set_voter_identity_cookies
        user_token = ensure_user_token(current_user, db)
        response = RedirectResponse("/vote/movies", status_code=302)
        set_voter_identity_cookies(response, user_token=user_token, poll_id=poll.id, user_id=current_user.id)
        return response

    response = RedirectResponse("/identify", status_code=302)
    from app.services.security_service import POLL_SESSION_COOKIE_NAME, create_poll_session_token
    response.set_cookie(
        "gg_preview_poll_id",
        str(poll.id),
        httponly=True,
        samesite="lax",
        max_age=3600,
    )
    return response


@router.post("/join/{access_uuid}", response_class=HTMLResponse)
async def secure_join_submit(
    request: Request,
    access_uuid: str,
    member_pin: str = Form(...),
    db: Session = Depends(get_db),
):
    poll = db.exec(select(Poll).where(Poll.access_uuid == access_uuid)).first()
    if not poll:
        return templates.TemplateResponse(
            request,
            "voter/join_poll.html",
            {"request": request, "poll": None, "poll_dates": [], "error": "This invite link is not valid."},
            status_code=404,
        )
    if poll.status != "OPEN":
        return templates.TemplateResponse(
            request,
            "voter/join_poll.html",
            {"request": request, "poll": poll, "poll_dates": _get_poll_dates(poll.id, db), "error": "This poll is not currently accepting votes."},
            status_code=403,
        )

    try:
        pin = normalize_member_pin(member_pin)
    except ValueError as exc:
        return templates.TemplateResponse(
            request,
            "voter/join_poll.html",
            {"request": request, "poll": poll, "poll_dates": _get_poll_dates(poll.id, db), "error": str(exc)},
            status_code=400,
        )

    user = db.exec(
        select(User).where(User.member_pin == pin)
    ).first()
    if not user:
        return templates.TemplateResponse(
            request,
            "voter/join_poll.html",
            {"request": request, "poll": poll, "poll_dates": _get_poll_dates(poll.id, db), "error": "That PIN does not match a member."},
            status_code=401,
        )

    user_token = ensure_user_token(user, db)
    response = RedirectResponse("/vote/movies", status_code=302)
    set_voter_identity_cookies(response, user_token=user_token, poll_id=poll.id, user_id=user.id)
    return response


@router.get("/identify", response_class=HTMLResponse)
async def identify_page(request: Request, db: Session = Depends(get_db)):
    secure_redirect = _redirect_if_secure_session_exists(request, db)
    if secure_redirect:
        return secure_redirect

    users = db.exec(select(User).where(User.role == "voter")).all()
    return templates.TemplateResponse(
        request,
        "voter/identify.html", {"request": request, "users": users, "secure_entry": False}
    )


@router.post("/identify", response_class=HTMLResponse)
async def identify_submit(
    request: Request,
    user_id: int = Form(...),
    db: Session = Depends(get_db),
):
    secure_redirect = _redirect_if_secure_session_exists(request, db)
    if secure_redirect:
        return secure_redirect

    user = db.get(User, user_id)
    if not user:
        users = db.exec(select(User).where(User.role == "voter")).all()
        return templates.TemplateResponse(
            request,
            "voter/identify.html",
            {"request": request, "users": users, "error": "Invalid selection", "secure_entry": False},
        )

    user_token = ensure_user_token(user, db)
    preview_poll_id_str = request.cookies.get("gg_preview_poll_id")
    if preview_poll_id_str:
        try:
            preview_poll_id = int(preview_poll_id_str)
            preview_poll = db.get(Poll, preview_poll_id)
        except (ValueError, Exception):
            preview_poll = None
    else:
        preview_poll = None

    if preview_poll and preview_poll.status == "OPEN":
        response = RedirectResponse("/vote/movies", status_code=302)
        set_voter_identity_cookies(response, user_token=user_token, poll_id=preview_poll.id, user_id=user.id)
        response.delete_cookie("gg_preview_poll_id")
    else:
        response = RedirectResponse("/", status_code=302)
        set_voter_identity_cookies(response, user_token=user_token)
    return response


@router.get("/vote/movies", response_class=HTMLResponse)
async def voter_movies(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if not user:
        return _identity_redirect(request, db)

    poll = _get_poll_for_request(request, ["OPEN"], db)
    if not poll:
        return RedirectResponse("/", status_code=302)

    return _serve_spa()


@router.get("/vote/showtimes", response_class=HTMLResponse)
@router.get("/vote/logistics", response_class=HTMLResponse)
async def voter_logistics(
    request: Request,
    view_all: bool = False,
    db: Session = Depends(get_db)
):
    user = get_current_user_optional(request, db)
    if not user:
        return _identity_redirect(request, db)

    poll = _get_poll_for_request(request, ["OPEN"], db)
    if not poll:
        return RedirectResponse("/", status_code=302)

    return _serve_spa()


@router.get("/results", response_class=HTMLResponse)
async def voter_results(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if not user:
        return _identity_redirect(request, db)

    poll = _get_poll_for_request(request, ["OPEN", "CLOSED"], db)
    if not poll:
        return RedirectResponse("/", status_code=302)

    return _serve_spa()
