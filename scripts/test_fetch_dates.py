"""Test SerpApi fetch for specific movie + dates."""
import asyncio, sys
sys.path.insert(0, ".")
# Load production env for real key
from dotenv import load_dotenv
load_dotenv(".env.production", override=True)
from app.services.showtime_service import fetch_showtimes_from_serpapi, parse_serpapi_showtimes

MOVIE = "Project Hail Mary"
THEATER_QUERY = "Cinemark Cedar Park Texas showtimes"
THEATER_ID = 1
EVENT_ID = 1
POLL_ID = 1
DATES = ["2026-03-21", "2026-03-22"]

async def main():
    for date in DATES:
        query = f"{MOVIE} {THEATER_QUERY}"
        print(f"\nQuerying: {query!r} for {date}")
        try:
            raw = await fetch_showtimes_from_serpapi(query, date)
            showtimes = raw.get("showtimes", [])
            error = raw.get("error")
            if error:
                print(f"  API ERROR: {error}")
                continue
            print(f"  showtimes blocks: {len(showtimes)}")
            for block in showtimes:
                print(f"    day={block.get('day')} theaters={len(block.get('theaters', []))}")
            parsed = parse_serpapi_showtimes(raw, MOVIE, THEATER_ID, EVENT_ID, POLL_ID, date, "Cinemark Cedar Park")
            print(f"  parsed sessions: {len(parsed)}")
            for s in parsed:
                print(f"    {s['session_date']} {s['session_time']} {s['format']}")
        except Exception as e:
            print(f"  EXCEPTION: {type(e).__name__}: {e}")

asyncio.run(main())
