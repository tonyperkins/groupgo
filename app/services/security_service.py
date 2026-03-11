import base64
import hashlib
import hmac
import json
import secrets
import uuid
from typing import Optional
from urllib.parse import quote

from fastapi import Response
from sqlmodel import Session, select

from app.config import settings
from app.models import Poll, User

TOKEN_COOKIE_NAME = "token"
POLL_SESSION_COOKIE_NAME = "poll_access"
COOKIE_MAX_AGE = 60 * 60 * 24 * 365


def ensure_user_token(user: User, db: Session) -> str:
    if user.token:
        return user.token
    user.token = str(uuid.uuid4())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user.token


def normalize_member_pin(raw_pin: str | None) -> str:
    pin = (raw_pin or "").strip()
    if len(pin) != 4 or not pin.isdigit():
        raise ValueError("PIN must be exactly 4 digits")
    return pin


def ensure_unique_member_pin(db: Session, pin: str, *, exclude_user_id: int | None = None) -> None:
    existing = db.exec(select(User).where(User.member_pin == pin)).first()
    if existing and existing.id != exclude_user_id:
        raise ValueError("PIN is already assigned to another member")


def generate_member_pin(db: Session) -> str:
    while True:
        pin = f"{secrets.randbelow(10000):04d}"
        existing = db.exec(select(User).where(User.member_pin == pin)).first()
        if not existing:
            return pin


def ensure_poll_access_uuid(poll: Poll, db: Session) -> str:
    if poll.access_uuid:
        return poll.access_uuid
    poll.access_uuid = str(uuid.uuid4())
    db.add(poll)
    db.commit()
    db.refresh(poll)
    return poll.access_uuid


def build_poll_invite_url(poll: Poll, db: Session) -> str:
    access_uuid = ensure_poll_access_uuid(poll, db)
    return f"{settings.app_base_url}/join/{quote(access_uuid)}"


def _b64_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def create_poll_session_token(*, poll_id: int, user_id: int) -> str:
    payload = json.dumps({"poll_id": poll_id, "user_id": user_id}, separators=(",", ":")).encode("utf-8")
    payload_part = _b64_encode(payload)
    signature = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload_part.encode("utf-8"), hashlib.sha256).digest()
    signature_part = _b64_encode(signature)
    return f"{payload_part}.{signature_part}"


def parse_poll_session_token(token: str | None) -> Optional[dict]:
    if not token or "." not in token:
        return None
    payload_part, signature_part = token.split(".", 1)
    expected = hmac.new(settings.SECRET_KEY.encode("utf-8"), payload_part.encode("utf-8"), hashlib.sha256).digest()
    try:
        actual = _b64_decode(signature_part)
    except Exception:
        return None
    if not hmac.compare_digest(expected, actual):
        return None
    try:
        payload = json.loads(_b64_decode(payload_part).decode("utf-8"))
    except Exception:
        return None
    if not isinstance(payload, dict):
        return None
    if not isinstance(payload.get("poll_id"), int) or not isinstance(payload.get("user_id"), int):
        return None
    return payload


def get_poll_session_payload(token: str | None) -> Optional[dict]:
    return parse_poll_session_token(token)


def set_voter_identity_cookies(response: Response, *, user_token: str, poll_id: int | None = None, user_id: int | None = None) -> None:
    response.set_cookie(
        TOKEN_COOKIE_NAME,
        user_token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )
    if poll_id is not None and user_id is not None:
        response.set_cookie(
            POLL_SESSION_COOKIE_NAME,
            create_poll_session_token(poll_id=poll_id, user_id=user_id),
            max_age=COOKIE_MAX_AGE,
            httponly=True,
            secure=settings.is_production,
            samesite="lax",
        )
    else:
        clear_poll_session_cookie(response)


def clear_poll_session_cookie(response: Response) -> None:
    response.delete_cookie(POLL_SESSION_COOKIE_NAME, secure=settings.is_production, samesite="lax")
