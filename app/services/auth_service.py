import logging
import uuid
from datetime import datetime, timezone, timedelta

from sqlmodel import Session, select

from app.models import User, MagicLinkToken, AuthSession

logger = logging.getLogger(__name__)

ADMIN_SESSION_COOKIE = "gg_admin_session"
MAGIC_LINK_TTL_MINUTES = 15
ADMIN_SESSION_TTL_DAYS = 30


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _expires_at(*, minutes: int = 0, days: int = 0) -> str:
    delta = timedelta(minutes=minutes, days=days)
    return (datetime.now(timezone.utc) + delta).isoformat()


# ─── Magic link ───────────────────────────────────────────────────────────────

def create_magic_link(user: User, purpose: str, db: Session) -> str:
    """Create a single-use magic link token. Returns the raw token string."""
    token = str(uuid.uuid4())
    db.add(MagicLinkToken(
        token=token,
        user_id=user.id,
        purpose=purpose,
        expires_at=_expires_at(minutes=MAGIC_LINK_TTL_MINUTES),
    ))
    db.commit()
    return token


def consume_magic_link(token: str, purpose: str, db: Session) -> User | None:
    """
    Validate and consume a magic link token.
    Returns the associated User on success, None on invalid/expired/used.
    """
    record = db.get(MagicLinkToken, token)
    if not record:
        return None
    if record.purpose != purpose:
        return None
    if record.used_at is not None:
        return None
    now = _now()
    if record.expires_at < now:
        return None

    record.used_at = now
    db.add(record)
    db.commit()

    return db.get(User, record.user_id)


def send_admin_magic_link(email: str, db: Session) -> bool:
    """
    Look up admin user by email, generate a magic link, and 'send' it.
    During development: logs the link to stdout instead of sending email.
    Returns True if a user was found and the link was generated, False otherwise.
    """
    from app.config import settings

    user = db.exec(select(User).where(User.email == email)).first()
    if not user or user.role != "admin":
        # Don't reveal whether the email exists — always return True to avoid enumeration
        logger.info("[MAGIC LINK] No admin user found for email=%s (suppressed for security)", email)
        return True

    token = create_magic_link(user, "admin_login", db)
    login_url = f"{settings.app_base_url}/admin/auth/{token}"

    # DEV: log to stdout instead of sending email
    logger.warning(
        "\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        "  MAGIC LINK (dev — not emailed)\n"
        "  User : %s <%s>\n"
        "  URL  : %s\n"
        "  TTL  : %d minutes\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        user.name, user.email, login_url, MAGIC_LINK_TTL_MINUTES,
    )
    return True


# ─── Admin session ─────────────────────────────────────────────────────────────

def create_admin_session(user: User, request_headers: dict, db: Session) -> str:
    """Create a server-side admin session. Returns session ID."""
    session_id = str(uuid.uuid4())
    user_agent = request_headers.get("user-agent", "")
    device_hint = user_agent[:120] if user_agent else None

    db.add(AuthSession(
        id=session_id,
        user_id=user.id,
        session_type="admin",
        device_hint=device_hint,
        expires_at=_expires_at(days=ADMIN_SESSION_TTL_DAYS),
        last_active_at=_now(),
    ))
    db.commit()
    return session_id


def get_admin_user_from_session(session_id: str | None, db: Session) -> User | None:
    """Resolve admin identity from session cookie. Returns None if invalid/expired."""
    if not session_id:
        return None

    auth_session = db.get(AuthSession, session_id)
    if not auth_session:
        return None
    if auth_session.session_type != "admin":
        return None
    if auth_session.revoked_at is not None:
        return None
    now = _now()
    if auth_session.expires_at < now:
        return None

    # Touch last_active_at (best-effort, don't fail the request if this fails)
    try:
        auth_session.last_active_at = now
        db.add(auth_session)
        db.commit()
    except Exception:
        pass

    user = db.get(User, auth_session.user_id)
    if not user or user.role != "admin":
        return None
    return user


def revoke_admin_session(session_id: str, db: Session) -> None:
    auth_session = db.get(AuthSession, session_id)
    if auth_session:
        auth_session.revoked_at = _now()
        db.add(auth_session)
        db.commit()
