import asyncio
import json
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Request, Depends, HTTPException, Form
from fastapi.responses import HTMLResponse, JSONResponse
from sqlmodel import Session, select

from app.db import get_db
from app.middleware.identity import get_current_user, get_current_user_optional, get_secure_poll_id, is_secure_entry
from app.middleware.auth import verify_admin
from app.models import Poll, PollDate, FetchJob, User, Group, Event as EventModel, Venue as VenueModel, Showtime as ShowSession, Vote as VoteModel, UserGroup, PollGroup
from app.services import vote_service, movie_service, showtime_service, theater_service
from app.services.security_service import (
    build_poll_invite_url,
    ensure_poll_access_uuid,
    ensure_unique_member_pin,
    generate_member_pin,
    normalize_member_pin,
)
from app.tasks.fetch_tasks import run_fetch_job, create_fetch_job
from app.templates_config import templates

router = APIRouter()


def _get_browse_poll_id(request: Request) -> int | None:
    v = request.cookies.get("gg_browse_poll_id")
    try:
        return int(v) if v else None
    except ValueError:
        return None


def _get_voter_poll_for_request(request: Request, statuses: list[str], db: Session) -> Poll | None:
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


# ─── Health ───────────────────────────────────────────────────────────────────

@router.get("/api/admin/serpapi/status")
async def serpapi_status(request: Request, db: Session = Depends(get_db)):
    verify_admin(request, db)
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


# ─── Vote endpoints (HTMX — DEPRECATED) ──────────────────────────────────────
#
# These endpoints return HTML fragments for HTMX consumption by the old
# Jinja2 voter templates. They are KEPT ALIVE during the React SPA transition
# so the existing voter flow doesn't break while the SPA is being built.
#
# DO NOT extend or refactor these endpoints. DO NOT add new features here.
#
# Replacement plan (Session 1 of React migration):
#   - Add GET  /api/voter/me           → JSON bootstrap endpoint
#   - Add POST /api/voter/votes/movie  → JSON vote endpoint
#   - Add POST /api/voter/votes/session → JSON vote endpoint
#   - Add POST /api/voter/votes/flexible → JSON endpoint
#   - Add POST /api/voter/votes/complete → JSON endpoint
#   - Add POST /api/voter/votes/participation → JSON endpoint
#
# Once the React SPA is fully wired and the old voter templates are removed,
# delete all endpoints in this section.
# ─────────────────────────────────────────────────────────────────────────────

