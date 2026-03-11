import base64
import secrets
from fastapi import Request, HTTPException
from app.config import settings


def verify_admin(request: Request) -> None:
    """Verify HTTP Basic Auth credentials for admin routes."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Basic "):
        raise HTTPException(
            status_code=401,
            detail="Admin authentication required",
            headers={"WWW-Authenticate": 'Basic realm="GroupGo Admin"'},
        )
    try:
        decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
        username, password = decoded.split(":", 1)
    except Exception:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": 'Basic realm="GroupGo Admin"'},
        )

    valid_user = secrets.compare_digest(username, settings.ADMIN_USERNAME)
    valid_pass = secrets.compare_digest(password, settings.ADMIN_PASSWORD)
    if not (valid_user and valid_pass):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": 'Basic realm="GroupGo Admin"'},
        )
