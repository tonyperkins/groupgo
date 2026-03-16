import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger(__name__)


def _smtp_configured() -> bool:
    return bool(settings.SMTP_USER and settings.SMTP_PASSWORD and settings.SMTP_HOST)


def send_email(to_address: str, subject: str, body_text: str, body_html: str | None = None) -> bool:
    """Send a single email. Returns True on success, False on failure."""
    if not _smtp_configured():
        logger.warning("SMTP not configured — skipping email to %s", to_address)
        return False

    from_addr = settings.SMTP_FROM or settings.SMTP_USER
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_address

    msg.attach(MIMEText(body_text, "plain"))
    if body_html:
        msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(from_addr, to_address, msg.as_string())
        logger.info("Email sent to %s: %s", to_address, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_address, exc)
        return False


def send_poll_invite(
    to_address: str,
    voter_name: str,
    poll_title: str,
    invite_url: str,
) -> bool:
    """Notify a member that a new poll is open and ready for their vote."""
    subject = f"You're invited to vote: {poll_title}"
    body_text = (
        f"Hi {voter_name},\n\n"
        f"A new GroupGo poll is open: \"{poll_title}\".\n"
        f"Click the link below to view the options and cast your vote:\n\n"
        f"{invite_url}\n\n"
        f"Thanks!"
    )
    body_html = (
        f"<p>Hi {voter_name},</p>"
        f"<p>A new GroupGo poll is open: <strong>{poll_title}</strong>.</p>"
        f"<p><a href=\"{invite_url}\" style=\"display:inline-block;padding:10px 20px;"
        f"background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;"
        f"font-weight:bold;\">Vote Now</a></p>"
        f"<p style='color:#888;font-size:12px'>Or copy this URL: {invite_url}</p>"
        f"<p>Thanks!</p>"
    )
    return send_email(to_address, subject, body_text, body_html)


def send_revote_notification(
    to_address: str,
    voter_name: str,
    poll_title: str,
    invite_url: str,
) -> bool:
    """Notify a voter that votes were cleared and they should re-vote."""
    subject = f"Please re-vote: {poll_title}"
    body_text = (
        f"Hi {voter_name},\n\n"
        f"The admin has reset the votes for \"{poll_title}\".\n"
        f"Please visit the link below to cast your vote again:\n\n"
        f"{invite_url}\n\n"
        f"Thanks!"
    )
    body_html = (
        f"<p>Hi {voter_name},</p>"
        f"<p>The admin has reset the votes for <strong>{poll_title}</strong>.</p>"
        f"<p>Please <a href=\"{invite_url}\">click here to re-vote</a>.</p>"
        f"<p>Thanks!</p>"
    )
    return send_email(to_address, subject, body_text, body_html)
