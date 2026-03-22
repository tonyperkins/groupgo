from fastapi import Request, HTTPException
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.services.auth_service import (
    ADMIN_SESSION_COOKIE, 
    MEMBER_SESSION_COOKIE,
    get_admin_user_from_session,
    get_member_user_from_session,
)


def get_admin_user(request: Request, db: Session):
    """Resolve admin identity from session cookie. Raises 401 on failure."""
    session_id = request.cookies.get(ADMIN_SESSION_COOKIE)
    user = get_admin_user_from_session(session_id, db)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Admin authentication required",
        )
    return user


def verify_admin(request: Request, db: Session | None = None) -> None:
    """Ensures the request is made by a 'platform_admin' (via either session type)."""
    _db: Session | None = db or getattr(request.state, "db", None)
    if _db is None:
        raise HTTPException(status_code=401, detail="Database context missing")
    
    user = get_current_member(request, _db)
    if user.role != "platform_admin":
        raise HTTPException(status_code=403, detail="Forbidden: Platform Admin status required")


def get_current_member(request: Request, db: Session | None = None):
    """Resolve member identity, falling back to admin session if no member session exists."""
    _db: Session | None = db or getattr(request.state, "db", None)
    if _db is None:
        raise HTTPException(status_code=401, detail="Database context missing")
        
    user = None
    member_session_id = request.cookies.get(MEMBER_SESSION_COOKIE)
    if member_session_id:
        user = get_member_user_from_session(member_session_id, _db)
        
    if not user:
        admin_session_id = request.cookies.get(ADMIN_SESSION_COOKIE)
        if admin_session_id:
            user = get_admin_user_from_session(admin_session_id, _db)
            
    if not user:
        raise HTTPException(status_code=401, detail="Member authentication required")
        
    return user


def require_member(request: Request, db: Session | None = None):
    """Guard: ensures the request is made by an authenticated user with 'member' or 'platform_admin' role."""
    user = get_current_member(request, db)
    if user.role not in ["member", "platform_admin"]:
        raise HTTPException(status_code=403, detail="Forbidden: Member status required")
    return user


def require_platform_admin(request: Request, db: Session | None = None):
    """Guard: ensures the request is made by a 'platform_admin'."""
    user = get_current_member(request, db)
    if user.role != "platform_admin":
        raise HTTPException(status_code=403, detail="Forbidden: Platform Admin status required")
    return user
