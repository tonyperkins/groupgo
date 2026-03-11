from fastapi import Request, HTTPException
from sqlmodel import Session, select
from app.models import User


def get_current_user(request: Request, db: Session) -> User:
    """Resolve voter identity from cookie or header token."""
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
