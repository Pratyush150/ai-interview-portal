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

    interview_url = f"{base_url}/i/?token={invite_token}"

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


def _send_or_mock(to_addr: str, subject: str, body_text: str, body_html: str | None = None) -> dict:
    """Internal: send via SMTP if configured, else log + print + mock-return."""
    smtp_host = os.getenv("SMTP_HOST")
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    if smtp_host and smtp_user and smtp_pass:
        try:
            msg = MIMEMultipart("alternative")
            msg["From"] = smtp_user
            msg["To"] = to_addr
            msg["Subject"] = subject
            msg.attach(MIMEText(body_text, "plain"))
            if body_html:
                msg.attach(MIMEText(body_html, "html"))
            with smtplib.SMTP(smtp_host, smtp_port) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
            _log_email(to_addr, subject, body_text, "sent")
            return {"status": "sent"}
        except Exception as e:
            _log_email(to_addr, subject, body_text, f"failed: {e}")
            return {"status": "failed", "error": str(e)}
    _log_email(to_addr, subject, body_text, "mock_sent")
    print(f"[MOCK EMAIL] To: {to_addr} | Subject: {subject}")
    print(f"[MOCK EMAIL] Body: {body_text[:300]}")
    return {"status": "mock_sent"}


def send_lead_notification(lead: dict) -> dict:
    """Notify internal sales when a new lead lands in /api/leads."""
    sales_to = os.getenv("SALES_NOTIFY_EMAIL", "sales@aperture.demo")
    subject = f"[APERTURE] New lead: {lead.get('company_name') or lead.get('contact_name')}"
    lines = [
        f"Lead ID:       {lead.get('id')}",
        f"Kind:          {lead.get('kind')}",
        f"Company:       {lead.get('company_name') or '—'}",
        f"Contact:       {lead.get('contact_name')}",
        f"Email:         {lead.get('email')}",
        f"Phone:         {lead.get('phone') or '—'}",
        f"Hiring volume: {lead.get('role_count') or '—'}",
        f"Source:        {lead.get('source')}",
        "",
        "Use case:",
        (lead.get('use_case') or '—'),
        "",
        f"Convert with:  python -m backend.scripts.provision_company --lead-id {lead.get('id')}",
    ]
    return _send_or_mock(sales_to, subject, "\n".join(lines))


def send_owner_setup_email(
    owner_email: str,
    owner_name: str | None,
    company_name: str,
    slug: str,
    setup_token: str,
) -> dict:
    """Send the welcome email with a one-time setup link."""
    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    setup_url = f"{base_url}/onboard/?slug={slug}&token={setup_token}"
    greeting = owner_name.strip() if owner_name else "there"
    subject = f"Welcome to APERTURE — set up {company_name}"
    body_text = (
        f"Hi {greeting},\n\n"
        f"Your APERTURE workspace for {company_name} is ready.\n\n"
        f"Set your password and access the dashboard:\n{setup_url}\n\n"
        f"This link expires in 7 days. If it expires, reply to this email and "
        f"we'll send a fresh one.\n\n"
        f"— APERTURE\n"
    )
    body_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
        <h2 style="color:#4f46e5;">Welcome to APERTURE</h2>
        <p>Hi {greeting},</p>
        <p>Your APERTURE workspace for <strong>{company_name}</strong> is ready.</p>
        <p style="text-align:center; margin: 28px 0;">
            <a href="{setup_url}" style="background:#4f46e5; color:white; padding:12px 28px; text-decoration:none; border-radius:8px; font-weight:600;">
                Set password &amp; sign in
            </a>
        </p>
        <p style="font-size:0.9em; color:#666;">This link expires in 7 days.</p>
    </div>
    """
    return _send_or_mock(owner_email, subject, body_text, body_html)
