import sys
sys.path.insert(0, "/app")
from app.config import settings
print("SERPAPI_KEY set:", bool(settings.SERPAPI_KEY))
print("SERPAPI_KEY len:", len(settings.SERPAPI_KEY))
print("SERPAPI_KEY prefix:", settings.SERPAPI_KEY[:8] if settings.SERPAPI_KEY else "EMPTY")
print("APP_ENV:", settings.APP_ENV)
