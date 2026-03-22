from fastapi import APIRouter, Request, Depends
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from app.db import get_db
from app.services.auth_service import consume_magic_link, create_member_session, MEMBER_SESSION_COOKIE

router = APIRouter(prefix="/auth/member", tags=["Auth Web"])

@router.get("/{token}")
def consume_member_magic_link(token: str, request: Request, db: Session = Depends(get_db)):
    """Consumes a magic link for member login or signup."""
    # Attempt login first
    user = consume_magic_link(token, "member_login", db)
    if not user:
        # Fallback to signup purpose
        user = consume_magic_link(token, "member_signup", db)
        
    if not user:
        # Invalid, expired, or already used
        return RedirectResponse("/login?error=invalid_token", status_code=302)
        
    session_id = create_member_session(user, dict(request.headers), db)
    
    response = RedirectResponse("/vote/dashboard", status_code=302)
    response.set_cookie(
        MEMBER_SESSION_COOKIE,
        session_id,
        httponly=True,
        secure=False,  # Set False for localhost dev
        samesite="lax",
        max_age=30 * 24 * 3600,
    )
    return response

@router.post("/logout")
def member_logout(request: Request, db: Session = Depends(get_db)):
    """Logs out the current member."""
    session_id = request.cookies.get(MEMBER_SESSION_COOKIE)
    if session_id:
        from app.services.auth_service import revoke_member_session
        revoke_member_session(session_id, db)
        
    response = RedirectResponse("/login", status_code=302)
    response.delete_cookie(MEMBER_SESSION_COOKIE)
    return response
