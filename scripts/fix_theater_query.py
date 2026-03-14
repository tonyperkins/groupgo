"""Fix the serpapi_query for Cinemark Cedar Park to use name+state format."""
import sys
sys.path.insert(0, "/app")
from sqlmodel import Session, create_engine, select
from app.models import Venue
from app.config import settings

engine = create_engine(settings.DATABASE_URL)
with Session(engine) as db:
    theaters = db.exec(select(Venue)).all()
    for t in theaters:
        print(f"id={t.id} name={t.name!r} serpapi_query={t.serpapi_query!r}")
        if "Cedar Park" in t.name and "1335" in (t.serpapi_query or ""):
            t.serpapi_query = "Cinemark Cedar Park Texas showtimes"
            db.add(t)
            print(f"  -> Updated to: {t.serpapi_query!r}")
    db.commit()
    print("Done.")
