# Project Brief: Family Movie Coordinator (MVP)

## 1. Project Overview

A lightweight, mobile-first web application designed to eliminate the friction of scheduling family movie outings for a group of five. The app solves the 3D coordination problem (Movie × Location × Date/Time) using a "curated polling" model. An admin generates a weekly shortlist of movies and scraped showtimes, and users vote via a frictionless mobile UI using independent approval with veto power.

## 2. Core Workflows

**The Admin Flow (Curator):**

1. Admin searches for a movie title. App fetches rich metadata (poster, synopsis, trailer) via TMDB API.
2. Admin selects target dates (e.g., upcoming Friday/Saturday).
3. Backend asynchronously queries Google Search (via SerpApi) to scrape real-world showtimes at predefined local theaters.
4. Backend deduplicates the data and caches it in a local SQLite database.
5. Admin publishes the poll and shares a single URL with the group.

**The Voter Flow (Family):**

1. User clicks the URL on their phone.
2. Zero-friction authentication (e.g., a simple "Who are you?" dropdown or URL parameter `?user=alex`).
3. **Screen 1 (Movies):** User views movie options with embedded trailers/ratings. Toggles "Yes" or "No" for each.
4. **Screen 2 (Logistics):** User views available Day/Time/Theater combinations. Toggles "Can Do", "Can't Do" (Veto), or selects a global "I'm in, whatever you choose" bypass.
5. App instantly calculates and displays the winning combination based on maximum mutual approval, automatically eliminating any option with a veto.

## 3. Technical Architecture & Stack

The stack is heavily optimized for fast data delivery, minimal state management, and easy self-hosting.

* **Frontend:** HTML, Tailwind CSS, and HTMX. (No heavy SPA frameworks; UI interactions map directly to backend endpoints).
* **Backend:** Python with FastAPI. (Ideal for asynchronous API orchestration and routing).
* **Database:** SQLite. (Single file, perfectly scaled for a family of 5 and caching weekly API calls).
* **Deployment:** Dockerized container, managed via Portainer on a local Linux server.
* **Networking/Access:** Exposed securely to the outside world via a Cloudflare Tunnel (providing automatic HTTPS and bypassing the need for local firewall port forwarding or VPNs).

## 4. External Integrations & Caching Strategy

* **The Movie Database (TMDB) API:** Free tier. Used strictly for fetching high-quality movie metadata (posters, descriptions, cast, YouTube trailer IDs).
* **SerpApi (Google Search API):** Used to scrape Google's native movie showtime widget.
* **Constraint:** SerpApi provides 250 free searches per month.
* **Caching Requirement:** A single search only returns one day of showtimes. The backend must loop through the targeted weekend days (e.g., Fri/Sat/Sun), execute the queries, and cache the JSON payloads in SQLite. The frontend MUST ONLY read from the SQLite database, never triggering SerpApi directly.



## 5. Key Engineering Constraints & Edge Cases

* **Geographic Balancing:** The theater query logic should account for the commute spread between Leander and North Austin (e.g., specifically targeting theaters like Cinemark Cedar Park or Domain area to ensure fair drive times).
* **Schedule Drop Timing:** Theaters typically publish weekend schedules on Wednesdays. The app's admin workflow should be optimized for a Wednesday/Thursday generation cadence.
* **Showtime Deduplication:** SerpApi returns raw strings (e.g., "7:00 PM (Standard)" vs. "7:00 PM (3D)"). The backend must parse and group these intelligently so the UI matrix doesn't become overwhelmingly cluttered.
* **V2 Future-Proofing (Scope Containment):** V1 is strictly built for movie data. However, database tables should be named generically (e.g., `Events` instead of `Movies`, `Sessions` instead of `Showtimes`) and include an `is_custom_event` boolean flag. This allows a future pivot to generic family event planning (e.g., lunches) without a massive schema migration.

