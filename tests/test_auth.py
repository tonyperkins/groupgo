import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.models import User, MagicLinkToken
from app.services.auth_service import MEMBER_SESSION_COOKIE

def test_signup_flow(client: TestClient, db: Session):
    response = client.post("/api/auth/signup", json={"name": "Alice", "email": "alice@example.com"})
    assert response.status_code == 200
    assert response.json()["ok"] is True
    
    user = db.exec(select(User).where(User.email == "alice@example.com")).first()
    assert user is not None
    assert user.name == "Alice"
    assert user.role == "member"
    
    token_record = db.exec(select(MagicLinkToken).where(MagicLinkToken.user_id == user.id)).first()
    assert token_record is not None
    assert token_record.purpose == "member_signup"

def test_login_flow(client: TestClient, db: Session):
    user = User(name="Bob", email="bob@example.com", role="member")
    db.add(user)
    db.commit()
    
    response = client.post("/api/auth/login", json={"email": "bob@example.com"})
    assert response.status_code == 200
    assert response.json()["ok"] is True
    
    token_record = db.exec(select(MagicLinkToken).where(MagicLinkToken.user_id == user.id)).first()
    assert token_record is not None
    assert token_record.purpose == "member_login"

def test_consume_magic_link_success(client: TestClient, db: Session):
    user = User(name="Charlie", email="charlie@example.com", role="member")
    db.add(user)
    db.commit()
    db.refresh(user)
    
    from app.services.auth_service import create_magic_link
    token = create_magic_link(user, "member_login", db)
    
    response = client.get(f"/auth/member/{token}", follow_redirects=False)
    assert response.status_code == 302
    assert "/vote/dashboard" in response.headers["location"]
    
    assert MEMBER_SESSION_COOKIE in response.cookies
    
    # Destructive use verification
    token_record = db.get(MagicLinkToken, token)
    assert token_record is None

def test_consume_magic_link_invalid(client: TestClient, db: Session):
    response = client.get(f"/auth/member/invalid-token-123", follow_redirects=False)
    assert response.status_code == 302
    assert "/login?error=invalid_token" in response.headers["location"]
    assert MEMBER_SESSION_COOKIE not in response.cookies

def test_auth_rate_limiting(client: TestClient):
    payload = {"email": "spam@example.com"}
    headers = {"X-Forwarded-For": "192.168.1.100"}
    
    # Fire 5 rapid requests (they should pass)
    for _ in range(5):
        resp = client.post("/api/auth/login", json=payload, headers=headers)
        assert resp.status_code == 200
        
    # The 6th request inside the same 10-minute window should be rejected
    response = client.post("/api/auth/login", json=payload, headers=headers)
    assert response.status_code == 429
    assert "Too many request attempts" in response.json()["detail"]
