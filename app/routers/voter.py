import os
from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, FileResponse, Response
from sqlmodel import Session, select

from app.db import get_db
from app.middleware.identity import get_current_user_optional, get_secure_poll_id, is_secure_entry
from app.models import Poll, PollDate, Venue, User, UserGroup, PollGroup
from app.services import movie_service, showtime_service, vote_service
from app.services.security_service import ensure_user_token, normalize_member_pin, set_voter_identity_cookies
from app.config import settings
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


def _get_browse_poll_id(request: Request) -> int | None:
    """Returns poll_id from the browse-mode cookie (set on /join/{uuid} without PIN)."""
    v = request.cookies.get("gg_browse_poll_id")
    try:
        return int(v) if v else None
    except ValueError:
        return None


def _get_poll_for_request(request: Request, statuses: list[str], db: Session) -> Poll | None:
    secure_poll_id = get_secure_poll_id(request)
    if secure_poll_id is not None:
        return db.exec(
            select(Poll).where(Poll.id == secure_poll_id, Poll.status.in_(statuses))
        ).first()
    browse_poll_id = _get_browse_poll_id(request)
    if browse_poll_id is not None:
        return db.exec(
            select(Poll).where(Poll.id == browse_poll_id, Poll.status.in_(statuses))
        ).first()
    return db.exec(select(Poll).where(Poll.status.in_(statuses))).first()


def _identity_redirect(request: Request, db: Session) -> RedirectResponse:
    from app.config import settings
    secure_poll_id = get_secure_poll_id(request)
    if secure_poll_id is not None:
        secure_poll = db.get(Poll, secure_poll_id)
        if secure_poll and secure_poll.access_uuid:
            return RedirectResponse(f"/join/{secure_poll.access_uuid}", status_code=302)
    if settings.is_production:
        return RedirectResponse("/no-poll", status_code=302)
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


@router.get("/no-poll", response_class=HTMLResponse)
async def no_poll_page(request: Request, db: Session = Depends(get_db)):
    from app.config import settings
    user = get_current_user_optional(request, db)
    closed_poll = _get_poll_for_request(request, ["CLOSED"], db)
    return templates.TemplateResponse(
        request,
        "voter/no_poll.html",
        {
            "request": request,
            "user": user,
            "closed_poll": closed_poll,
            "secure_entry": is_secure_entry(request),
            "invite_only": settings.is_production,
        },
    )


@router.get("/join/{access_uuid}", response_class=HTMLResponse)
async def secure_join_page(request: Request, access_uuid: str, db: Session = Depends(get_db)):
    """Landing page for invite link: show poll info then go straight to SPA (browse mode).
    PIN entry is deferred to /join/{uuid}/enter when the voter chooses to vote.
    """
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

    # If already authenticated for this poll, go straight to SPA
    current_user = get_current_user_optional(request, db)
    if current_user and get_secure_poll_id(request) == poll.id:
        return RedirectResponse("/vote/movies", status_code=302)

    # Set browse-mode cookie so SPA can load without PIN, then redirect to browse
    response = RedirectResponse("/vote/movies", status_code=302)
    response.set_cookie(
        "gg_browse_poll_id",
        str(poll.id),
        httponly=True,
        samesite="lax",
        secure=settings.use_https_cookies,
        max_age=3600 * 24,
    )
    return response


@router.get("/join/{access_uuid}/enter", response_class=HTMLResponse)
async def secure_join_enter(
    request: Request,
    access_uuid: str,
    db: Session = Depends(get_db),
):
    """PIN entry page — shown when voter clicks 'Join to Vote' in the SPA."""
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

    # Already authenticated — go straight to voting
    current_user = get_current_user_optional(request, db)
    if current_user and get_secure_poll_id(request) == poll.id:
        return RedirectResponse("/vote/movies", status_code=302)

    return templates.TemplateResponse(
        request,
        "voter/join_poll.html",
        {"request": request, "poll": poll, "poll_dates": _get_poll_dates(poll.id, db), "error": None},
    )


@router.post("/join/{access_uuid}/enter", response_class=HTMLResponse)
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

    # Enforce group membership — check new join table first, fall back to legacy FK
    poll_groups = db.exec(select(PollGroup).where(PollGroup.poll_id == poll.id)).all()
    if poll_groups:
        allowed_group_ids = {pg.group_id for pg in poll_groups}
        user_group_ids = {ug.group_id for ug in db.exec(select(UserGroup).where(UserGroup.user_id == user.id)).all()}
        if not (allowed_group_ids & user_group_ids):
            return templates.TemplateResponse(
                request,
                "voter/join_poll.html",
                {"request": request, "poll": poll, "poll_dates": _get_poll_dates(poll.id, db), "error": "You are not in the group for this poll."},
                status_code=403,
            )
    elif poll.group_id is not None and user.group_id != poll.group_id:
        # Legacy fallback
        return templates.TemplateResponse(
            request,
            "voter/join_poll.html",
            {"request": request, "poll": poll, "poll_dates": _get_poll_dates(poll.id, db), "error": "You are not in the group for this poll."},
            status_code=403,
        )

    user_token = ensure_user_token(user, db)

    # Auto-join: mark the voter as participating immediately on PIN entry
    from app.services import vote_service
    vote_service.set_participating(user.id, poll.id, True, db)

    response = RedirectResponse("/vote/movies", status_code=302)
    response.delete_cookie("gg_browse_poll_id")
    set_voter_identity_cookies(response, user_token=user_token, poll_id=poll.id, user_id=user.id)
    return response


@router.get("/identify", response_class=HTMLResponse)
async def identify_page(request: Request, db: Session = Depends(get_db)):
    from app.config import settings
    if settings.is_production:
        return RedirectResponse("/no-poll", status_code=302)

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
    poll = _get_poll_for_request(request, ["OPEN"], db)
    if not poll:
        return RedirectResponse("/", status_code=302)
    return _serve_spa()


@router.get("/vote/discover", response_class=HTMLResponse)
async def voter_discover(request: Request, db: Session = Depends(get_db)):
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
    if not user and _get_browse_poll_id(request) is None:
        return _identity_redirect(request, db)

    poll = _get_poll_for_request(request, ["OPEN"], db)
    if not poll:
        return RedirectResponse("/", status_code=302)

    return _serve_spa()


@router.post("/api/voter/logout")
async def voter_logout(request: Request):
    from app.services.security_service import TOKEN_COOKIE_NAME, POLL_SESSION_COOKIE_NAME
    from fastapi.responses import JSONResponse
    response = JSONResponse({"ok": True})
    response.delete_cookie(TOKEN_COOKIE_NAME, samesite="lax")
    response.delete_cookie(POLL_SESSION_COOKIE_NAME, samesite="lax")
    response.delete_cookie("gg_browse_poll_id", samesite="lax")
    response.delete_cookie("gg_preview_poll_id", samesite="lax")
    return response


@router.get("/results", response_class=HTMLResponse)
async def voter_results(request: Request, db: Session = Depends(get_db)):
    user = get_current_user_optional(request, db)
    if not user:
        return _identity_redirect(request, db)

    poll = _get_poll_for_request(request, ["OPEN", "CLOSED"], db)
    if not poll:
        return RedirectResponse("/", status_code=302)

    return _serve_spa()
