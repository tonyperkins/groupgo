import time
from collections import defaultdict
from fastapi import APIRouter, Request, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select
import logging

import uuid
from app.db import get_db
from app.models import User, Poll
from app.services.auth_service import send_member_magic_link, create_member_session, MEMBER_SESSION_COOKIE

router = APIRouter(prefix="/api/auth", tags=["Auth API"])
logger = logging.getLogger(__name__)

# Very simple IP-based Token Bucket for rate limiting
_rate_limits = defaultdict(list)

def enforce_rate_limit(request: Request):
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else "127.0.0.1"
    now = time.time()
    
    # Clean requests older than 10 minutes (600 seconds)
    _rate_limits[ip] = [t for t in _rate_limits[ip] if now - t < 600]
    
    if len(_rate_limits[ip]) >= 5:
        logger.warning(f"[RATE LIMIT] Blocked IP {ip} (Too many auth attempts)")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many request attempts. Please try again in 10 minutes."
        )
    _rate_limits[ip].append(now)

class LoginRequest(BaseModel):
    email: EmailStr

class SignupRequest(BaseModel):
    name: str
    email: EmailStr

class GuestJoinRequest(BaseModel):
    name: str
    access_uuid: str

@router.post("/login", dependencies=[Depends(enforce_rate_limit)])
def member_login(data: LoginRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.exec(select(User).where(User.email == email)).first()
    
    if not user:
        # Prevent email enumeration by returning success anyway
        logger.info(f"[AUTH] Login attempted for non-existent email: {email}")
        return {"ok": True, "message": "If an account exists, a link has been sent."}
        
    send_member_magic_link(user, "member_login", db)
    return {"ok": True, "message": "Magic link sent."}


@router.post("/signup", dependencies=[Depends(enforce_rate_limit)])
def member_signup(data: SignupRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.exec(select(User).where(User.email == email)).first()
    
    if user:
        # User already exists, just send a login link instead of failing
        send_member_magic_link(user, "member_login", db)
        return {"ok": True, "message": "Account exists. A login link was sent instead."}
        
    # Create new member
    new_user = User(
        name=data.name.strip(),
        email=email,
        role="member"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    send_member_magic_link(new_user, "member_signup", db)
    return {"ok": True, "message": "Account created. Check your email for the login link."}


@router.post("/guest-join", dependencies=[Depends(enforce_rate_limit)])
def guest_join(data: GuestJoinRequest, request: Request, db: Session = Depends(get_db)):
    from fastapi.responses import JSONResponse
    poll = db.exec(select(Poll).where(Poll.access_uuid == data.access_uuid)).first()
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
        
    guest_uuid = str(uuid.uuid4())
    pseudo_email = f"guest_{guest_uuid}@groupgo.local"
    
    new_user = User(
        name=data.name.strip() or "Guest",
        email=pseudo_email,
        role="member"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    session_id = create_member_session(new_user, dict(request.headers), db)
    
    response = JSONResponse({"ok": True, "message": "Joined as guest."})
    response.set_cookie(
        MEMBER_SESSION_COOKIE,
        session_id,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=30 * 24 * 3600,
    )
    return response
