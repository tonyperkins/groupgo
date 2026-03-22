import time
from collections import defaultdict
from fastapi import APIRouter, Request, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select
import logging

from app.db import get_db
from app.models import User
from app.services.auth_service import send_member_magic_link

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
