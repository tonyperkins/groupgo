import urllib.request, json, sys

key = "REDACTED_SERPAPI_KEY"

queries = [
    "Project Hail Mary showtimes",
    "Project Hail Mary AMC showtimes",
    "Project Hail Mary AMC Lakeline showtimes",
    "Project Hail Mary AMC Lakeline 9 Cedar Park Texas showtimes",
]

import urllib.parse

def check(q):
    params = urllib.parse.urlencode({"engine": "google", "q": q, "api_key": key, "hl": "en", "gl": "us"})
    with urllib.request.urlopen(f"https://serpapi.com/search?{params}") as r:
        data = json.load(r)
    showtimes = data.get("showtimes", [])
    all_theaters = {t.get('name') for b in showtimes for t in b.get('theaters', [])}
    total_showings = sum(len(t.get('showing',[])) for b in showtimes for t in b.get('theaters',[]))
    print(f"Q={q!r}")
    print(f"  day_blocks={len(showtimes)}, unique_theaters={len(all_theaters)}, total_showings={total_showings}")
    if all_theaters:
        print(f"  theaters: {sorted(all_theaters)}")
    print()

for q in queries:
    check(q)
