import re
import json
import urllib.parse
from urllib.request import Request, urlopen
from html.parser import HTMLParser

class CinemarkHTMLParser(HTMLParser):
    def __init__(self, movie_title):
        super().__init__()
        self.movie_title = movie_title
        self.in_target_movie_block = False
        self.current_movie_title = None
        self.in_h3 = False
        self.showtimes = []
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        # Check if we are entering a showtime movie block
        if tag == "div" and "class" in attrs_dict and "showtimeMovieBlock" in attrs_dict["class"]:
            self.in_target_movie_block = False
            self.current_movie_title = None
            
        if tag == "h3":
            self.in_h3 = True
            
        # If we found the correct block, look for showtime links
        if self.in_target_movie_block and tag == "a":
            href = attrs_dict.get("href", "")
            if "TicketSeatMap" in href:
                parsed_url = urllib.parse.urlparse(href)
                query_params = urllib.parse.parse_qs(parsed_url.query)
                
                theater_id = query_params.get("TheaterId", [""])[0]
                showtime_id = query_params.get("ShowtimeId", [""])[0]
                movie_id = query_params.get("CinemarkMovieId", [""])[0]
                showtime = query_params.get("Showtime", [""])[0]
                
                # Try to extract the time text from aria-label
                aria_label = attrs_dict.get("aria-label", "")
                time_match = re.search(r'Select (.*?) showtime', aria_label)
                time_text = time_match.group(1) if time_match else "Unknown"
                
                if theater_id and showtime_id and movie_id:
                    self.showtimes.append({
                        "time": time_text,
                        "theater_id": theater_id,
                        "showtime_id": showtime_id,
                        "movie_id": movie_id,
                        "showtime_iso": showtime,
                        "deep_link": f"https://www.cinemark.com{href}"
                    })

    def handle_data(self, data):
        if self.in_h3:
            title = data.strip()
            if title:
                self.current_movie_title = title
                # If the title matches, we are in the correct block
                if self.movie_title.lower() in title.lower():
                    self.in_target_movie_block = True

    def handle_endtag(self, tag):
        if tag == "h3":
            self.in_h3 = False

def fetch_cinemark_showtimes(theater_url, target_date, movie_title):
    print(f"Fetching {theater_url}?showDate={target_date}")
    
    # We need to construct the URL with the showDate parameter.
    # Note: As seen in the playwright test, sometimes the server redirects or ignores the param 
    # and requires clicking the button. We'll test if the raw HTML contains the correct date showtimes.
    url = f"{theater_url}?showDate={target_date}"
    
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'})
    
    try:
        with urlopen(req) as response:
            html = response.read().decode('utf-8')
            
            # Check if the response was blocked by Cloudflare/Incapsula
            if "Just a moment..." in html or "Cloudflare" in html or "Incapsula" in html:
                print("❌ Request was blocked by anti-bot protection (Cloudflare/Incapsula).")
                print("The Playwright approach is required to bypass this protection.")
                return
            
            print(f"Successfully fetched HTML ({len(html)} bytes). Parsing...")
            
            parser = CinemarkHTMLParser(movie_title)
            parser.feed(html)
            
            if not parser.showtimes:
                print(f"❌ No showtimes found for '{movie_title}'.")
                print(f"The HTML might not contain the showtimes for {target_date}, as they may be loaded dynamically or require a POST/interaction.")
                return
                
            print("\n🎟️  EXTRACTED SHOWTIMES:")
            print("-" * 50)
            for res in parser.showtimes:
                print(f"Time: {res['time']}")
                print(f"  ShowtimeId:      {res['showtime_id']}")
                print(f"  CinemarkMovieId: {res['movie_id']}")
                print(f"  TheaterId:       {res['theater_id']}")
                print(f"  Link:            {res['deep_link']}\n")
                
    except Exception as e:
        print(f"Error fetching URL: {e}")

if __name__ == "__main__":
    THEATER_URL = "https://www.cinemark.com/theatres/tx-pflugerville/cinemark-pflugerville-20-and-xd"
    TARGET_DATE = "2026-03-21" 
    MOVIE_TITLE = "Project Hail Mary"
    
    fetch_cinemark_showtimes(THEATER_URL, TARGET_DATE, MOVIE_TITLE)