# TODO: deprecate — replaced by POST /api/voter/votes/movie (JSON)
@router.post("/api/votes/movie", response_class=HTMLResponse)
async def vote_movie(
    request: Request,
    event_id: int = Form(...),
    vote: str = Form(...),
    veto_reason: str = Form(default=None),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")
    if vote not in ("yes", "no", "abstain"):
        raise HTTPException(status_code=400, detail="Invalid vote value")

    vote_service.cast_vote(user.id, poll.id, "event", event_id, vote, db, veto_reason=veto_reason)

    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    veto_reasons = vote_service.get_user_veto_reasons(user.id, poll.id, db)
    poll_preferences = vote_service.get_user_poll_preferences(user.id, poll.id, db)
    current = user_votes.get(("event", event_id), "abstain")
    events = movie_service.get_poll_events(poll.id, db)
    is_single_movie = len(events) == 1

    response = templates.TemplateResponse(
        request,
        "components/movie_vote_toggle.html",
        {"request": request, "event_id": event_id, "current_vote": current, "veto_reasons": veto_reasons, "poll_preferences": poll_preferences, "movies_opted_in": poll_preferences["is_participating"], "is_single_movie": is_single_movie},
    )
    response.headers["HX-Trigger"] = "voteSaved"
    return response


# TODO: deprecate — replaced by POST /api/voter/votes/session (JSON)
@router.post("/api/votes/session", response_class=HTMLResponse)
async def vote_session(
    request: Request,
    session_id: int = Form(...),
    vote: str = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")
    if vote not in ("can_do", "cant_do", "abstain"):
        raise HTTPException(status_code=400, detail="Invalid vote value")

    vote_service.cast_vote(user.id, poll.id, "session", session_id, vote, db)

    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    poll_preferences = vote_service.get_user_poll_preferences(user.id, poll.id, db)
    current = user_votes.get(("session", session_id), "abstain")
    session_obj = db.get(ShowSession, session_id)
    if not session_obj or session_obj.poll_id != poll.id:
        raise HTTPException(status_code=404, detail="Session not found")
    enabled_showtime_event_ids = vote_service.get_showtime_event_ids(user_votes) or []
    event = db.get(EventModel, session_obj.event_id)
    item = {"event_title": event.title if event else "Unknown title", "session": session_obj}
    response = templates.TemplateResponse(
        request,
        "components/session_card.html",
        {
            "request": request,
            "session_id": session_id,
            "current_vote": current,
            "s": session_obj,
            "item": item,
            "poll_preferences": poll_preferences,
            "enabled_showtime_event_ids": enabled_showtime_event_ids,
            "view_all_mode": (not poll_preferences["is_participating"]) or (not enabled_showtime_event_ids),
        },
    )
    response.headers["HX-Trigger"] = "voteSaved"
    return response


# TODO: deprecate — replaced by POST /api/voter/votes/flexible (JSON)
@router.post("/api/votes/flexible", response_class=HTMLResponse)
async def vote_flexible(
    request: Request,
    is_flexible: str = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    flexible = is_flexible.lower() in ("true", "1", "yes")
    vote_service.set_flexible(user.id, poll.id, flexible, db)

    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    showtime_event_ids = vote_service.get_showtime_event_ids(user_votes)
    poll_preferences = vote_service.get_user_poll_preferences(user.id, poll.id, db)
    should_preview_all = not poll_preferences["is_participating"] or showtime_event_ids == []
    grouped = showtime_service.get_sessions_grouped(
        poll.id,
        db,
        include_all_when_none_included=True,
    )
    response = templates.TemplateResponse(
        request,
        "components/logistics_panel.html",
        {
            "request": request,
            "is_flexible": flexible,
            "grouped": grouped,
            "user_votes": user_votes,
            "poll": poll,
            "poll_preferences": poll_preferences,
            "needs_movie_pick_first": showtime_event_ids == [] and poll_preferences["is_participating"],
            "view_all_mode": should_preview_all,
            "enabled_showtime_event_ids": showtime_event_ids or [],
        },
    )
    response.headers["HX-Trigger"] = "voteSaved"
    return response


# TODO: deprecate — replaced by POST /api/voter/votes/complete (JSON)
# NOTE: current impl uses HX-Refresh (full page reload) as a workaround for
# missing React state management. The React replacement should return
# {status, is_complete, yes_movie_count} and let the client handle navigation.
@router.post("/api/votes/complete", response_class=JSONResponse)
async def vote_complete(
    request: Request,
    is_complete: str = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    complete = is_complete.lower() in ("true", "1", "yes")
    vote_service.mark_voting_complete(user.id, poll.id, complete, db)
    response = JSONResponse({"status": "ok", "is_complete": complete})
    response.headers["HX-Refresh"] = "true"
    return response


# TODO: deprecate — replaced by POST /api/voter/votes/participation (JSON)
# NOTE: same HX-Refresh workaround as vote_complete above.
@router.post("/api/votes/participation", response_class=JSONResponse)
async def vote_participation(
    request: Request,
    is_participating: str = Form(...),
    opt_out_reason: str = Form(default=None),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    participating = is_participating.lower() in ("true", "1", "yes")
    vote_service.set_participating(user.id, poll.id, participating, db, opt_out_reason=opt_out_reason)
    response = JSONResponse({"status": "ok", "is_participating": participating})
    response.headers["HX-Refresh"] = "true"
    return response


# TODO: deprecate — HTMX tab bar fragment, not needed by React SPA
@router.get("/api/votes/tab-bar", response_class=HTMLResponse)
async def get_tab_bar(
    request: Request,
    page: str = "movies",
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        return HTMLResponse("")

    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    is_flexible = vote_service.get_is_flexible(user.id, poll.id, db)
    yes_movie_count = vote_service.get_yes_movie_count(user.id, poll.id, db)
    voted_session_count = sum(1 for k, v in user_votes.items() if k[0] == "session" and v == "can_do")

    return templates.TemplateResponse(
        request,
        "components/gg_tab_bar.html",
        {
            "request": request,
            "active_tab": page,
            "yes_movie_count": yes_movie_count,
            "voted_session_count": voted_session_count,
            "is_flexible": is_flexible,
            "showtimes_locked": yes_movie_count == 0,
            "poll_preferences": vote_service.get_user_poll_preferences(user.id, poll.id, db),
        },
    )


# TODO: deprecate — HTMX OOB state fragment, not needed by React SPA
@router.get("/api/votes/state", response_class=HTMLResponse)
async def get_vote_state(
    request: Request,
    page: str,
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        return HTMLResponse("")

    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    poll_preferences = vote_service.get_user_poll_preferences(user.id, poll.id, db)
    participation = vote_service.get_participation(poll.id, db)
    events = movie_service.get_poll_events(poll.id, db)
    is_flexible = vote_service.get_is_flexible(user.id, poll.id, db)
    showtime_event_ids = vote_service.get_showtime_event_ids(user_votes)
    voted_session_count = sum(1 for k, v in user_votes.items() if k[0] == "session" and v == "can_do")
    voted_movie_count = vote_service.get_voted_movie_count(user.id, poll.id, db)
    yes_movie_count = vote_service.get_yes_movie_count(user.id, poll.id, db)

    movies_opted_in = poll_preferences["is_participating"]
    has_saved_votes = any(v != "abstain" for v in user_votes.values())
    is_joined = movies_opted_in
    needs_movie_pick_first = showtime_event_ids == [] and movies_opted_in
    view_all_mode = (not movies_opted_in) or showtime_event_ids == []

    return templates.TemplateResponse(
        request,
        "fragments/voter_state_oob.html",
        {
            "request": request,
            "user": user,
            "poll": poll,
            "events": events,
            "voted_movie_count": voted_movie_count,
            "yes_movie_count": yes_movie_count,
            "voted_session_count": voted_session_count,
            "is_flexible": is_flexible,
            "needs_movie_pick_first": needs_movie_pick_first,
            "view_all_mode": view_all_mode,
            "is_joined": is_joined,
            "has_saved_votes": has_saved_votes,
            "poll_preferences": poll_preferences,
            "participation": participation,
            "page": page,
        },
    )


# ─── Results ──────────────────────────────────────────────────────────────────

# TODO: deprecate — HTMX results fragment, not needed by React SPA
@router.get("/api/results", response_class=HTMLResponse)
async def results_fragment(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN", "CLOSED"], db)

    if not poll:
        return templates.TemplateResponse(
            request,
            "components/no_poll.html", {"request": request}
        )

    results = vote_service.calculate_results(poll.id, db)
    personal_results = vote_service.calculate_user_results(user.id, poll.id, db)
    participation = vote_service.get_participation(poll.id, db)
    theaters = theater_service.get_all_theaters(db)
    theater_map = {theater.id: theater for theater in theaters}

    return templates.TemplateResponse(
        request,
        "components/results_panel.html",
        {
            "request": request,
            "user": user,
            "results": results,
            "personal_results": personal_results,
            "participation": participation,
            "poll": poll,
            "theater_map": theater_map,
            "poster_url": movie_service.poster_url,
        },
    )


# KEEP — used by React SPA for live results polling
@router.get("/api/results/json")
async def results_json(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN", "CLOSED"], db)
    if not poll:
        raise HTTPException(status_code=404, detail="No active poll")

    results = vote_service.calculate_results(poll.id, db)
    personal_results = vote_service.calculate_user_results(user.id, poll.id, db)
    participation = vote_service.get_participation(poll.id, db)
    theater_map = {t.id: t.name for t in theater_service.get_all_theaters(db)}

    # Build personal_pick_keys from the user's own raw votes directly —
    # not from calculate_user_results which uses the submitted-only vote_lookup.
    # This ensures unsubmitted selections still show in MY PENDING VOTE.
    user_votes = db.exec(
        select(VoteModel).where(
            VoteModel.poll_id == poll.id,
            VoteModel.user_id == user.id,
        )
    ).all()
    # Build a lookup of the user's own session votes
    user_session_votes = {v.target_id: v.vote_value for v in user_votes if v.target_type == "session"}
    user_event_votes = {v.target_id: v.vote_value for v in user_votes if v.target_type == "event"}

    # Get all sessions in this poll to match event+session pairs
    all_sessions = db.exec(
        select(ShowSession).where(ShowSession.poll_id == poll.id, ShowSession.is_included == True)
    ).all()

    personal_pick_keys = {
        f"{s.event_id}:{s.id}"
        for s in all_sessions
        if user_session_votes.get(s.id) == "can_do"
        and user_event_votes.get(s.event_id, "yes") != "no"
    }

    # Distinguish the two empty states:
    #   has_any_votes=False              → no one has voted yet
    #   has_any_votes=True + no_valid_options=True → votes exist but no valid combination
    has_any_votes = participation["fully_voted_count"] > 0

    def _ser_result(r: dict) -> dict:
        return {
            "rank": r["rank"],
            "score": r["score"],
            "event": {"id": r["event"].id, "title": r["event"].title, "is_movie": r["event"].is_movie(), "venue_name": getattr(r["event"], "venue_name", None), "booking_url": getattr(r["event"], "booking_url", None), "event_type": getattr(r["event"], "event_type", "movie")},
            "session": {
                "id": r["session"].id,
                "session_date": r["session"].session_date,
                "session_time": r["session"].session_time,
                "format": r["session"].format,
                "theater_id": r["session"].theater_id,
                "theater_name": theater_map.get(r["session"].theater_id, ""),
                "booking_url": r["session"].booking_url,
            },
            "voter_names": [v["user"].name for v in r.get("supporters", [])],
            "voter_count": len(r.get("supporters", [])),
        }

    prefs = vote_service.get_user_poll_preferences(user.id, poll.id, db)

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
        "results": [_ser_result(r) for r in results["ranked"][:5]],
        "no_valid_options": results["no_valid_options"],
        "has_any_votes": has_any_votes,
        "personal_pick_keys": list(personal_pick_keys),
        "is_participating": bool(prefs.get("is_participating")),
    }


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "group_id": user.group_id,
    }


def _serialize_poll(poll: Poll) -> dict:
    return {
        "id": poll.id,
        "title": poll.title,
        "status": poll.status,
        "access_uuid": poll.access_uuid,
        "voting_closes_at": poll.voting_closes_at,
        "description": poll.description,
        "group_id": poll.group_id,
    }


def _serialize_votes(user_votes: dict) -> dict:
    """Convert {('event'|'session', id): value} to {'event:123': 'yes'} for JSON."""
    return {
        f"{target_type}:{target_id}": value
        for (target_type, target_id), value in user_votes.items()
    }


def _serialize_session(s, theater_name: str) -> dict:
    return {
        "id": s.id,
        "event_id": s.event_id,
        "theater_id": s.theater_id,
        "theater_name": theater_name,
        "session_date": s.session_date,
        "session_time": s.session_time,
        "format": s.format,
        "booking_url": s.booking_url,
    }


def _serialize_event(event) -> dict:
    import json as _json
    genres = []
    if event.genres:
        try:
            genres = _json.loads(event.genres)
        except Exception:
            genres = []
    return {
        "id": event.id,
        "title": event.title,
        "year": event.year,
        "synopsis": event.synopsis,
        "poster_path": event.poster_path,
        "trailer_key": event.trailer_key,
        "tmdb_rating": event.tmdb_rating,
        "runtime_mins": event.runtime_mins,
        "rating": event.rating,
        "genres": genres,
        "poster_url": movie_service.poster_url(event.poster_path) if event.poster_path else None,
        "event_type": getattr(event, "event_type", "movie"),
        "is_movie": event.is_movie(),
        "image_url": getattr(event, "image_url", None),
        "external_url": getattr(event, "external_url", None),
        "booking_url": getattr(event, "booking_url", None),
        "venue_name": getattr(event, "venue_name", None),
    }


@router.get("/api/voter/me")
async def voter_me(request: Request, db: Session = Depends(get_db)):
    """React SPA bootstrap endpoint. Returns full voter state on mount.
    Works in browse mode (no PIN) — user will be None, state='browse'.
    """
    user = get_current_user_optional(request, db)
    is_browse = user is None and _get_browse_poll_id(request) is not None

    if not user and not is_browse:
        raise HTTPException(status_code=401, detail="Not authenticated")

    poll = _get_voter_poll_for_request(request, ["OPEN", "CLOSED"], db)
    if not poll:
        if user:
            return {
                "user": _serialize_user(user),
                "poll": None,
                "state": "no_active_poll",
                "preferences": {},
                "votes": {},
                "yes_movie_count": 0,
                "voted_session_count": 0,
                "events": [],
                "is_secure_entry": False,
                "is_browse": False,
                "join_url": None,
            }
        raise HTTPException(status_code=404, detail="No active poll")

    events = movie_service.get_poll_events(poll.id, db)
    sessions = showtime_service.get_sessions_for_poll(poll.id, db)
    theater_map = {t.id: t.name for t in theater_service.get_all_theaters(db)}
    join_url = f"/join/{poll.access_uuid}/enter" if poll.access_uuid else None

    if is_browse:
        return {
            "user": None,
            "poll": _serialize_poll(poll),
            "state": "browse",
            "preferences": {},
            "votes": {},
            "yes_movie_count": 0,
            "voted_session_count": 0,
            "events": [_serialize_event(e) for e in events],
            "sessions": [_serialize_session(s, theater_map.get(s.theater_id, "")) for s in sessions if s.is_included],
            "is_secure_entry": False,
            "is_browse": True,
            "join_url": join_url,
        }

    prefs = vote_service.get_user_poll_preferences(user.id, poll.id, db)
    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    yes_movie_count = vote_service.get_yes_movie_count(user.id, poll.id, db)
    voted_session_count = sum(
        1 for (tt, _), v in user_votes.items() if tt == "session" and v == "can_do"
    )

    return {
        "user": _serialize_user(user),
        "poll": _serialize_poll(poll),
        "state": "active",
        "preferences": prefs,
        "votes": _serialize_votes(user_votes),
        "yes_movie_count": yes_movie_count,
        "voted_session_count": voted_session_count,
        "events": [_serialize_event(e) for e in events],
        "sessions": [_serialize_session(s, theater_map.get(s.theater_id, "")) for s in sessions if s.is_included],
        "is_secure_entry": is_secure_entry(request),
        "is_browse": False,
        "join_url": join_url,
    }


@router.post("/api/voter/votes/movie")
async def voter_vote_movie(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    body = await request.json()
    event_id = body.get("event_id")
    vote_value = body.get("vote")
    veto_reason = body.get("veto_reason")

    if vote_value not in ("yes", "no", "abstain"):
        raise HTTPException(status_code=400, detail="Invalid vote value")

    vote_service.cast_vote(user.id, poll.id, "event", event_id, vote_value, db, veto_reason=veto_reason)
    yes_movie_count = vote_service.get_yes_movie_count(user.id, poll.id, db)

    return {"status": "ok", "vote": vote_value, "yes_movie_count": yes_movie_count}


@router.post("/api/voter/votes/session")
async def voter_vote_session(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    body = await request.json()
    session_id = body.get("session_id")
    vote_value = body.get("vote")

    if vote_value not in ("can_do", "cant_do", "abstain"):
        raise HTTPException(status_code=400, detail="Invalid vote value")

    vote_service.cast_vote(user.id, poll.id, "session", session_id, vote_value, db)
    user_votes = vote_service.get_user_votes(user.id, poll.id, db)
    voted_session_count = sum(
        1 for (tt, _), v in user_votes.items() if tt == "session" and v == "can_do"
    )

    return {"status": "ok", "vote": vote_value, "voted_session_count": voted_session_count}


@router.post("/api/voter/votes/flexible")
async def voter_vote_flexible(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    body = await request.json()
    is_flexible = bool(body.get("is_flexible", False))
    vote_service.set_flexible(user.id, poll.id, is_flexible, db)

    return {"status": "ok", "is_flexible": is_flexible}


@router.post("/api/voter/votes/complete")
async def voter_vote_complete(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    body = await request.json()
    is_complete = bool(body.get("is_complete", True))
    vote_service.mark_voting_complete(user.id, poll.id, is_complete, db)

    prefs = vote_service.get_user_poll_preferences(user.id, poll.id, db)
    return {"status": "ok", "is_complete": is_complete, "preferences": prefs}


@router.post("/api/voter/votes/participation")
async def voter_vote_participation(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    poll = _get_voter_poll_for_request(request, ["OPEN"], db)
    if not poll:
        raise HTTPException(status_code=403, detail="No open poll")

    body = await request.json()
    is_participating = bool(body.get("is_participating", True))
    opt_out_reason = body.get("opt_out_reason")
    vote_service.set_participating(user.id, poll.id, is_participating, db, opt_out_reason=opt_out_reason)

    prefs = vote_service.get_user_poll_preferences(user.id, poll.id, db)
    return {"status": "ok", "is_participating": is_participating, "preferences": prefs}


# ─── Admin: Movies ────────────────────────────────────────────────────────────

@router.get("/api/admin/movies/search", response_class=HTMLResponse)
async def admin_search_movies(
    request: Request,
    q: str,
    poll_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query required")

    try:
        results = await movie_service.search_tmdb(q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"TMDB error: {exc}")

    return templates.TemplateResponse(
        request,
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
    verify_admin(request, db)
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
    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    event_ids_with_sessions = {s.event_id for s in sessions}
    
    return templates.TemplateResponse(
        request,
        "components/admin_movie_list.html",
        {
            "request": request,
            "events": events,
            "poll": poll,
            "poster_url": movie_service.poster_url,
            "event_ids_with_sessions": event_ids_with_sessions,
        },
    )


@router.delete("/api/admin/polls/{poll_id}/movies/{event_id}", response_class=HTMLResponse)
async def admin_remove_movie(
    request: Request,
    poll_id: int,
    event_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    try:
        movie_service.remove_movie_from_poll(poll_id, event_id, db)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    events = movie_service.get_poll_events(poll_id, db)
    poll = db.get(Poll, poll_id)
    return templates.TemplateResponse(
        request,
        "components/admin_movie_list.html",
        {
            "request": request,
            "events": events,
            "poll": poll,
            "poster_url": movie_service.poster_url,
        },
    )


# ─── Admin: Manual Event Entry ────────────────────────────────────────────────

@router.post("/api/admin/polls/{poll_id}/events/manual")
async def admin_add_manual_event(
    request: Request,
    poll_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    body = await request.json()
    title = (body.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    from app.models import PollEvent as PollEventModel
    event = EventModel(
        title=title,
        event_type=body.get("event_type", "other"),
        synopsis=body.get("description") or None,
        image_url=body.get("image_url") or None,
        external_url=body.get("external_url") or None,
        venue_name=body.get("venue_name") or None,
        is_custom_event=True,
    )
    db.add(event)
    db.flush()

    sort_order = len(movie_service.get_poll_events(poll_id, db))
    link = PollEventModel(poll_id=poll_id, event_id=event.id, sort_order=sort_order)
    db.add(link)
    db.commit()
    db.refresh(event)

    return {"status": "ok", "event": _serialize_event(event)}


@router.patch("/api/admin/events/{event_id}")
async def admin_update_event(request: Request, event_id: int, db: Session = Depends(get_db)):
    verify_admin(request, db)
    event = db.get(EventModel, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    if not event.is_custom_event:
        raise HTTPException(status_code=403, detail="TMDB events are read-only")
    body = await request.json()
    if "title" in body and body["title"].strip():
        event.title = body["title"].strip()
    if "event_type" in body:
        event.event_type = body["event_type"]
    if "venue_name" in body:
        event.venue_name = body["venue_name"] or None
    if "description" in body:
        event.synopsis = body["description"] or None
    if "image_url" in body:
        event.image_url = body["image_url"] or None
    if "external_url" in body:
        event.external_url = body["external_url"] or None
    if "booking_url" in body:
        event.booking_url = body["booking_url"] or None
    db.add(event)
    db.commit()
    db.refresh(event)
    return {"status": "ok", "event": _serialize_event(event)}


@router.post("/api/admin/events/lookup")
async def admin_lookup_event(request: Request, db: Session = Depends(get_db)):
    verify_admin(request, db)
    from app.config import settings as _s
    import httpx as _httpx
    if not _s.GOOGLE_KG_API_KEY:
        raise HTTPException(status_code=503, detail="Google KG key not configured")
    body = await request.json()
    title = (body.get("title") or "").strip()
    venue_name = (body.get("venue_name") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title required")
    query = f"{title} {venue_name}".strip()
    try:
        async with _httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                "https://kgsearch.googleapis.com/v1/entities:search",
                params={
                    "query": query,
                    "key": _s.GOOGLE_KG_API_KEY,
                    "limit": 3,
                },
            )
            r.raise_for_status()
            data = r.json()
    except Exception as exc:
        return {"image_url": None, "website_url": None, "error": str(exc)}
    image_url = None
    website_url = None
    for item in data.get("itemListElement", []):
        result = item.get("result", {})
        if not image_url:
            image_url = (result.get("image") or {}).get("contentUrl") or None
        if not website_url:
            website_url = (result.get("detailedDescription") or {}).get("url") or result.get("url") or None
        if image_url and website_url:
            break
    return {"image_url": image_url, "website_url": website_url}


# ─── Admin: Showtimes ─────────────────────────────────────────────────────────

@router.post("/api/admin/showtimes/fetch")
async def admin_fetch_showtimes(
    request: Request,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    body = await request.json()
    poll_id = body.get("poll_id")
    theater_ids = body.get("theater_ids", [])
    dates = body.get("dates", [])
    event_ids = body.get("event_ids", None)  # None means all movies

    if not poll_id or not theater_ids or not dates:
        raise HTTPException(status_code=400, detail="poll_id, theater_ids, and dates required")

    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    job_id = create_fetch_job(poll_id, theater_ids, dates, db, event_ids)
    asyncio.create_task(run_fetch_job(job_id, poll_id, theater_ids, dates, event_ids))

    return JSONResponse(
        {"job_id": job_id, "total_tasks": len(theater_ids) * len(dates)},
        status_code=202,
    )


@router.post("/api/admin/showtimes", response_class=HTMLResponse)
async def admin_add_manual_showtime(
    request: Request,
    poll_id: int = Form(...),
    event_id: int = Form(...),
    theater_id: Optional[int] = Form(None),
    venue_override: Optional[str] = Form(None),
    session_date: str = Form(...),
    session_time: str = Form(...),
    format: str = Form("Standard"),
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    try:
        showtime_service.add_manual_session(
            poll_id, event_id, theater_id, session_date, session_time, format, db
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    poll = db.get(Poll, poll_id)
    theaters_list = theater_service.get_active_theaters(db)
    theater_map = {t.id: t for t in theater_service.get_all_theaters(db)}
    ev = db.get(EventModel, event_id)
    target_dates = [pd.date for pd in db.exec(select(PollDate).where(PollDate.poll_id == poll_id)).all()]

    return templates.TemplateResponse(
        request,
        "components/admin_event_section.html",
        {
            "request": request,
            "ev": ev,
            "sessions": sessions,
            "poll": poll,
            "theaters": theaters_list,
            "theater_map": theater_map,
            "target_dates": target_dates,
            "poster_url": movie_service.poster_url,
        },
    )


@router.delete("/api/admin/showtimes/{session_id}", response_class=HTMLResponse)
async def admin_delete_showtime(
    request: Request,
    session_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    session_obj = db.get(ShowSession, session_id)
    if not session_obj:
        raise HTTPException(status_code=404, detail="Session not found")
    poll_id = session_obj.poll_id
    event_id = session_obj.event_id
    try:
        showtime_service.delete_session(session_id, db)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    poll = db.get(Poll, poll_id)
    theaters_list = theater_service.get_active_theaters(db)
    theater_map = {t.id: t for t in theater_service.get_all_theaters(db)}
    ev = db.get(EventModel, event_id)
    target_dates = [pd.date for pd in db.exec(select(PollDate).where(PollDate.poll_id == poll_id)).all()]

    return templates.TemplateResponse(
        request,
        "components/admin_event_section.html",
        {
            "request": request,
            "ev": ev,
            "sessions": sessions,
            "poll": poll,
            "theaters": theaters_list,
            "theater_map": theater_map,
            "target_dates": target_dates,
            "poster_url": movie_service.poster_url,
        },
    )


@router.get("/api/admin/theaters/search")
async def admin_search_theaters(request: Request, q: str = "", db: Session = Depends(get_db)):
    verify_admin(request, db)
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
    verify_admin(request, db)
    body = await request.json()
    name = body.get("name", "").strip()
    address = body.get("address", "")
    website_url = body.get("website_url", "").strip() or None
    serpapi_query = body.get("serpapi_query", "").strip()
    showtime_url_pattern = body.get("showtime_url_pattern", "").strip() or None
    if not name or not serpapi_query:
        raise HTTPException(status_code=400, detail="name and serpapi_query required")
    t = theater_service.add_theater(name, address, website_url, serpapi_query, db, showtime_url_pattern=showtime_url_pattern)
    return JSONResponse(
        {"id": t.id, "name": t.name, "address": t.address, "website_url": t.website_url, "is_active": t.is_active},
        status_code=201,
    )


@router.delete("/api/admin/theaters/{theater_id}")
async def admin_delete_theater(
    request: Request,
    theater_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
    theater = db.get(VenueModel, theater_id)
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
    verify_admin(request, db)
    body = await request.json()
    try:
        t = theater_service.update_theater(
            theater_id,
            name=body.get("name"),
            address=body.get("address"),
            website_url=body.get("website_url"),
            serpapi_query=body.get("serpapi_query"),
            showtime_url_pattern=body.get("showtime_url_pattern"),
            is_active=body.get("is_active"),
            db=db,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"id": t.id, "name": t.name, "address": t.address, "website_url": t.website_url, "is_active": t.is_active}


# ─── Admin: Sessions visibility ──────────────────────────────────────────────

@router.patch("/api/admin/sessions/{session_id}/visibility")
async def admin_toggle_session_visibility(
    request: Request,
    session_id: int,
    db: Session = Depends(get_db),
):
    verify_admin(request, db)
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
    verify_admin(request, db)
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
    verify_admin(request, db)
    groups = db.exec(select(Group)).all()
    return [{"id": g.id, "name": g.name} for g in groups]


@router.post("/api/admin/groups")
async def admin_create_group(request: Request, db: Session = Depends(get_db)):
    verify_admin(request, db)
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
    verify_admin(request, db)
    g = db.get(Group, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")

@router.get("/api/admin/users")
async def admin_list_users(request: Request, db: Session = Depends(get_db)):
    verify_admin(request, db)
    users = db.exec(select(User).order_by(User.id)).all()
    groups = {g.id: g.name for g in db.exec(select(Group)).all()}
    all_ug = db.exec(select(UserGroup)).all()
    user_group_ids: dict[int, list[int]] = {}
    for ug in all_ug:
        user_group_ids.setdefault(ug.user_id, []).append(ug.group_id)
    return [
        {
            "id": u.id, "name": u.name, "email": u.email,
            "is_admin": u.is_admin, "group_id": u.group_id,
            "member_pin": u.member_pin,
            "group_name": groups.get(u.group_id) if u.group_id else None,
            "group_ids": user_group_ids.get(u.id, []),
            "group_names": [groups[gid] for gid in user_group_ids.get(u.id, []) if gid in groups],
        }
        for u in users
    ]


@router.post("/api/admin/users")
async def admin_create_user(request: Request, db: Session = Depends(get_db)):
    verify_admin(request, db)
    body = await request.json()
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name required")
    role = body.get("role", "voter")
    if role not in ("voter", "admin"):
        raise HTTPException(status_code=400, detail="role must be 'voter' or 'admin'")
    raw_pin = body.get("member_pin")
    member_pin = None
    if raw_pin in (None, ""):
        member_pin = generate_member_pin(db)
    else:
        try:
            member_pin = normalize_member_pin(raw_pin)
            ensure_unique_member_pin(db, member_pin)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    group_ids = body.get("group_ids") or ([body["group_id"]] if body.get("group_id") else [])
    primary_group_id = group_ids[0] if group_ids else None
    u = User(
        name=name,
        email=body.get("email") or None,
        role=role,
        group_id=primary_group_id,
        member_pin=member_pin,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    for gid in group_ids:
        db.add(UserGroup(user_id=u.id, group_id=int(gid)))
    db.commit()
    return JSONResponse({"id": u.id, "name": u.name, "member_pin": u.member_pin}, status_code=201)


@router.patch("/api/admin/users/{user_id}")
async def admin_update_user(request: Request, user_id: int, db: Session = Depends(get_db)):
    verify_admin(request, db)
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    body = await request.json()
    if "name" in body and body["name"].strip():
        u.name = body["name"].strip()
    if "email" in body:
        u.email = body["email"] or None
    if "group_ids" in body:
        new_gids = [int(x) for x in body["group_ids"]]
        u.group_id = new_gids[0] if new_gids else None
        existing = db.exec(select(UserGroup).where(UserGroup.user_id == user_id)).all()
        existing_gids = {ug.group_id for ug in existing}
        for ug in existing:
            if ug.group_id not in new_gids:
                db.delete(ug)
        for gid in new_gids:
            if gid not in existing_gids:
                db.add(UserGroup(user_id=user_id, group_id=gid))
        db.commit()
    elif "group_id" in body:
        u.group_id = body["group_id"] or None
    if "role" in body:
        role = body["role"]
        if role not in ("voter", "admin"):
            raise HTTPException(status_code=400, detail="role must be 'voter' or 'admin'")
        u.role = role
    if "member_pin" in body:
        raw_pin = body.get("member_pin")
        if raw_pin in (None, ""):
            u.member_pin = generate_member_pin(db)
        else:
            try:
                normalized = normalize_member_pin(raw_pin)
                ensure_unique_member_pin(db, normalized, exclude_user_id=user_id)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
            u.member_pin = normalized
    db.add(u)
    db.commit()
    all_ug = db.exec(select(UserGroup).where(UserGroup.user_id == user_id)).all()
    return {"id": u.id, "name": u.name, "email": u.email, "group_id": u.group_id, "member_pin": u.member_pin, "group_ids": [ug.group_id for ug in all_ug]}


@router.put("/api/admin/users/{user_id}/groups")
async def admin_set_user_groups(request: Request, user_id: int, db: Session = Depends(get_db)):
    verify_admin(request, db)
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    body = await request.json()
    new_gids = [int(x) for x in body.get("group_ids", [])]
    existing = db.exec(select(UserGroup).where(UserGroup.user_id == user_id)).all()
    existing_gids = {ug.group_id for ug in existing}
    for ug in existing:
        if ug.group_id not in new_gids:
            db.delete(ug)
    for gid in new_gids:
        if gid not in existing_gids:
            db.add(UserGroup(user_id=user_id, group_id=gid))
    u.group_id = new_gids[0] if new_gids else None
    db.add(u)
    db.commit()
    return {"user_id": user_id, "group_ids": new_gids}


@router.delete("/api/admin/users/{user_id}")
async def admin_delete_user(request: Request, user_id: int, db: Session = Depends(get_db)):
    verify_admin(request, db)
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.role == "admin":
        raise HTTPException(status_code=403, detail="Cannot delete admin user")
    db.delete(u)
    db.commit()
    return {"deleted": user_id}

# ─── Admin: Polls ─────────────────────────────────────────────────────────────

@router.post("/api/admin/polls")
async def admin_create_poll(request: Request, db: Session = Depends(get_db)):
    verify_admin(request, db)
    body = await request.json()
    title = body.get("title", "").strip()
    target_dates = body.get("target_dates", [])
    group_ids = body.get("group_ids") or ([body["group_id"]] if body.get("group_id") else [])
    primary_group_id = group_ids[0] if group_ids else None
    if not title or not target_dates:
        raise HTTPException(status_code=400, detail="title and target_dates required")

    poll = Poll(
        title=title,
        status="DRAFT",
        group_id=primary_group_id,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(poll)
    db.commit()
    db.refresh(poll)
    for date in target_dates:
        db.add(PollDate(poll_id=poll.id, date=date))
    for gid in group_ids:
        db.add(PollGroup(poll_id=poll.id, group_id=int(gid)))
    db.commit()
    return JSONResponse(
        {
            "id": poll.id,
            "title": poll.title,
            "status": poll.status,
            "target_dates": target_dates,
        },
        status_code=201,
    )


@router.patch("/api/admin/polls/{poll_id}")
async def admin_update_poll(request: Request, poll_id: int, db: Session = Depends(get_db)):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    body = await request.json()
    if "group_ids" in body:
        new_gids = [int(x) for x in body["group_ids"]]
        poll.group_id = new_gids[0] if new_gids else None
        existing = db.exec(select(PollGroup).where(PollGroup.poll_id == poll_id)).all()
        existing_gids = {pg.group_id for pg in existing}
        for pg in existing:
            if pg.group_id not in new_gids:
                db.delete(pg)
        for gid in new_gids:
            if gid not in existing_gids:
                db.add(PollGroup(poll_id=poll_id, group_id=gid))
        db.commit()
    elif "group_id" in body:
        poll.group_id = body["group_id"] or None
    if "title" in body and body["title"].strip():
        poll.title = body["title"].strip()
    if "dates" in body:
        new_dates = [d for d in body["dates"] if d]
        existing_dates = db.exec(select(PollDate).where(PollDate.poll_id == poll_id)).all()
        for pd in existing_dates:
            db.delete(pd)
        for d in new_dates:
            db.add(PollDate(poll_id=poll_id, date=d))
    poll.updated_at = datetime.now(timezone.utc).isoformat()
    db.add(poll)
    db.commit()
    all_pg = db.exec(select(PollGroup).where(PollGroup.poll_id == poll_id)).all()
    all_dates = db.exec(select(PollDate).where(PollDate.poll_id == poll_id)).all()
    return {"id": poll.id, "title": poll.title, "group_id": poll.group_id, "group_ids": [pg.group_id for pg in all_pg], "dates": [pd.date for pd in all_dates]}


@router.put("/api/admin/polls/{poll_id}/groups")
async def admin_set_poll_groups(request: Request, poll_id: int, db: Session = Depends(get_db)):
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    body = await request.json()
    new_gids = [int(x) for x in body.get("group_ids", [])]
    existing = db.exec(select(PollGroup).where(PollGroup.poll_id == poll_id)).all()
    existing_gids = {pg.group_id for pg in existing}
    for pg in existing:
        if pg.group_id not in new_gids:
            db.delete(pg)
    for gid in new_gids:
        if gid not in existing_gids:
            db.add(PollGroup(poll_id=poll_id, group_id=gid))
    poll.group_id = new_gids[0] if new_gids else None
    return {"poll_id": poll_id, "group_ids": new_gids}


@router.post("/api/admin/polls/{poll_id}/publish")
async def admin_publish_poll(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    verify_admin(request, db)
    from app.models import UserGroup, PollGroup
    from app.services import email_service
    from app.services.security_service import build_poll_invite_url, ensure_poll_access_uuid

    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    events = movie_service.get_poll_events(poll_id, db)
    sessions = showtime_service.get_sessions_for_poll(poll_id, db)
    if not events or not sessions:
        raise HTTPException(status_code=422, detail="Poll needs movies and showtimes before publishing")

    poll.status = "OPEN"
    poll.updated_at = datetime.now(timezone.utc).isoformat()
    db.add(poll)
    db.commit()
    ensure_poll_access_uuid(poll, db)

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    should_email = bool(body.get("send_email", True))

    emails_sent = 0
    if should_email:
        invite_url = build_poll_invite_url(poll, db)
        poll_group_ids = {pg.group_id for pg in db.exec(select(PollGroup).where(PollGroup.poll_id == poll_id)).all()}
        if poll_group_ids:
            member_ids = {ug.user_id for ug in db.exec(select(UserGroup).where(UserGroup.group_id.in_(poll_group_ids))).all()}
            members = db.exec(select(User).where(User.id.in_(member_ids), User.role != "admin")).all()
        else:
            members = db.exec(select(User).where(User.role != "admin")).all()
        for member in members:
            if member.email:
                sent = email_service.send_poll_invite(
                    to_address=member.email,
                    voter_name=member.name,
                    poll_title=poll.title,
                    invite_url=invite_url,
                )
                if sent:
                    emails_sent += 1

    return {"id": poll.id, "status": poll.status, "emails_sent": emails_sent}


@router.post("/api/admin/polls/{poll_id}/send-email")
async def admin_send_poll_email(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    """Send the poll invite email to selected user IDs (or all members if none given)."""
    verify_admin(request, db)
    from app.models import UserGroup, PollGroup
    from app.services import email_service
    from app.services.security_service import build_poll_invite_url

    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if poll.status != "OPEN":
        raise HTTPException(status_code=422, detail="Poll must be open to send invites")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    user_ids = body.get("user_ids")

    invite_url = build_poll_invite_url(poll, db)

    if user_ids:
        members = db.exec(select(User).where(User.id.in_(user_ids), User.role != "admin")).all()
    else:
        poll_group_ids = {pg.group_id for pg in db.exec(select(PollGroup).where(PollGroup.poll_id == poll_id)).all()}
        if poll_group_ids:
            member_ids = {ug.user_id for ug in db.exec(select(UserGroup).where(UserGroup.group_id.in_(poll_group_ids))).all()}
            members = db.exec(select(User).where(User.id.in_(member_ids), User.role != "admin")).all()
        else:
            members = db.exec(select(User).where(User.role != "admin")).all()

    from app.config import settings as _s
    smtp_ok = bool(_s.SMTP_USER and _s.SMTP_PASSWORD and _s.SMTP_HOST)

    emails_sent = 0
    for member in members:
        if member.email:
            sent = email_service.send_poll_invite(
                to_address=member.email,
                voter_name=member.name,
                poll_title=poll.title,
                invite_url=invite_url,
            )
            if sent:
                emails_sent += 1

    return {"ok": True, "emails_sent": emails_sent, "smtp_configured": smtp_ok}


@router.post("/api/admin/polls/{poll_id}/invite-link")
async def admin_get_invite_link(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    """Return (or create) the current invite link for an OPEN poll."""
    verify_admin(request, db)
    from app.services.security_service import build_poll_invite_url, ensure_poll_access_uuid
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if poll.status != "OPEN":
        raise HTTPException(status_code=400, detail="Invite links are only available for OPEN polls")
    ensure_poll_access_uuid(poll, db)
    invite_url = build_poll_invite_url(poll, db)
    return {"poll_id": poll.id, "access_uuid": poll.access_uuid, "invite_url": invite_url}


@router.post("/api/admin/polls/{poll_id}/regenerate-invite")
async def admin_regenerate_invite(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    """Generate a new access_uuid, invalidating the old invite link."""
    verify_admin(request, db)
    import uuid as _uuid
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    poll.access_uuid = str(_uuid.uuid4())
    poll.updated_at = datetime.now(timezone.utc).isoformat()
    db.add(poll)
    db.commit()
    db.refresh(poll)
    from app.services.security_service import build_poll_invite_url
    invite_url = build_poll_invite_url(poll, db)
    return {"poll_id": poll.id, "access_uuid": poll.access_uuid, "invite_url": invite_url}


@router.post("/api/admin/polls/{poll_id}/close")
async def admin_close_poll(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    verify_admin(request, db)
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
    verify_admin(request, db)
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

    theater = db.get(VenueModel, session.theater_id)
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
    verify_admin(request, db)
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
    """Reopen a closed poll — resets winner and changes status back to OPEN."""
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    if poll.status not in ["CLOSED", "ARCHIVED"]:
        raise HTTPException(status_code=400, detail="Can only reopen CLOSED or ARCHIVED polls")

    poll.winner_event_id = None
    poll.winner_session_id = None
    poll.status = "OPEN"
    poll.updated_at = datetime.now(timezone.utc).isoformat()
    db.add(poll)
    db.commit()
    return {"id": poll.id, "status": poll.status}


@router.post("/api/admin/polls/{poll_id}/clear-votes")
async def admin_clear_votes(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    """Delete all votes and reset all UserPollPreferences for this poll.
    Optionally email participating voters to re-vote (send_email: true in body)."""
    verify_admin(request, db)
    from app.models import Vote, UserPollPreference
    from app.services import email_service
    from app.services.security_service import build_poll_invite_url

    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    should_email = bool(body.get("send_email", False))

    prefs = db.exec(select(UserPollPreference).where(UserPollPreference.poll_id == poll_id)).all()
    submitted_prefs = [p for p in prefs if p.is_participating and p.has_completed_voting]
    submitted_user_ids = {p.user_id for p in submitted_prefs}
    participating_user_ids = {p.user_id for p in prefs if p.is_participating}

    votes = db.exec(select(Vote).where(Vote.poll_id == poll_id)).all()
    for v in votes:
        if v.user_id in submitted_user_ids:
            db.delete(v)

    for pref in submitted_prefs:
        pref.has_completed_voting = False
        pref.is_flexible = False
        db.add(pref)

    db.commit()

    emails_sent = 0
    if should_email and participating_user_ids:
        invite_url = build_poll_invite_url(poll, db)
        users_to_notify = db.exec(
            select(User).where(User.id.in_(participating_user_ids))
        ).all()
        for user in users_to_notify:
            if user.email:
                sent = email_service.send_revote_notification(
                    to_address=user.email,
                    voter_name=user.name,
                    poll_title=poll.title,
                    invite_url=invite_url,
                )
                if sent:
                    emails_sent += 1

    return {"ok": True, "votes_cleared": len(votes), "emails_sent": emails_sent}


@router.post("/api/admin/polls/{poll_id}/duplicate")
async def admin_duplicate_poll(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    """Create a copy of an existing poll (title, groups, dates, movies — no votes/sessions)."""
    verify_admin(request, db)
    from app.models import PollEvent, PollDate, PollGroup
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    new_poll = Poll(
        title=f"{poll.title} (copy)",
        status="DRAFT",
        group_id=poll.group_id,
        description=poll.description,
        updated_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(new_poll)
    db.commit()
    db.refresh(new_poll)

    for pd in db.exec(select(PollDate).where(PollDate.poll_id == poll_id)).all():
        db.add(PollDate(poll_id=new_poll.id, date=pd.date))
    for pg in db.exec(select(PollGroup).where(PollGroup.poll_id == poll_id)).all():
        db.add(PollGroup(poll_id=new_poll.id, group_id=pg.group_id))
    for pe in db.exec(select(PollEvent).where(PollEvent.poll_id == poll_id)).all():
        db.add(PollEvent(poll_id=new_poll.id, event_id=pe.event_id, sort_order=pe.sort_order))
    db.commit()

    return {"id": new_poll.id, "title": new_poll.title, "status": new_poll.status}


@router.get("/api/admin/polls/{poll_id}/voter-breakdown")
async def admin_voter_breakdown(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    """Return each voter's individual session selections for this poll."""
    verify_admin(request, db)
    from app.models import Vote, UserPollPreference, Showtime, Event, PollEvent, PollGroup, UserGroup
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    # Get eligible users (reuse existing helper)
    users = vote_service._get_poll_group_users(poll_id, db)

    sessions = db.exec(
        select(ShowSession).where(ShowSession.poll_id == poll_id, ShowSession.is_included == True)
    ).all()
    session_map = {s.id: s for s in sessions}

    event_ids = list({s.event_id for s in sessions})
    events = db.exec(select(EventModel).where(EventModel.id.in_(event_ids))).all() if event_ids else []
    event_map = {e.id: e for e in events}

    theater_ids = list({s.theater_id for s in sessions})
    theaters = db.exec(select(VenueModel).where(VenueModel.id.in_(theater_ids))).all() if theater_ids else []
    theater_map = {t.id: t.name for t in theaters}

    result = []
    for user in users:
        pref = db.exec(
            select(UserPollPreference).where(
                UserPollPreference.user_id == user.id,
                UserPollPreference.poll_id == poll_id,
            )
        ).first()
        is_flexible = pref.is_flexible if pref else False
        is_participating = pref.is_participating if pref else False
        has_completed = pref.has_completed_voting if pref else False

        votes = db.exec(
            select(Vote).where(
                Vote.user_id == user.id,
                Vote.poll_id == poll_id,
                Vote.target_type == "session",
            )
        ).all()
        vote_map = {v.target_id: v.vote_value for v in votes}

        picks = []
        for s in sessions:
            vote_val = vote_map.get(s.id, "abstain")
            if vote_val == "can_do":
                event = event_map.get(s.event_id)
                picks.append({
                    "session_id": s.id,
                    "event_title": event.title if event else "?",
                    "session_date": s.session_date,
                    "session_time": s.session_time,
                    "theater_name": theater_map.get(s.theater_id, "?"),
                    "format": s.format,
                })

        result.append({
            "user_id": user.id,
            "name": user.name,
            "is_participating": is_participating,
            "is_flexible": is_flexible,
            "has_completed_voting": has_completed,
            "picks": picks,
        })

    return {"poll_id": poll_id, "voters": result}


@router.delete("/api/admin/polls/{poll_id}")
async def admin_delete_poll(
    request: Request, poll_id: int, db: Session = Depends(get_db)
):
    """Permanently delete a poll and all related data (votes, sessions, etc.)."""
    verify_admin(request, db)
    poll = db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")

    from app.models import Vote, PollEvent, UserPollPreference

    poll_dates = db.exec(select(PollDate).where(PollDate.poll_id == poll_id)).all()
    for pd in poll_dates:
        db.delete(pd)

    fetch_jobs = db.exec(select(FetchJob).where(FetchJob.poll_id == poll_id)).all()
    for job in fetch_jobs:
        db.delete(job)

    votes = db.exec(select(Vote).where(Vote.poll_id == poll_id)).all()
    for vote in votes:
        db.delete(vote)

    poll_events = db.exec(select(PollEvent).where(PollEvent.poll_id == poll_id)).all()
    for pe in poll_events:
        db.delete(pe)

    sessions = db.exec(select(ShowSession).where(ShowSession.poll_id == poll_id)).all()
    for session in sessions:
        db.delete(session)

    prefs = db.exec(select(UserPollPreference).where(UserPollPreference.poll_id == poll_id)).all()
    for pref in prefs:
        db.delete(pref)

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
    verify_admin(request, db)
    job = db.get(FetchJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    response = templates.TemplateResponse(
        request,
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
    verify_admin(request, db)
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


# ─── Voter: Event reviews ─────────────────────────────────────────────────────

@router.get("/api/voter/events/{event_id}/reviews")
async def voter_event_reviews(request: Request, event_id: int, db: Session = Depends(get_db)):
    from app.middleware.identity import get_current_user_optional
    user = get_current_user_optional(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    event = db.get(EventModel, event_id)
    if not event or not event.tmdb_id:
        return {"reviews": []}

    reviews = await movie_service.fetch_tmdb_reviews(event.tmdb_id)
    return {"reviews": reviews}