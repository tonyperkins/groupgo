import sys
sys.path.insert(0, "/app")
from app.config import settings
print("APP_ENV:", settings.APP_ENV)
print("is_production:", settings.is_production)
print("SMTP_USER:", repr(settings.SMTP_USER))
print("SMTP_HOST:", settings.SMTP_HOST)
print("SMTP_PORT:", settings.SMTP_PORT)
print("SMTP_FROM:", repr(settings.SMTP_FROM))
