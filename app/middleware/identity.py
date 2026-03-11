from fastapi import Request, HTTPException
from sqlmodel import Session, select

from app.models import User
from app.services.security_service import POLL_SESSION_COOKIE_NAME, get_poll_session_payload


def get_poll_session(request: Request) -> dict | None:
    token = request.cookies.get(POLL_SESSION_COOKIE_NAME)
    return get_poll_session_payload(token)


def get_secure_poll_id(request: Request) -> int | None:
    session = get_poll_session(request)
    if not session:
        return None
    return session["poll_id"]


def is_secure_entry(request: Request) -> bool:
    return get_poll_session(request) is not None


def get_current_user(request: Request, db: Session) -> User:
    """Resolve voter identity from secure poll session or fallback token."""
    poll_session = get_poll_session(request)
    if poll_session:
        user = db.get(User, poll_session["user_id"])
        if not user:
            raise HTTPException(status_code=401, detail="Unknown secure poll session")
        return user

    token = request.cookies.get("token") or request.headers.get("X-User-Token")
    if not token:
        raise HTTPException(status_code=401, detail="Identity not set")
    user = db.exec(select(User).where(User.token == token)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Unknown token")
    return user


def get_current_user_optional(request: Request, db: Session) -> User | None:
    """Same as get_current_user but returns None instead of raising."""
    try:
        return get_current_user(request, db)
    except HTTPException:
        return None
