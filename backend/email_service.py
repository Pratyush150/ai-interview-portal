"""Email service for sending interview invitations. Falls back to mock mode."""
import os
import smtplib
import uuid
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from backend.database import get_db

load_dotenv()


def send_interview_invite(
    candidate_email: str,
    candidate_name: str,
    job_title: str,
    invite_token: str,
) -> dict:
    """Send interview invite email. Returns status dict."""
    smtp_host = os.getenv("SMTP_HOST")
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    base_url = os.getenv("BASE_URL", "http://localhost:8000")

    interview_url = f"{base_url}/?token={invite_token}"

    subject = f"Interview Invitation: {job_title}"
    body_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #3b82f6;">AI Interview Portal</h2>
        <p>Hi {candidate_name},</p>
        <p>You have been invited to take an AI-powered technical interview for the position of <strong>{job_title}</strong>.</p>
        <p>Click the button below to start your interview:</p>
        <p style="text-align: center; margin: 30px 0;">
            <a href="{interview_url}" style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                Start Interview
            </a>
        </p>
        <p style="font-size: 0.9em; color: #666;">This link is unique to you. Do not share it.</p>
        <p style="font-size: 0.9em; color: #666;">Good luck!</p>
    </div>
    """
    body_text = (
        f"Hi {candidate_name},\n\n"
        f"You have been invited to take an AI-powered technical interview for: {job_title}.\n\n"
        f"Start your interview: {interview_url}\n\n"
        f"This link is unique to you. Do not share it.\nGood luck!"
    )

    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart("alternative")
            msg["From"] = smtp_user
            msg["To"] = candidate_email
            msg["Subject"] = subject
            msg.attach(MIMEText(body_text, "plain"))
            msg.attach(MIMEText(body_html, "html"))

            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)

            _log_email(candidate_email, subject, body_text, "sent")
            return {"status": "sent", "url": interview_url}
        except Exception as e:
            _log_email(candidate_email, subject, body_text, f"failed: {e}")
            return {"status": "failed", "error": str(e), "url": interview_url}
    else:
        # Mock mode
        _log_email(candidate_email, subject, body_text, "mock_sent")
        print(f"[MOCK EMAIL] To: {candidate_email} | Subject: {subject}")
        print(f"[MOCK EMAIL] Interview URL: {interview_url}")
        return {"status": "mock_sent", "url": interview_url}


def _log_email(to_addr: str, subject: str, body: str, status: str):
    try:
        db = get_db()
        db.execute(
            "INSERT INTO email_log (id, to_addr, subject, body, status) VALUES (?,?,?,?,?)",
            (uuid.uuid4().hex[:12], to_addr, subject, body, status),
        )
        db.commit()
        db.close()
    except Exception:
        pass
