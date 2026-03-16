from sqlmodel import Session, select
from app.models import Venue


def get_all_theaters(db: Session) -> list[Venue]:
    return db.exec(select(Venue).order_by(Venue.name)).all()


def get_active_theaters(db: Session) -> list[Venue]:
    return db.exec(
        select(Venue).where(Venue.is_active == True).order_by(Venue.name)
    ).all()


def get_theater(theater_id: int, db: Session) -> Venue:
    t = db.get(Venue, theater_id)
    if not t:
        raise ValueError("Theater not found")
    return t


def add_theater(name: str, address: str, website_url: str | None, serpapi_query: str, db: Session, showtime_url_pattern: str | None = None) -> Venue:
    t = Venue(name=name, address=address, website_url=website_url, serpapi_query=serpapi_query, showtime_url_pattern=showtime_url_pattern, is_active=True)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def toggle_theater(theater_id: int, db: Session) -> Venue:
    t = db.get(Venue, theater_id)
    if not t:
        raise ValueError("Theater not found")
    t.is_active = not t.is_active
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def update_theater(
    theater_id: int,
    name: str | None,
    address: str | None,
    website_url: str | None,
    serpapi_query: str | None,
    is_active: bool | None,
    db: Session,
    showtime_url_pattern: str | None = None,
) -> Venue:
    t = db.get(Venue, theater_id)
    if not t:
        raise ValueError("Theater not found")
    if name is not None:
        t.name = name
    if address is not None:
        t.address = address
    if website_url is not None:
        t.website_url = website_url
    if serpapi_query is not None:
        t.serpapi_query = serpapi_query
    if showtime_url_pattern is not None:
        t.showtime_url_pattern = showtime_url_pattern
    if is_active is not None:
        t.is_active = is_active
    db.add(t)
    db.commit()
    db.refresh(t)
    return t
