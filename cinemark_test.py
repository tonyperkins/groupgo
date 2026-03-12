import asyncio
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

async def get_cinemark_showtimes(theater_url: str, target_date: str, movie_title: str):
    print(f"Starting Playwright script for '{movie_title}' at {theater_url} on {target_date}")
    
    async with async_playwright() as p:
        # Launching in headed mode so you can see the interaction and bypass simple bot checks
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            viewport={"width": 1280, "height": 800}
        )
        page = await context.new_page()

        # Go to the theater page
        print(f"Navigating to: {theater_url}")
        
        try:
            # Go to the page and wait for the network to be mostly idle
            await page.goto(theater_url, wait_until="domcontentloaded", timeout=30000)
            
            # Wait for a brief moment to allow dynamic React content to load
            await page.wait_for_timeout(3000)
        except PlaywrightTimeoutError:
            print("Timeout waiting for page to load. Proceeding to check DOM anyway...")
        except Exception as e:
            print(f"Error loading page: {e}")
            return

        # Find and click the specific date button
        try:
            print(f"Selecting date: {target_date}")
            
            # Use the correct selector found in the HTML dump
            date_link = page.locator(f"a[data-datevalue='{target_date}']")
            
            if await date_link.count() > 0:
                # The element might be off-screen in the carousel, so we force click or scroll it into view
                await date_link.first.scroll_into_view_if_needed()
                await date_link.first.click(force=True)
                print("Clicked date link. Waiting for showtimes to update...")
                
                # Wait for the network to settle after clicking the date
                await page.wait_for_timeout(3000)
            else:
                print(f"⚠️ Could not find date link for {target_date}. The date might be too far in the future.")
        except Exception as e:
            print(f"Error selecting date: {e}")

        # Scroll down to trigger any lazy-loaded movie sections
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight/2)")
        await page.wait_for_timeout(1000)
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(2000)

        print(f"Searching for movie: {movie_title}")
        
        # Look for the movie title text specifically in an h3 tag (which is used in the showtimes list)
        movie_elements = page.locator(f"h3:has-text('{movie_title}')")
        count = await movie_elements.count()
        
        if count == 0:
            print(f"❌ Could not find movie '{movie_title}' in the showtimes list on the page.")
            print("Tip: Check if the movie is actually playing on this date or if the title string matches exactly.")
            
            # fallback to any text match
            movie_elements = page.locator(f"text='{movie_title}'")
            count = await movie_elements.count()
            if count == 0:
                await browser.close()
                return
            else:
                print(f"Found {count} matches for the title, but not in the expected h3 heading format.")

        print(f"✅ Found {count} element(s) matching the movie title.")
        
        # Get the first matching title element and find its parent container (movie card)
        movie_header = movie_elements.nth(0)
        
        # We try to find the container holding this movie's showtimes. 
        # Cinemark typically uses a wrapper div with class 'showtimeMovieBlock'
        movie_card = movie_header.locator("xpath=./ancestor::div[contains(@class, 'showtimeMovieBlock')][1]")
        
        card_count = await movie_card.count()
        if card_count > 0:
            print("✅ Found the movie container.")
            # Find all links inside this specific movie container that point to the TicketSeatMap
            showtime_links = movie_card.locator("a[href*='TicketSeatMap']").all()
        else:
            print("⚠️ Could not isolate the specific movie container. Searching the whole page for showtime links...")
            showtime_links = page.locator("a[href*='TicketSeatMap']").all()
        
        links = await showtime_links
        print(f"Found {len(links)} showtime links.")
        
        results = []
        for link in links:
            href = await link.get_attribute("href")
            time_text = (await link.inner_text()).strip()
            
            if not href:
                continue
            
            # Parse the URL to extract the required IDs
            # Example href: /TicketSeatMap/?TheaterId=1130&ShowtimeId=12345&CinemarkMovieId=9876&Showtime=2024-05-20T19:30:00
            parsed_url = urlparse(href)
            query_params = parse_qs(parsed_url.query)
            
            theater_id = query_params.get("TheaterId", [""])[0]
            showtime_id = query_params.get("ShowtimeId", [""])[0]
            movie_id = query_params.get("CinemarkMovieId", [""])[0]
            showtime = query_params.get("Showtime", [""])[0]
            
            if theater_id and showtime_id and movie_id:
                # Construct the deep link as requested
                deep_link = f"https://www.cinemark.com/TicketSeatMap/?TheaterId={theater_id}&ShowtimeId={showtime_id}&CinemarkMovieId={movie_id}&Showtime={showtime}"
                
                results.append({
                    "time": time_text,
                    "theater_id": theater_id,
                    "showtime_id": showtime_id,
                    "movie_id": movie_id,
                    "showtime_iso": showtime,
                    "deep_link": deep_link
                })
        
        if results:
            print("\n🎟️  EXTRACTED SHOWTIMES:")
            print("-" * 50)
            for res in results:
                print(f"Time: {res['time']}")
                print(f"  ShowtimeId:      {res['showtime_id']}")
                print(f"  CinemarkMovieId: {res['movie_id']}")
                print(f"  TheaterId:       {res['theater_id']}")
                print(f"  Link:            {res['deep_link']}\n")
        else:
            print("❌ No valid showtimes found. The DOM structure might have changed or tickets aren't on sale.")

        await browser.close()

if __name__ == "__main__":
    # ---------------------------------------------------------
    # CONFIGURATION
    # ---------------------------------------------------------
    # Example URL: Find your local theater's URL on Cinemark
    THEATER_URL = "https://www.cinemark.com/theatres/tx-pflugerville/cinemark-pflugerville-20-and-xd"
    
    # Needs to be a valid future date in YYYY-MM-DD format
    TARGET_DATE = "2026-03-21" 
    
    # Must match the text on the page exactly (case-sensitive usually)
    MOVIE_TITLE = "Project Hail Mary"
    
    print("Ensure you have updated the THEATER_URL, TARGET_DATE, and MOVIE_TITLE in the script before running.")
    asyncio.run(get_cinemark_showtimes(THEATER_URL, TARGET_DATE, MOVIE_TITLE))
