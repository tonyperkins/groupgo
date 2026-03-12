from __future__ import annotations

import asyncio
import json
import re
import sys

from app.services.showtime_service import fetch_showtimes_from_serpapi


PATTERNS = {
    "ticketseatmap": re.compile(r"ticketseatmap", re.IGNORECASE),
    "theater_id": re.compile(r"theaterid", re.IGNORECASE),
    "showtime_id": re.compile(r"showtimeid", re.IGNORECASE),
    "cinemark_movie_id": re.compile(r"cinemarkmovieid", re.IGNORECASE),
    "utm_google": re.compile(r"utm_source=google", re.IGNORECASE),
    "cinemark_domain": re.compile(r"cinemark\.com", re.IGNORECASE),
}


def walk(obj: object, path: str = "root") -> list[tuple[str, str]]:
    hits: list[tuple[str, str]] = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            key_path = f"{path}.{key}"
            for label, pattern in PATTERNS.items():
                if pattern.search(str(key)):
                    hits.append((key_path, f"<key-match:{label}>"))
            hits.extend(walk(value, key_path))
        return hits
    if isinstance(obj, list):
        for index, value in enumerate(obj):
            hits.extend(walk(value, f"{path}[{index}]"))
        return hits
    if isinstance(obj, str):
        for label, pattern in PATTERNS.items():
            if pattern.search(obj):
                hits.append((path, obj))
                break
    return hits


async def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: python scripts/debug_serpapi_showtimes.py \"<query>\" <YYYY-MM-DD>")
        return 1

    query = sys.argv[1]
    date = sys.argv[2]
    raw = await fetch_showtimes_from_serpapi(query, date)

    print("TOP-LEVEL KEYS:")
    print(sorted(raw.keys()))
    print()

    showtimes = raw.get("showtimes", [])
    print(f"SHOWTIME DAY BLOCKS: {len(showtimes)}")
    print()

    for day_index, day_block in enumerate(showtimes[:2], start=1):
        print(f"DAY BLOCK {day_index}:")
        print(json.dumps(day_block, indent=2)[:12000])
        print()

    hits = walk(raw)
    print(f"MATCHES: {len(hits)}")
    for path, value in hits[:100]:
        print(f"- {path}: {value}")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
