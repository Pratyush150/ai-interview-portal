"""Manual client onboarding CLI — one-shot lead → workspace conversion.

Usage:
    python -m backend.scripts.provision_company --lead-id <id>
    python -m backend.scripts.provision_company --name "Acme Tech" --email owner@acme.com [--contact-name "Priya"]

What it does:
    1. Inserts (or reuses) a `companies` row with a unique slug.
    2. Generates a one-time setup_token valid for 7 days.
    3. Sends the owner an email with the setup link.
    4. (If converting from a lead) marks the lead as 'onboarded'.
    5. Prints the setup URL to stdout — useful when SMTP is mocked.
"""

from __future__ import annotations

import argparse
import secrets
import sys
import uuid
from datetime import datetime, timedelta

from backend.database import (
    DEMO_COMPANY_NAME,
    audit,
    get_db,
    init_db,
    slugify,
    unique_slug,
)
from backend.email_service import send_owner_setup_email


def provision(
    *,
    company_name: str,
    owner_email: str,
    owner_name: str | None = None,
    lead_id: str | None = None,
    expires_in_days: int = 7,
) -> dict:
    init_db()
    conn = get_db()
    try:
        slug = unique_slug(conn, slugify(company_name))
        existing = conn.execute(
            "SELECT id, slug FROM companies WHERE name=? OR email=?",
            (company_name, owner_email),
        ).fetchone()
        if existing:
            company_id = existing["id"]
            slug = existing["slug"] or slug
            print(f"[provision] reusing existing company {company_name} (slug={slug})")
        else:
            company_id = uuid.uuid4().hex[:12]
            conn.execute(
                "INSERT INTO companies "
                "(id, name, email, slug, status, plan) "
                "VALUES (?,?,?,?,?,?)",
                (company_id, company_name, owner_email, slug, "active", "trial"),
            )
            print(f"[provision] inserted company {company_name} (slug={slug})")

        setup_token = secrets.token_urlsafe(24)
        expires_at = (
            datetime.utcnow() + timedelta(days=expires_in_days)
        ).isoformat(timespec="seconds")
        conn.execute(
            "UPDATE companies SET setup_token=?, setup_token_expires_at=? "
            "WHERE id=?",
            (setup_token, expires_at, company_id),
        )

        if lead_id:
            res = conn.execute(
                "UPDATE leads SET status='onboarded', converted_company_id=? "
                "WHERE id=?",
                (company_id, lead_id),
            )
            if res.rowcount:
                print(f"[provision] lead {lead_id} marked onboarded")

        conn.commit()
    finally:
        conn.close()

    email_result = send_owner_setup_email(
        owner_email=owner_email,
        owner_name=owner_name,
        company_name=company_name,
        slug=slug,
        setup_token=setup_token,
    )
    audit(
        "company_provisioned",
        actor="cli",
        target=slug,
        metadata=f"lead_id={lead_id or '-'};email={owner_email}",
    )
    return {
        "company_id": company_id,
        "slug": slug,
        "setup_token": setup_token,
        "expires_at": expires_at,
        "email_status": email_result.get("status"),
    }


def _from_lead(lead_id: str) -> dict:
    init_db()
    conn = get_db()
    row = conn.execute(
        "SELECT company_name, contact_name, email FROM leads WHERE id=?",
        (lead_id,),
    ).fetchone()
    conn.close()
    if not row:
        print(f"[provision] no lead with id={lead_id}", file=sys.stderr)
        sys.exit(2)
    name = (row["company_name"] or row["contact_name"] or "").strip()
    if not name or name.lower() == DEMO_COMPANY_NAME.lower():
        print(f"[provision] lead {lead_id} has no usable company name", file=sys.stderr)
        sys.exit(3)
    return provision(
        company_name=name,
        owner_email=row["email"],
        owner_name=row["contact_name"],
        lead_id=lead_id,
    )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Provision a new client workspace.")
    p.add_argument("--lead-id", help="Provision from an existing /api/leads row")
    p.add_argument("--name", help="Company name (when not converting from a lead)")
    p.add_argument("--email", help="Owner email")
    p.add_argument("--contact-name", help="Owner display name (optional)")
    args = p.parse_args(argv)

    if args.lead_id:
        result = _from_lead(args.lead_id)
    elif args.name and args.email:
        result = provision(
            company_name=args.name,
            owner_email=args.email,
            owner_name=args.contact_name,
        )
    else:
        p.error("Provide --lead-id OR (--name and --email)")
        return 2

    base_url = (
        __import__("os").getenv("BASE_URL") or "http://localhost:8000"
    ).rstrip("/")
    setup_url = f"{base_url}/onboard/?slug={result['slug']}&token={result['setup_token']}"
    print()
    print("=" * 64)
    print(f" Workspace:    {result['slug']}")
    print(f" Setup URL:    {setup_url}")
    print(f" Expires at:   {result['expires_at']}  (UTC)")
    print(f" Email status: {result['email_status']}")
    print("=" * 64)
    return 0


if __name__ == "__main__":
    sys.exit(main())
