from datetime import datetime
from fastapi.templating import Jinja2Templates

templates = Jinja2Templates(directory="templates")


def _display_time(value: str) -> str:
    """Convert '19:30' → '7:30 PM'"""
    try:
        t = datetime.strptime(value, "%H:%M")
        hour = t.hour
        minute = t.minute
        period = "AM" if hour < 12 else "PM"
        h = hour % 12 or 12
        return f"{h}:{minute:02d} {period}"
    except Exception:
        return value


def _display_date(value: str) -> str:
    """Convert '2026-03-14' → 'Saturday, March 14'"""
    try:
        d = datetime.strptime(value, "%Y-%m-%d")
        return d.strftime(f"%A, %B {d.day}")
    except Exception:
        return value


def _short_date(value: str) -> str:
    """Convert '2026-03-14' → 'Sat Mar 14'"""
    try:
        d = datetime.strptime(value, "%Y-%m-%d")
        return d.strftime(f"%a %b {d.day}")
    except Exception:
        return value


def _urlencode(value: str) -> str:
    """URL-encode a single string value."""
    from urllib.parse import quote_plus
    return quote_plus(str(value)) if value else ""


def _fromjson(value: str) -> list:
    """Parse a JSON string to a Python object (list/dict)."""
    if not value:
        return []
    try:
        import json
        return json.loads(value)
    except Exception:
        return []


templates.env.filters["display_time"] = _display_time
templates.env.filters["display_date"] = _display_date
templates.env.filters["short_date"] = _short_date
templates.env.filters["fromjson"] = _fromjson
templates.env.filters["urlencode"] = _urlencode
