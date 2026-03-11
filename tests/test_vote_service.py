import pytest
from app.services.vote_service import cast_vote, calculate_results, calculate_user_results, get_participation, get_showtime_event_ids, set_flexible


def test_cast_movie_vote(seeded_db, poll_with_event):
    poll, event = poll_with_event
    vote = cast_vote(2, poll.id, "event", event.id, "yes", seeded_db)
    assert vote.vote_value == "yes"
    assert vote.user_id == 2
    assert vote.target_type == "event"


def test_update_movie_vote(seeded_db, poll_with_event):
    poll, event = poll_with_event
    cast_vote(2, poll.id, "event", event.id, "yes", seeded_db)
    updated = cast_vote(2, poll.id, "event", event.id, "no", seeded_db)
    assert updated.vote_value == "no"


def test_veto_eliminates_combination(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    # User 2 vetoes the movie — both combinations should be eliminated
    cast_vote(2, poll.id, "event", event.id, "no", seeded_db)
    # Users 3,4,5 approve everything
    for uid in [3, 4, 5]:
        cast_vote(uid, poll.id, "event", event.id, "yes", seeded_db)
        for s in sessions:
            cast_vote(uid, poll.id, "session", s.id, "can_do", seeded_db)

    results = calculate_results(poll.id, seeded_db)
    assert results["no_valid_options"] is False
    assert len(results["ranked"]) == len(sessions)


def test_session_veto_eliminates_only_that_session(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    s1, s2 = sessions

    # User 2 vetoes session 1 only — session 2 should survive
    cast_vote(2, poll.id, "event", event.id, "yes", seeded_db)
    cast_vote(2, poll.id, "session", s1.id, "cant_do", seeded_db)
    cast_vote(2, poll.id, "session", s2.id, "can_do", seeded_db)

    results = calculate_results(poll.id, seeded_db)
    personal_results = calculate_user_results(2, poll.id, seeded_db)
    assert results["no_valid_options"] is False
    surviving_session_ids = [r["session"].id for r in personal_results["ranked"]]
    assert s1.id not in surviving_session_ids
    assert s2.id in surviving_session_ids


def test_user_results_only_include_explicit_yes_and_can_do_votes(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    s1, s2 = sessions

    cast_vote(2, poll.id, "event", event.id, "yes", seeded_db)
    cast_vote(2, poll.id, "session", s1.id, "can_do", seeded_db)
    cast_vote(2, poll.id, "session", s2.id, "abstain", seeded_db)

    personal_results = calculate_user_results(2, poll.id, seeded_db)

    assert [r["session"].id for r in personal_results["ranked"]] == [s1.id]


def test_flexible_user_excluded_from_veto(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    # User 2 is flexible — their "no" doesn't count
    set_flexible(2, poll.id, True, seeded_db)
    # User 3 approves everything
    cast_vote(3, poll.id, "event", event.id, "yes", seeded_db)
    for s in sessions:
        cast_vote(3, poll.id, "session", s.id, "can_do", seeded_db)

    results = calculate_results(poll.id, seeded_db)
    assert results["no_valid_options"] is False
    assert len(results["ranked"]) == len(sessions)


def test_winner_has_highest_score(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    s1, s2 = sessions

    # 3 users approve everything for s1, only 1 for s2
    for uid in [2, 3, 4]:
        cast_vote(uid, poll.id, "event", event.id, "yes", seeded_db)
        cast_vote(uid, poll.id, "session", s1.id, "can_do", seeded_db)
        cast_vote(uid, poll.id, "session", s2.id, "abstain", seeded_db)

    results = calculate_results(poll.id, seeded_db)
    assert results["ranked"][0]["session"].id == s1.id
    assert [r["session"].id for r in results["ranked"]] == [s1.id]


def test_no_votes_returns_all_candidates(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    results = calculate_results(poll.id, seeded_db)
    assert results["no_valid_options"] is True
    assert results["ranked"] == []


def test_overall_results_only_include_combinations_with_explicit_support(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    s1, s2 = sessions
    cast_vote(2, poll.id, "event", event.id, "yes", seeded_db)
    cast_vote(2, poll.id, "session", s1.id, "can_do", seeded_db)
    cast_vote(2, poll.id, "session", s2.id, "abstain", seeded_db)

    results = calculate_results(poll.id, seeded_db)

    assert [r["session"].id for r in results["ranked"]] == [s1.id]
    assert results["ranked"][0]["supporter_count"] == 1
    assert results["ranked"][0]["supporters"][0]["user"].id == 2


def test_user_results_can_be_empty_even_when_overall_results_exist(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    cast_vote(2, poll.id, "event", event.id, "no", seeded_db)
    cast_vote(3, poll.id, "event", event.id, "yes", seeded_db)
    for s in sessions:
        cast_vote(3, poll.id, "session", s.id, "can_do", seeded_db)

    results = calculate_results(poll.id, seeded_db)
    personal_results = calculate_user_results(2, poll.id, seeded_db)

    assert results["ranked"]
    assert personal_results["no_valid_options"] is True
    assert personal_results["ranked"] == []


def test_showtime_event_ids_returns_empty_list_when_all_movies_rejected(seeded_db, poll_with_event):
    poll, event = poll_with_event
    cast_vote(2, poll.id, "event", event.id, "no", seeded_db)

    user_votes = {
        ("event", event.id): "no",
    }

    assert get_showtime_event_ids(user_votes) == []


def test_participation_fully_voted(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    user_id = 2
    cast_vote(user_id, poll.id, "event", event.id, "yes", seeded_db)
    for s in sessions:
        cast_vote(user_id, poll.id, "session", s.id, "can_do", seeded_db)

    p = get_participation(poll.id, seeded_db)
    user_entry = next(x for x in p["participants"] if x["user"].id == user_id)
    assert user_entry["fully_voted"] is True


def test_participation_flexible_counts_as_fully_voted(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    set_flexible(2, poll.id, True, seeded_db)

    p = get_participation(poll.id, seeded_db)
    user_entry = next(x for x in p["participants"] if x["user"].id == 2)
    assert user_entry["fully_voted"] is True


def test_participation_partial_vote_not_counted(seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    # Vote on movie only, not sessions
    cast_vote(2, poll.id, "event", event.id, "yes", seeded_db)

    p = get_participation(poll.id, seeded_db)
    user_entry = next(x for x in p["participants"] if x["user"].id == 2)
    assert user_entry["fully_voted"] is False
