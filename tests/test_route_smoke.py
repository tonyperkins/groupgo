import base64
from datetime import datetime

from app.config import settings
from app.models import User
from app.services.vote_service import cast_vote


def _display_time(value: str) -> str:
    dt = datetime.strptime(value, "%H:%M")
    return dt.strftime("%I:%M %p").lstrip("0")


def _admin_headers():
    raw = f"{settings.ADMIN_USERNAME}:{settings.ADMIN_PASSWORD}".encode("utf-8")
    token = base64.b64encode(raw).decode("utf-8")
    return {"Authorization": f"Basic {token}"}


def _set_user_token(db, user_id: int = 2) -> str:
    user = db.get(User, user_id)
    assert user is not None
    token = f"test-token-{user_id}"
    user.token = token
    db.add(user)
    db.commit()
    db.refresh(user)
    return token


def test_identify_page_renders(client):
    response = client.get("/identify")
    assert response.status_code == 200
    assert "GroupGo" in response.text
    assert "Alex" in response.text


def test_voter_movies_page_renders(client, seeded_db, poll_with_event):
    token = _set_user_token(seeded_db, 2)
    client.cookies.set("token", token)

    response = client.get("/vote/movies")
    assert response.status_code == 200
    assert "Test Movie" in response.text


def test_voter_logistics_page_renders(client, seeded_db, poll_with_sessions):
    token = _set_user_token(seeded_db, 2)
    client.cookies.set("token", token)

    response = client.get("/vote/logistics")
    assert response.status_code == 200
    assert "19:00" in response.text or "7:00 PM" in response.text


def test_admin_dashboard_renders(client):
    response = client.get("/admin", headers=_admin_headers())
    assert response.status_code == 200
    assert "Dashboard" in response.text or "Admin dashboard" in response.text


def test_admin_showtimes_page_renders(client, poll_with_sessions):
    poll, _, _ = poll_with_sessions
    response = client.get(f"/admin/polls/{poll.id}/showtimes", headers=_admin_headers())
    assert response.status_code == 200
    assert "Cached showtimes" in response.text


def test_admin_can_generate_secure_invite_link(client, poll_with_sessions):
    poll, _, _ = poll_with_sessions
    response = client.post(f"/api/admin/polls/{poll.id}/invite-link", headers=_admin_headers())

    assert response.status_code == 200
    body = response.json()
    assert body["poll_id"] == poll.id
    assert body["access_uuid"]
    assert body["invite_url"].startswith(f"{settings.app_base_url}/join/")


def test_secure_join_uses_member_pin_and_ignores_other_token_cookie(client, seeded_db, poll_with_sessions):
    poll, _, _ = poll_with_sessions

    invite_response = client.post(f"/api/admin/polls/{poll.id}/invite-link", headers=_admin_headers())
    access_uuid = invite_response.json()["access_uuid"]

    response = client.post(f"/join/{access_uuid}", data={"member_pin": "1111"}, follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == "/vote/movies"
    assert client.cookies.get("poll_access")

    blake_token = _set_user_token(seeded_db, 3)
    client.cookies.set("token", blake_token)

    movies_response = client.get("/vote/movies")
    assert movies_response.status_code == 200
    assert 'Hey, <span class="text-white font-medium">Alex</span>' in movies_response.text
    assert 'Hey, <span class="text-white font-medium">Blake</span>' not in movies_response.text
    assert "Secure link" in movies_response.text

    identify_response = client.get("/identify", follow_redirects=False)
    assert identify_response.status_code == 302
    assert identify_response.headers["location"] == "/vote/movies"


def test_voter_showtimes_page_hides_sessions_when_user_rejects_movies(client, seeded_db, poll_with_sessions):
    poll, event, _ = poll_with_sessions
    token = _set_user_token(seeded_db, 2)
    client.cookies.set("token", token)
    cast_vote(2, poll.id, "event", event.id, "no", seeded_db)

    response = client.get("/vote/showtimes")
    assert response.status_code == 200
    assert "No showtimes in your list yet" in response.text


def test_voter_results_page_shows_overall_results_and_your_choices(client, seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    chosen_session = sessions[0]
    unchosen_session = sessions[1]
    token = _set_user_token(seeded_db, 2)
    client.cookies.set("token", token)
    cast_vote(2, poll.id, "event", event.id, "yes", seeded_db)
    cast_vote(2, poll.id, "session", chosen_session.id, "can_do", seeded_db)
    cast_vote(2, poll.id, "session", unchosen_session.id, "abstain", seeded_db)

    response = client.get("/results")
    assert response.status_code == 200
    assert "Overall results" in response.text
    assert "Your choices" in response.text
    assert "Tony" not in response.text
    assert event.title in response.text
    assert 'href="/vote/showtimes"' in response.text
    assert _display_time(chosen_session.session_time) in response.text
    assert _display_time(unchosen_session.session_time) not in response.text
    assert "Alex" in response.text


def test_admin_results_page_keeps_overall_rankings_visible(client, seeded_db, poll_with_sessions):
    poll, event, sessions = poll_with_sessions
    chosen_session = sessions[0]
    unchosen_session = sessions[1]
    cast_vote(2, poll.id, "event", event.id, "yes", seeded_db)
    cast_vote(2, poll.id, "session", chosen_session.id, "can_do", seeded_db)
    cast_vote(2, poll.id, "session", unchosen_session.id, "abstain", seeded_db)

    response = client.get(f"/admin/polls/{poll.id}/results", headers=_admin_headers())
    assert response.status_code == 200
    assert "Overall results" in response.text
    assert event.title in response.text
    assert f'href="/admin/polls/{poll.id}/showtimes"' in response.text
    assert _display_time(chosen_session.session_time) in response.text
    assert _display_time(unchosen_session.session_time) not in response.text
    assert "Alex" in response.text
