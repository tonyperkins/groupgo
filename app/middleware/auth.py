from fastapi import Request, HTTPException
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.services.auth_service import ADMIN_SESSION_COOKIE, get_admin_user_from_session


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
    """Backward-compat shim. Callers in admin.py pass only request — we grab db from request.state if available."""
    _db: Session | None = db or getattr(request.state, "db", None)
    if _db is None:
        raise HTTPException(status_code=401, detail="Admin authentication required")
    get_admin_user(request, _db)
