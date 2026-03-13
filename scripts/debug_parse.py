"""Debug exactly what parse_serpapi_showtimes sees for the prod query."""
import asyncio, sys, json
sys.path.insert(0, ".")
from dotenv import load_dotenv
load_dotenv(".env.production", override=True)
from app.services.showtime_service import fetch_showtimes_from_serpapi, parse_serpapi_showtimes, _parse_day_string

MOVIE = "Project Hail Mary"
THEATER_QUERY = "Cinemark Cedar Park Texas showtimes"
DATE = "2026-03-21"
THEATER_NAME = "Cinemark Cedar Park"

async def main():
    query = f"{MOVIE} {THEATER_QUERY}"
    raw = await fetch_showtimes_from_serpapi(query, DATE)
    showtimes_list = raw.get("showtimes", [])
    print(f"showtimes blocks: {len(showtimes_list)}")
    for block in showtimes_list:
        day_str = block.get("day", "")
        parsed_date = _parse_day_string(day_str, DATE)
        theaters = block.get("theaters", [])
        print(f"  day={day_str!r} -> parsed={parsed_date!r} match={parsed_date == DATE} theaters={len(theaters)}")
        for t in theaters:
            tname = t.get("name", "")
            name_match = THEATER_NAME.lower() in tname.lower() or tname.lower() in THEATER_NAME.lower()
            showings = t.get("showing", [])
            print(f"    theater={tname!r} name_match={name_match} showing={len(showings)}")
            if name_match and parsed_date == DATE:
                for s in showings:
                    print(f"      type={s.get('type')!r} time={s.get('time')!r}")

asyncio.run(main())
