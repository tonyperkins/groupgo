from app.db import engine
from sqlmodel import Session
from app.models import Venue

with Session(engine) as s:
    v = s.get(Venue, 2)
    if v:
        v.serpapi_query = "AMC Lakeline 9 Cedar Park Texas showtimes"
        s.add(v)
        s.commit()
        print(f"Updated: {v.name!r} -> {v.serpapi_query!r}")
    else:
        print("Venue 2 not found")
