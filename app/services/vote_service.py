from datetime import datetime, timezone
from sqlmodel import Session, select

from app.models import (
    User, Vote, UserPollPreference, Poll, PollEvent,
    Showtime, Event, Group,
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
    veto_reason: str | None = None,
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
        if vote_value == "no" and veto_reason is not None:
            existing.veto_reason = veto_reason
        elif vote_value != "no":
            existing.veto_reason = None
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    new_vote = Vote(
        user_id=user_id,
        poll_id=poll_id,
        target_type=target_type,
        target_id=target_id,
        vote_value=vote_value,
        veto_reason=veto_reason if vote_value == "no" else None,
        voted_at=now,
        updated_at=now,
    )
    db.add(new_vote)
    db.commit()
    db.refresh(new_vote)
    return new_vote


def set_flexible(user_id: int, poll_id: int, is_flexible: bool, db: Session):
    pref = db.exec(
        select(UserPollPreference).where(
            UserPollPreference.user_id == user_id,
            UserPollPreference.poll_id == poll_id,
        )
    ).first()
    if pref:
        pref.is_flexible = is_flexible
        if is_flexible:
            pref.is_participating = True
        pref.updated_at = _now()
        db.add(pref)
    else:
        pref = UserPollPreference(
            user_id=user_id,
            poll_id=poll_id,
            is_flexible=is_flexible,
            is_participating=is_flexible,
            updated_at=_now(),
        )
        db.add(pref)
    db.commit()


def mark_voting_complete(user_id: int, poll_id: int, is_complete: bool, db: Session):
    pref = db.exec(
        select(UserPollPreference).where(
            UserPollPreference.user_id == user_id,
            UserPollPreference.poll_id == poll_id,
        )
    ).first()
    if pref:
        pref.has_completed_voting = is_complete
        if is_complete:
            pref.is_participating = True
        pref.updated_at = _now()
        db.add(pref)
    else:
        pref = UserPollPreference(
            user_id=user_id,
            poll_id=poll_id,
            has_completed_voting=is_complete,
            is_participating=is_complete,
            updated_at=_now(),
        )
        db.add(pref)
    db.commit()


def set_participating(user_id: int, poll_id: int, is_participating: bool, db: Session, opt_out_reason: str = None):
    pref = db.exec(
        select(UserPollPreference).where(
            UserPollPreference.user_id == user_id,
            UserPollPreference.poll_id == poll_id,
        )
    ).first()
    if pref:
        pref.is_participating = is_participating
        if not is_participating:
            pref.has_completed_voting = False
            pref.is_flexible = False
            pref.opt_out_reason = opt_out_reason
        else:
            pref.opt_out_reason = None
        pref.updated_at = _now()
        db.add(pref)
    else:
        pref = UserPollPreference(
            user_id=user_id,
            poll_id=poll_id,
            is_participating=is_participating,
            opt_out_reason=opt_out_reason if not is_participating else None,
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

def get_user_veto_reasons(user_id: int, poll_id: int, db: Session) -> dict[int, str]:
    """Returns {event_id: veto_reason} for all explicit 'no' votes on events with a reason."""
    votes = db.exec(
        select(Vote).where(
            Vote.user_id == user_id,
            Vote.poll_id == poll_id,
            Vote.target_type == "event",
            Vote.vote_value == "no",
            Vote.veto_reason != None,
        )
    ).all()
    return {v.target_id: v.veto_reason for v in votes if v.veto_reason}


def get_is_flexible(user_id: int, poll_id: int, db: Session) -> bool:
    pref = db.exec(
        select(UserPollPreference).where(
            UserPollPreference.user_id == user_id,
            UserPollPreference.poll_id == poll_id,
        )
    ).first()
    return pref.is_flexible if pref else False


def get_user_poll_preferences(user_id: int, poll_id: int, db: Session) -> dict:
    pref = db.exec(
        select(UserPollPreference).where(
            UserPollPreference.user_id == user_id,
            UserPollPreference.poll_id == poll_id,
        )
    ).first()
    return {
        "is_flexible": pref.is_flexible if pref else False,
        "has_completed_voting": pref.has_completed_voting if pref else False,
        "is_participating": pref.is_participating if pref else False,
        "opt_out_reason": pref.opt_out_reason if pref else None,
    }


def get_voted_movie_count(user_id: int, poll_id: int, db: Session) -> int:
    from app.models import Vote, PollEvent
    count = db.exec(
        select(Vote)
        .join(PollEvent, Vote.target_id == PollEvent.event_id)
        .where(
            Vote.user_id == user_id,
            Vote.poll_id == poll_id,
            Vote.target_type == "event",
            Vote.vote_value != "abstain",
            PollEvent.poll_id == poll_id
        )
    ).all()
    return len(count)

def get_yes_movie_count(user_id: int, poll_id: int, db: Session) -> int:
    from app.models import Vote, PollEvent
    count = db.exec(
        select(Vote)
        .join(PollEvent, Vote.target_id == PollEvent.event_id)
        .where(
            Vote.user_id == user_id,
            Vote.poll_id == poll_id,
            Vote.target_type == "event",
            Vote.vote_value == "yes",
            PollEvent.poll_id == poll_id
        )
    ).all()
    return len(count)

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


def _synthesize_movie_votes(
    sessions: list[Showtime],
    vote_lookup: dict[tuple, str],
    user_ids: list[int],
    event_ids: list[int],
) -> dict[tuple, str]:
    """
    Derive implicit movie-level votes from showtime votes.

    Rules per (user, event):
      - Any can_do on any session for this event  → "yes"
      - All sessions voted cant_do (≥1 session)   → "no"
      - No session votes cast yet                 → "abstain"

    Existing explicit event-level votes in vote_lookup are respected as
    fallback for legacy data, but synthesized votes take precedence.
    """
    # Group session ids by event_id
    sessions_by_event: dict[int, list[int]] = {}
    for s in sessions:
        sessions_by_event.setdefault(s.event_id, []).append(s.id)

    synthesized: dict[tuple, str] = {}
    for uid in user_ids:
        for eid in event_ids:
            session_ids = sessions_by_event.get(eid, [])
            if not session_ids:
                # No sessions for this event — fall back to explicit vote or abstain
                explicit = vote_lookup.get(("event", eid, uid), "abstain")
                synthesized[("event", eid, uid)] = explicit
                continue
            session_votes = [
                vote_lookup.get(("session", sid, uid), "abstain")
                for sid in session_ids
            ]
            voted = [v for v in session_votes if v != "abstain"]
            if any(v == "can_do" for v in voted):
                synthesized[("event", eid, uid)] = "yes"
            elif voted and all(v == "cant_do" for v in voted):
                synthesized[("event", eid, uid)] = "no"
            else:
                synthesized[("event", eid, uid)] = "abstain"
    return synthesized


def _get_poll_group_users(poll_id: int, db: Session) -> list[User]:
    """Return users eligible for this poll — filtered by poll.group_id if set."""
    poll = db.get(Poll, poll_id)
    if poll and poll.group_id is not None:
        return db.exec(select(User).where(User.group_id == poll.group_id)).all()
    return db.exec(select(User)).all()


def _load_result_inputs(poll_id: int, db: Session) -> dict:
    users = _get_poll_group_users(poll_id, db)
    user_ids = [u.id for u in users]

    poll_event_links = db.exec(
        select(PollEvent).where(PollEvent.poll_id == poll_id)
    ).all()
    event_ids = [pe.event_id for pe in poll_event_links]
    events = db.exec(select(Event).where(Event.id.in_(event_ids))).all() if event_ids else []

    sessions = db.exec(
        select(Showtime).where(
            Showtime.poll_id == poll_id,
            Showtime.is_included == True,
        )
    ).all()

    votes = db.exec(
        select(Vote).where(Vote.poll_id == poll_id)
    ).all()
    vote_lookup: dict[tuple, str] = {
        (v.target_type, v.target_id, v.user_id): v.vote_value for v in votes
    }

    # Synthesize movie-level votes from showtime votes (replaces explicit event votes)
    synthesized_movie_votes = _synthesize_movie_votes(sessions, vote_lookup, user_ids, event_ids)
    # Merge: synthesized takes precedence for event-type keys
    merged_vote_lookup = {**vote_lookup, **synthesized_movie_votes}

    prefs = db.exec(
        select(UserPollPreference).where(UserPollPreference.poll_id == poll_id)
    ).all()
    flexible_user_ids = {p.user_id for p in prefs if p.is_flexible}
    unavailable_user_ids = {p.user_id for p in prefs if not p.is_participating}

    candidates = []
    for event in events:
        for session in sessions:
            if session.event_id == event.id:
                candidates.append((event, session))

    return {
        "users": users,
        "user_ids": user_ids,
        "vote_lookup": merged_vote_lookup,
        "flexible_user_ids": flexible_user_ids,
        "unavailable_user_ids": unavailable_user_ids,
        "candidates": candidates,
    }

def _score_candidates(
    candidates: list[tuple[Event, Showtime]],
    users: list[User],
    flexible_user_ids: set[int],
    unavailable_user_ids: set[int],
    vote_lookup: dict[tuple, str],
    require_support: bool = False,
) -> list[dict]:
    scored = []
    for event, session in candidates:
        score = 0
        compatible_user_ids = []
        supporters = []
        user_states = []
        for user in users:
            uid = user.id
            if uid in unavailable_user_ids:
                user_states.append({
                    "user": user,
                    "is_supporting": False,
                    "is_compatible": False,
                    "is_flexible": False,
                    "is_participating": False,
                })
                continue

            if uid in flexible_user_ids:
                score += 2
                compatible_user_ids.append(uid)
                supporters.append({"user": user, "is_flexible": True})
                user_states.append({
                    "user": user,
                    "is_supporting": True,
                    "is_compatible": True,
                    "is_flexible": True,
                    "is_participating": True,
                })
                continue

            movie_vote = vote_lookup.get(("event", event.id, uid), "abstain")
            session_vote = vote_lookup.get(("session", session.id, uid), "abstain")
            is_compatible = movie_vote != "no" and session_vote != "cant_do"
            is_supporting = movie_vote == "yes" and session_vote == "can_do"

            if movie_vote == "yes":
                score += 1
            if session_vote == "can_do":
                score += 1
            if is_compatible:
                compatible_user_ids.append(uid)
            if is_supporting:
                supporters.append({"user": user, "is_flexible": False})
            user_states.append({
                "user": user,
                "is_supporting": is_supporting,
                "is_compatible": is_compatible,
                "is_flexible": False,
                "is_participating": True,
            })

        if require_support and not supporters:
            continue

        scored.append((score, event, session, compatible_user_ids, supporters, user_states))

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
            "user_states": user_states,
        }
        for i, (score, event, session, compatible_user_ids, supporters, user_states) in enumerate(scored)
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
        result_inputs["unavailable_user_ids"],
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
        result_inputs["unavailable_user_ids"],
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
    users = _get_poll_group_users(poll_id, db)

    poll_event_links = db.exec(
        select(PollEvent).where(PollEvent.poll_id == poll_id)
    ).all()
    event_ids = [pe.event_id for pe in poll_event_links]

    sessions = db.exec(
        select(Showtime).where(
            Showtime.poll_id == poll_id,
            Showtime.is_included == True,
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
        is_participating = pref.is_participating if pref else False
        has_completed = pref.has_completed_voting if pref else False

        if not is_participating:
            fully_voted = False
            status_label = "Not joined"
        elif is_flexible:
            fully_voted = True
            status_label = "Flexible"
        elif has_completed:
            fully_voted = True
            status_label = "All set"
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
            status_label = "All set" if fully_voted else "Pending"

        participants.append({
            "user": user,
            "fully_voted": fully_voted,
            "is_flexible": is_flexible,
            "is_participating": is_participating,
            "has_completed_voting": has_completed,
            "status_label": status_label,
        })

    fully_voted_count = sum(1 for p in participants if p["fully_voted"])
    return {
        "participants": participants,
        "fully_voted_count": fully_voted_count,
        "total": len(users),
    }
