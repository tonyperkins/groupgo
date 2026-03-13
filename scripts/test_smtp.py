"""Test Gmail SMTP directly from inside the container."""
import smtplib
import sys
from email.mime.text import MIMEText

sys.path.insert(0, "/app")
from app.config import settings

print(f"SMTP_USER: {settings.SMTP_USER!r}")
print(f"SMTP_PASSWORD length: {len(settings.SMTP_PASSWORD)}")
print(f"SMTP_HOST: {settings.SMTP_HOST}")
print(f"SMTP_PORT: {settings.SMTP_PORT}")

msg = MIMEText("This is a test email from GroupGo SMTP test script.")
msg["Subject"] = "GroupGo SMTP test"
msg["From"] = settings.SMTP_USER
msg["To"] = settings.SMTP_USER

print("\nConnecting to SMTP...")
try:
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.set_debuglevel(1)
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.sendmail(settings.SMTP_USER, settings.SMTP_USER, msg.as_string())
    print("\nSUCCESS: Email sent.")
except Exception as e:
    print(f"\nFAILED: {type(e).__name__}: {e}")
