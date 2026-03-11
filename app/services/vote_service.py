from datetime import datetime, timezone
from sqlmodel import Session, select

from app.models import (
    User, Vote, UserPollPreference, Poll, PollEvent,
    Session as ShowSession, Event,
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def cast_vote(
    user_id: int,
    poll_id: int,
    target_type: str,
    target_id: int,
    vote_value: str,
    db: Session,
) -> Vote:
    existing = db.exec(
        select(Vote).where(
            Vote.user_id == user_id,
            Vote.poll_id == poll_id,
            Vote.target_type == target_type,
            Vote.target_id == target_id,
        )
    ).first()

    now = _now()
    if existing:
        existing.vote_value = vote_value
        existing.updated_at = now
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    vote = Vote(
        user_id=user_id,
        poll_id=poll_id,
        target_type=target_type,
        target_id=target_id,
        vote_value=vote_value,
        voted_at=now,
        updated_at=now,
    )
    db.add(vote)
    db.commit()
    db.refresh(vote)
    return vote


def set_flexible(user_id: int, poll_id: int, is_flexible: bool, db: Session):
    pref = db.exec(
        select(UserPollPreference).where(
            UserPollPreference.user_id == user_id,
            UserPollPreference.poll_id == poll_id,
        )
    ).first()
    if pref:
        pref.is_flexible = is_flexible
        pref.updated_at = _now()
        db.add(pref)
    else:
        pref = UserPollPreference(
            user_id=user_id,
            poll_id=poll_id,
            is_flexible=is_flexible,
            updated_at=_now(),
        )
        db.add(pref)
    db.commit()


def mark_voting_complete(user_id: int, poll_id: int, db: Session):
    """Mark user's voting as complete for a poll"""
    pref = db.exec(
        select(UserPollPreference).where(
            UserPollPreference.user_id == user_id,
            UserPollPreference.poll_id == poll_id,
        )
    ).first()
    if pref:
        pref.has_completed_voting = True
        pref.updated_at = _now()
        db.add(pref)
    else:
        pref = UserPollPreference(
            user_id=user_id,
            poll_id=poll_id,
            has_completed_voting=True,
            updated_at=_now(),
        )
        db.add(pref)
    db.commit()


def get_user_votes(user_id: int, poll_id: int, db: Session) -> dict:
    """Returns {('event'|'session', target_id): vote_value}"""
    votes = db.exec(
        select(Vote).where(
            Vote.user_id == user_id,
            Vote.poll_id == poll_id,
        )
    ).all()
    return {(v.target_type, v.target_id): v.vote_value for v in votes}


def get_is_flexible(user_id: int, poll_id: int, db: Session) -> bool:
    pref = db.exec(
        select(UserPollPreference).where(
            UserPollPreference.user_id == user_id,
            UserPollPreference.poll_id == poll_id,
        )
    ).first()
    return pref.is_flexible if pref else False


def get_showtime_event_ids(user_votes: dict) -> list[int] | None:
    yes_event_ids = [
        target_id
        for (target_type, target_id), vote_value in user_votes.items()
        if target_type == "event" and vote_value == "yes"
    ]
    has_event_votes = any(target_type == "event" for target_type, _ in user_votes.keys())
    if yes_event_ids:
        return yes_event_ids
    if has_event_votes:
        return []
    return None


def _load_result_inputs(poll_id: int, db: Session) -> dict:
    users = db.exec(select(User).where(User.is_admin == False)).all()
    user_ids = [u.id for u in users]

    poll_event_links = db.exec(
        select(PollEvent).where(PollEvent.poll_id == poll_id)
    ).all()
    event_ids = [pe.event_id for pe in poll_event_links]
    events = db.exec(select(Event).where(Event.id.in_(event_ids))).all() if event_ids else []

    sessions = db.exec(
        select(ShowSession).where(
            ShowSession.poll_id == poll_id,
            ShowSession.is_included == True,
        )
    ).all()

    votes = db.exec(
        select(Vote).where(Vote.poll_id == poll_id)
    ).all()
    vote_lookup: dict[tuple, str] = {
        (v.target_type, v.target_id, v.user_id): v.vote_value for v in votes
    }

    prefs = db.exec(
        select(UserPollPreference).where(UserPollPreference.poll_id == poll_id)
    ).all()
    flexible_user_ids = {p.user_id for p in prefs if p.is_flexible}

    candidates = []
    for event in events:
        for session in sessions:
            if session.event_id == event.id:
                candidates.append((event, session))

    return {
        "users": users,
        "user_ids": user_ids,
        "vote_lookup": vote_lookup,
        "flexible_user_ids": flexible_user_ids,
        "candidates": candidates,
    }


def _score_candidates(
    candidates: list[tuple[Event, ShowSession]],
    users: list[User],
    flexible_user_ids: set[int],
    vote_lookup: dict[tuple, str],
    require_support: bool = False,
) -> list[dict]:
    scored = []
    for event, session in candidates:
        score = 0
        compatible_user_ids = []
        supporters = []
        for user in users:
            uid = user.id
            if uid in flexible_user_ids:
                score += 2
                compatible_user_ids.append(uid)
                supporters.append({"user": user, "is_flexible": True})
                continue

            movie_vote = vote_lookup.get(("event", event.id, uid), "abstain")
            session_vote = vote_lookup.get(("session", session.id, uid), "abstain")

            if movie_vote == "yes":
                score += 1
            if session_vote == "can_do":
                score += 1
            if movie_vote != "no" and session_vote != "cant_do":
                compatible_user_ids.append(uid)
            if movie_vote == "yes" and session_vote == "can_do":
                supporters.append({"user": user, "is_flexible": False})

        if require_support and not supporters:
            continue

        scored.append((score, event, session, compatible_user_ids, supporters))

    scored.sort(key=lambda x: (-x[0], x[2].session_date, x[2].session_time))

    return [
        {
            "rank": i + 1,
            "score": score,
            "event": event,
            "session": session,
            "compatible_user_ids": compatible_user_ids,
            "compatible_count": len(compatible_user_ids),
            "supporters": supporters,
            "supporter_count": len(supporters),
        }
        for i, (score, event, session, compatible_user_ids, supporters) in enumerate(scored)
    ]


def calculate_results(poll_id: int, db: Session) -> dict:
    """
    Implements the scoring algorithm from requirements §6.

    Returns:
        {
          "ranked": [{"rank": 1, "score": 8, "event": Event, "session": ShowSession}, ...],
          "no_valid_options": bool,
        }
    """
    result_inputs = _load_result_inputs(poll_id, db)
    ranked = _score_candidates(
        result_inputs["candidates"],
        result_inputs["users"],
        result_inputs["flexible_user_ids"],
        result_inputs["vote_lookup"],
        require_support=True,
    )

    return {
        "ranked": ranked,
        "no_valid_options": len(ranked) == 0,
        "total_possible": len(result_inputs["user_ids"]) * 2,
    }


def calculate_user_results(user_id: int, poll_id: int, db: Session) -> dict:
    result_inputs = _load_result_inputs(poll_id, db)
    if user_id in result_inputs["flexible_user_ids"]:
        candidates = result_inputs["candidates"]
    else:
        candidates = []
        for event, session in result_inputs["candidates"]:
            movie_vote = result_inputs["vote_lookup"].get(("event", event.id, user_id), "abstain")
            session_vote = result_inputs["vote_lookup"].get(("session", session.id, user_id), "abstain")
            if movie_vote != "yes" or session_vote != "can_do":
                continue
            candidates.append((event, session))

    ranked = _score_candidates(
        candidates,
        result_inputs["users"],
        result_inputs["flexible_user_ids"],
        result_inputs["vote_lookup"],
        require_support=True,
    )

    return {
        "ranked": ranked,
        "no_valid_options": len(ranked) == 0,
        "total_possible": len(result_inputs["user_ids"]) * 2,
        "is_flexible": user_id in result_inputs["flexible_user_ids"],
    }


def get_participation(poll_id: int, db: Session) -> dict:
    users = db.exec(select(User).where(User.is_admin == False)).all()

    poll_event_links = db.exec(
        select(PollEvent).where(PollEvent.poll_id == poll_id)
    ).all()
    event_ids = [pe.event_id for pe in poll_event_links]

    sessions = db.exec(
        select(ShowSession).where(
            ShowSession.poll_id == poll_id,
            ShowSession.is_included == True,
        )
    ).all()
    session_ids = [s.id for s in sessions]

    participants = []
    for user in users:
        pref = db.exec(
            select(UserPollPreference).where(
                UserPollPreference.user_id == user.id,
                UserPollPreference.poll_id == poll_id,
            )
        ).first()
        is_flexible = pref.is_flexible if pref else False
        has_completed = pref.has_completed_voting if pref else False

        if is_flexible:
            fully_voted = True
        elif has_completed:
            # User explicitly marked voting as complete
            fully_voted = True
        else:
            user_votes = db.exec(
                select(Vote).where(
                    Vote.user_id == user.id,
                    Vote.poll_id == poll_id,
                )
            ).all()
            # Any vote value (yes/no/abstain) counts as having voted on an event
            voted_event_ids = {
                v.target_id for v in user_votes if v.target_type == "event"
            }
            # Sessions are only required for movies the user voted YES on
            yes_event_ids = {
                v.target_id for v in user_votes
                if v.target_type == "event" and v.vote_value == "yes"
            }
            # Build required session ids: only is_included sessions for YES movies
            sessions_by_event: dict[int, list[int]] = {}
            for s in sessions:
                sessions_by_event.setdefault(s.event_id, []).append(s.id)
            required_session_ids = [
                sid
                for eid in yes_event_ids
                for sid in sessions_by_event.get(eid, [])
            ]
            voted_session_ids = {
                v.target_id for v in user_votes 
                if v.target_type == "session" and v.vote_value != "abstain"
            }
            all_events_voted = set(event_ids).issubset(voted_event_ids) if event_ids else True
            all_sessions_voted = set(required_session_ids).issubset(voted_session_ids) if required_session_ids else True
            fully_voted = all_events_voted and all_sessions_voted

        participants.append({
            "user": user,
            "fully_voted": fully_voted,
            "is_flexible": is_flexible,
        })

    fully_voted_count = sum(1 for p in participants if p["fully_voted"])
    return {
        "participants": participants,
        "fully_voted_count": fully_voted_count,
        "total": len(users),
    }
