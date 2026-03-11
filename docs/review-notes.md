# GroupGo Project Review & Areas for Improvement

## 1. UI/UX Assessment & Redesign Plan

### 1.1 Visual Design
* **Color Palette & Contrast**: The current Slate/Indigo theme is functional but feels a bit heavy and flat. 
  * *Improvement*: Introduce more depth using softer card backgrounds, subtle box-shadows (even in dark mode), and more vibrant accent colors for primary actions. Use more modern Tailwind UI patterns (like ring borders instead of flat borders).
* **Typography**: The hierarchy is occasionally lost due to similar font sizes and weights.
  * *Improvement*: Use larger, bolder headings. Increase contrast for secondary text. Add better tracking and line-heights.
* **Component Styling (Buttons, Cards, Inputs)**:
  * *Improvement*: Round borders further (e.g., `rounded-xl` or `rounded-2xl` for cards, `rounded-lg` for buttons) for a friendlier, modern feel. Buttons should have clear hover/active states with slight scale transforms and brighter colors.
  * *Improvement*: Movie cards in both Admin and Voter views need to be richer. Posters should be more prominent, and metadata (runtime, rating) should be styled as neat pill badges.

### 1.2 User Flow & UX (Admin)
* **Poll Management**: The Dashboard lists polls, but the progression isn't immediately obvious.
  * *Improvement*: Redesign the poll cards to clearly separate `DRAFT`, `OPEN`, and `ARCHIVED` states using distinct visual grouping or tabs.
* **Creation Flow**: Creating a poll is just adding dates. Adding movies and showtimes feels like separate disjointed pages.
  * *Improvement*: Implement a Stepper or improved breadcrumb navigation within a Poll's view (`Movies` -> `Showtimes` -> `Review & Publish`). This guides the admin naturally.
* **Showtimes Management**: The Showtimes page is cluttered with multiple forms (Fetch, Manual Add, Filters).
  * *Improvement*: Organize the Showtimes page into distinct visual sections with clear hierarchies. Use a more structured table or card layout for cached showtimes.

### 1.3 User Flow & UX (Voter)
* **Desktop vs Mobile**: The app is "mobile-first", but on desktop, the content looks either awkwardly wide or strangely centered without a bounding container.
  * *Improvement*: Constrain the voter experience to a `max-w-md` or `max-w-lg` container that resembles a mobile screen, even on desktop, centered on the page with a subtle shadow/border.
* **Voting Progress**: Voters go from Identify -> Movies -> Logistics.
  * *Improvement*: Add a simple progress bar or step indicator (e.g., "Step 1 of 2: Rate Movies") so voters know how long the process will take.

## 2. Codebase & Architecture Improvements

While reviewing the codebase, the following areas were identified as candidates for future improvement (beyond the scope of this UI/UX rework):

### 2.1 Backend / FastAPI
* **Dependency Injection**: Currently, routes might be directly calling services or DB connections. Expanding the use of FastAPI's `Depends` for service classes and DB sessions would make the code more testable and modular.
* **Error Handling**: Some API endpoints return plain text or simple dicts on error. Implement a global exception handler and standardized API error response models (e.g., using a base `APIResponse` model).
* **Background Tasks**: The `fetch_tasks.py` runs tasks in the background. As the app scales, moving from simple `BackgroundTasks` to a more robust queueing system like Celery or RQ (or at least `arq` with Redis) would prevent the web server from being bogged down by SerpApi limits or timeouts.

### 2.2 Frontend / HTMX
* **Component Modularity**: Jinja templates have some duplicated components (e.g., movie cards). Creating more granular Jinja macros or includes for reusable UI elements (Buttons, Badges, Movie Cards) would DRY up the templates.
* **State Management**: Using `localStorage` for theme is good, but standardizing how flash messages/toasts and transient state are handled across HTMX swaps (e.g., using `HX-Trigger` headers to trigger client-side toasts) would clean up inline JavaScript.

### 2.3 Database
* **Migrations**: The project uses simple SQLite with some manual migrations (noted in past memories). Adopting `Alembic` for structured schema migrations would be safer for long-term maintenance.
* **Data Pruning**: Since SerpApi fetches consume quota, adding a scheduled job to prune old unused showtimes or orphaned data would keep the SQLite DB lightweight.
