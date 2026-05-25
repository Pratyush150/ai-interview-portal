"""SQLite database for persistent storage of candidates, sessions, and evaluations."""
import hashlib
import os
import re
import sqlite3
import uuid
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "portal.db"

DEMO_COMPANY_NAME = "DemoCorp"
DEMO_COMPANY_SLUG = "democorp"
DEMO_COMPANY_PASSWORD = "demo1234"
DEMO_COMPANY_EMAIL = "hr@democorp.test"


def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, decl: str):
    """Lightweight migration — add column if missing."""
    cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")


def slugify(name: str) -> str:
    """Turn a company name into a URL-safe slug."""
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")
    return s or "company"


def unique_slug(conn: sqlite3.Connection, base: str, ignore_id: str | None = None) -> str:
    """Return `base` if unused, else `base-2`, `base-3`, ..."""
    candidate = base
    n = 1
    while True:
        q = "SELECT id FROM companies WHERE slug=?"
        params: list = [candidate]
        if ignore_id:
            q += " AND id<>?"
            params.append(ignore_id)
        row = conn.execute(q, params).fetchone()
        if not row:
            return candidate
        n += 1
        candidate = f"{base}-{n}"


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS candidates (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS resumes (
            id TEXT PRIMARY KEY,
            candidate_id TEXT REFERENCES candidates(id),
            filename TEXT,
            raw_text TEXT,
            skills_json TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS companies (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT,
            password_hash TEXT,
            auth_token TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            company_id TEXT REFERENCES companies(id),
            title TEXT,
            description TEXT,
            required_skills TEXT,
            role_family TEXT DEFAULT 'software_engineering',
            seniority TEXT DEFAULT 'mid',
            min_experience_years REAL DEFAULT 0,
            max_experience_years REAL DEFAULT 40,
            department TEXT DEFAULT '',
            employment_type TEXT DEFAULT 'full_time',
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS applications (
            id TEXT PRIMARY KEY,
            job_id TEXT REFERENCES jobs(id),
            candidate_id TEXT REFERENCES candidates(id),
            resume_id TEXT REFERENCES resumes(id),
            session_id TEXT,
            status TEXT DEFAULT 'pending',
            invite_token TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS interview_sessions (
            id TEXT PRIMARY KEY,
            candidate_id TEXT REFERENCES candidates(id),
            resume_id TEXT,
            job_id TEXT,
            stage TEXT DEFAULT 'intro',
            status TEXT DEFAULT 'active',
            cheating_flags TEXT DEFAULT '[]',
            total_score REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS eval_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT REFERENCES interview_sessions(id),
            turn_number INTEGER,
            stage TEXT,
            score REAL,
            correctness REAL,
            depth REAL,
            communication REAL,
            relevance REAL,
            topic TEXT,
            strengths TEXT,
            weaknesses TEXT,
            notes TEXT,
            ai_likelihood REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS email_log (
            id TEXT PRIMARY KEY,
            to_addr TEXT,
            subject TEXT,
            body TEXT,
            status TEXT,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL DEFAULT 'company',
            company_name TEXT,
            contact_name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            role_count INTEGER,
            use_case TEXT,
            source TEXT DEFAULT 'contact_form',
            status TEXT DEFAULT 'new',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            converted_company_id TEXT REFERENCES companies(id)
        );
        CREATE TABLE IF NOT EXISTS interview_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id TEXT,
            job_id TEXT,
            application_id TEXT,
            session_id TEXT,
            event TEXT NOT NULL,
            metadata TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor TEXT,
            action TEXT NOT NULL,
            target TEXT,
            metadata TEXT,
            ip TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS aptitude_questions (
            id TEXT PRIMARY KEY,
            company_id TEXT REFERENCES companies(id),
            category TEXT DEFAULT 'general',
            question_text TEXT NOT NULL,
            options_json TEXT NOT NULL,
            correct_index INTEGER NOT NULL,
            difficulty TEXT DEFAULT 'easy',
            active INTEGER DEFAULT 1,
            position INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS aptitude_attempts (
            id TEXT PRIMARY KEY,
            application_id TEXT REFERENCES applications(id),
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP,
            status TEXT DEFAULT 'in_progress',
            score INTEGER,
            total INTEGER,
            answers_json TEXT
        );
    """)

    # ── Migrations on existing tables (additive only) ─────────────────────

    for col, decl in [
        ("role_family",           "TEXT DEFAULT 'software_engineering'"),
        ("seniority",             "TEXT DEFAULT 'mid'"),
        ("min_experience_years",  "REAL DEFAULT 0"),
        ("max_experience_years",  "REAL DEFAULT 40"),
        ("department",            "TEXT DEFAULT ''"),
        ("employment_type",       "TEXT DEFAULT 'full_time'"),
        # New: aptitude gate. Default 0 for additive safety on EXISTING jobs
        # (legacy seeded mock JDs). The seed step below explicitly turns it
        # ON for DemoCorp's jobs, and create-job endpoints default new jobs
        # to 1. Old flows therefore never see the gate unless we opt them in.
        ("aptitude_required",     "INTEGER DEFAULT 0"),
        ("aptitude_pass_score",   "INTEGER DEFAULT 6"),
        ("aptitude_total",        "INTEGER DEFAULT 10"),
        ("aptitude_duration_min", "INTEGER DEFAULT 10"),
    ]:
        _ensure_column(conn, "jobs", col, decl)

    for col, decl in [
        ("interview_brief_json",  "TEXT"),
        ("report_json",           "TEXT"),
        ("target_duration_min",   "REAL DEFAULT 22"),
        ("role_family",           "TEXT"),
        ("seniority",             "TEXT"),
        # Tenant isolation: every session is owned by the company that posted
        # the job. Backfilled below for legacy rows.
        ("company_id",            "TEXT"),
    ]:
        _ensure_column(conn, "interview_sessions", col, decl)

    _ensure_column(conn, "eval_records", "candidate_excerpt", "TEXT")

    for col, decl in [
        ("password_hash",  "TEXT"),
        ("auth_token",     "TEXT"),
    ]:
        _ensure_column(conn, "candidates", col, decl)

    # Companies grow tenant-aware columns: a URL-safe slug for /c/<slug> routes,
    # status/plan for billing & suspension hooks, and a setup_token used by the
    # owner-onboarding flow (lead → provision → set password).
    for col, decl in [
        ("slug",                     "TEXT"),
        ("logo_url",                 "TEXT"),
        ("brand_color",              "TEXT"),
        ("status",                   "TEXT DEFAULT 'active'"),
        ("plan",                     "TEXT DEFAULT 'trial'"),
        ("interview_quota_monthly",  "INTEGER DEFAULT 50"),
        ("setup_token",              "TEXT"),
        ("setup_token_expires_at",   "TIMESTAMP"),
    ]:
        _ensure_column(conn, "companies", col, decl)

    # Ensure slug uniqueness — only enforced once columns exist.
    conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug)")

    # Applications: invite-token lifecycle.
    for col, decl in [
        ("invite_expires_at",   "TIMESTAMP"),
        ("invite_used_at",      "TIMESTAMP"),
        ("invite_revoked_at",   "TIMESTAMP"),
        ("created_by_company",  "TEXT"),  # the company that generated this link
        # New: aptitude gate state. 'skipped' = job doesn't require aptitude;
        # 'pending' = required but not started; 'in_progress' = active attempt;
        # 'passed'/'failed' = terminal. Only 'passed' (or 'skipped') opens
        # /api/session. 'failed' is final — locked out, no retry.
        ("aptitude_status",        "TEXT DEFAULT 'pending'"),
        ("aptitude_score",         "INTEGER"),
        ("aptitude_started_at",    "TIMESTAMP"),
        ("aptitude_completed_at",  "TIMESTAMP"),
    ]:
        _ensure_column(conn, "applications", col, decl)

    # Aptitude question bank: enforce uniqueness of (company, position) so
    # the dashboard ordering is stable.
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_aptitude_q_company ON aptitude_questions(company_id, active)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_aptitude_a_application ON aptitude_attempts(application_id)"
    )

    conn.commit()

    # ── One-shot backfill: aptitude gate for pre-existing applications ─────
    # The new `aptitude_status` column defaults to 'pending'. For applications
    # created BEFORE the gate existed, that would mean every old invite link
    # is now blocked from starting an interview. We use sqlite's
    # `PRAGMA user_version` as a one-shot flag: if it's < 1, run the
    # grandfather backfill exactly once and bump it.
    schema_version = conn.execute("PRAGMA user_version").fetchone()[0]
    if schema_version < 1:
        conn.execute(
            "UPDATE applications SET aptitude_status='skipped' "
            "WHERE aptitude_status='pending'"
        )
        conn.execute("PRAGMA user_version = 1")
        conn.commit()

    # ── Backfills ─────────────────────────────────────────────────────────

    # 1) Companies missing a slug get one derived from their name.
    rows = conn.execute(
        "SELECT id, name FROM companies WHERE slug IS NULL OR slug=''"
    ).fetchall()
    for r in rows:
        base = slugify(r["name"] or "company")
        slug = unique_slug(conn, base, ignore_id=r["id"])
        conn.execute("UPDATE companies SET slug=? WHERE id=?", (slug, r["id"]))

    # 2) interview_sessions missing company_id: derive from job → company_id.
    conn.execute(
        """
        UPDATE interview_sessions
        SET company_id = (
            SELECT j.company_id FROM jobs j WHERE j.id = interview_sessions.job_id
        )
        WHERE company_id IS NULL AND job_id IS NOT NULL
        """
    )

    conn.commit()
    _seed_demo_company(conn)
    _seed_aptitude_bank(conn)
    conn.close()


def _seed_demo_company(conn: sqlite3.Connection) -> None:
    """Seed a mock company + one JD per role family if not already present.

    Running this is idempotent — we look up by company name and only insert
    missing JDs (matched by exact title).
    """
    from backend.interview.role_profiles import MOCK_JDS

    row = conn.execute(
        "SELECT id, slug FROM companies WHERE name=?", (DEMO_COMPANY_NAME,)
    ).fetchone()
    if row:
        company_id = row["id"]
        if not row["slug"]:
            conn.execute(
                "UPDATE companies SET slug=? WHERE id=?",
                (DEMO_COMPANY_SLUG, company_id),
            )
    else:
        company_id = uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO companies (id, name, email, password_hash, auth_token, slug, status, plan) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                company_id,
                DEMO_COMPANY_NAME,
                DEMO_COMPANY_EMAIL,
                hash_password(DEMO_COMPANY_PASSWORD),
                uuid.uuid4().hex,
                DEMO_COMPANY_SLUG,
                "active",
                "trial",
            ),
        )

    existing_titles = {
        r["title"] for r in conn.execute(
            "SELECT title FROM jobs WHERE company_id=?", (company_id,)
        ).fetchall()
    }
    for jd in MOCK_JDS:
        if jd["title"] in existing_titles:
            continue
        conn.execute(
            """
            INSERT INTO jobs
                (id, company_id, title, description, required_skills,
                 role_family, seniority, min_experience_years, max_experience_years,
                 department, employment_type, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?, 'active')
            """,
            (
                uuid.uuid4().hex[:12], company_id,
                jd["title"], jd["description"], jd["required_skills"],
                jd["role_family"], jd["seniority"],
                jd["min_experience_years"], jd["max_experience_years"],
                jd.get("department", ""), jd.get("employment_type", "full_time"),
            ),
        )
    # Turn the aptitude gate ON for ALL DemoCorp jobs (existing + just-inserted).
    # The global migration default is 0 for safety on other tenants, but for
    # the demo we want the feature actually exercised.
    conn.execute(
        "UPDATE jobs SET aptitude_required=1 WHERE company_id=? AND aptitude_required=0",
        (company_id,),
    )
    conn.commit()


# Default mock aptitude bank. 10 MCQs — light logical / quant / verbal mix
# typical of a pre-screen. Recruiters can edit, add, or delete from the
# dashboard; only `active=1` rows are served to candidates. Indexes into
# `options` are 0-based.
_MOCK_APTITUDE_QUESTIONS: list[dict] = [
    {
        "category": "quantitative",
        "question_text": "If a train covers 120 km in 2 hours, what is its average speed?",
        "options": ["40 km/h", "50 km/h", "60 km/h", "80 km/h"],
        "correct_index": 2,
        "difficulty": "easy",
    },
    {
        "category": "logical",
        "question_text": "Which number completes the series: 2, 4, 8, 16, __ ?",
        "options": ["20", "24", "30", "32"],
        "correct_index": 3,
        "difficulty": "easy",
    },
    {
        "category": "verbal",
        "question_text": "Choose the word most similar in meaning to 'meticulous'.",
        "options": ["Careless", "Thorough", "Hasty", "Random"],
        "correct_index": 1,
        "difficulty": "easy",
    },
    {
        "category": "quantitative",
        "question_text": "20% of 250 is:",
        "options": ["25", "40", "50", "60"],
        "correct_index": 2,
        "difficulty": "easy",
    },
    {
        "category": "logical",
        "question_text": "All roses are flowers. Some flowers fade quickly. Therefore:",
        "options": [
            "All roses fade quickly.",
            "Some roses may fade quickly.",
            "No roses fade quickly.",
            "All flowers are roses.",
        ],
        "correct_index": 1,
        "difficulty": "medium",
    },
    {
        "category": "quantitative",
        "question_text": "If 5 workers build a wall in 10 days, how many days will 10 workers take? (assume same rate)",
        "options": ["2 days", "5 days", "10 days", "20 days"],
        "correct_index": 1,
        "difficulty": "easy",
    },
    {
        "category": "verbal",
        "question_text": "Pick the odd one out:",
        "options": ["Apple", "Banana", "Carrot", "Mango"],
        "correct_index": 2,
        "difficulty": "easy",
    },
    {
        "category": "logical",
        "question_text": "If MONDAY is coded as NPOEBZ, how is FRIDAY coded?",
        "options": ["GSJEBZ", "GSKEBZ", "GSJFBZ", "GSJEAZ"],
        "correct_index": 0,
        "difficulty": "medium",
    },
    {
        "category": "quantitative",
        "question_text": "A product costs ₹400 after a 20% discount. What was the original price?",
        "options": ["₹450", "₹480", "₹500", "₹520"],
        "correct_index": 2,
        "difficulty": "medium",
    },
    {
        "category": "verbal",
        "question_text": "Choose the correctly spelt word.",
        "options": ["Accomodation", "Acommodation", "Accommodation", "Acomodation"],
        "correct_index": 2,
        "difficulty": "easy",
    },
]


def _seed_aptitude_bank(conn: sqlite3.Connection) -> None:
    """Seed the default 10-question aptitude bank for DemoCorp.

    Idempotent: only inserts if the company has zero active questions.
    Other companies must populate via the dashboard CRUD endpoints — we do
    NOT auto-seed for them so we don't surprise paying tenants with our
    mock content.
    """
    row = conn.execute(
        "SELECT id FROM companies WHERE name=?", (DEMO_COMPANY_NAME,)
    ).fetchone()
    if not row:
        return
    company_id = row["id"]
    existing = conn.execute(
        "SELECT COUNT(*) AS n FROM aptitude_questions WHERE company_id=? AND active=1",
        (company_id,),
    ).fetchone()
    if existing and existing["n"]:
        return
    import json as _json
    for i, q in enumerate(_MOCK_APTITUDE_QUESTIONS):
        conn.execute(
            "INSERT INTO aptitude_questions "
            "(id, company_id, category, question_text, options_json, correct_index, difficulty, active, position) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (
                uuid.uuid4().hex[:12], company_id,
                q["category"], q["question_text"],
                _json.dumps(q["options"]), q["correct_index"],
                q["difficulty"], 1, i,
            ),
        )
    conn.commit()


def hash_password(password: str) -> str:
    """Hash a password using SHA-256 with a random salt. Returns 'salt$hash'."""
    salt = os.urandom(16).hex()
    hashed = hashlib.sha256((salt + password).encode()).hexdigest()
    return f"{salt}${hashed}"


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against a 'salt$hash' string."""
    if "$" not in password_hash:
        return False
    salt, stored_hash = password_hash.split("$", 1)
    computed = hashlib.sha256((salt + password).encode()).hexdigest()
    return computed == stored_hash


def log_event(
    event: str,
    *,
    company_id: str | None = None,
    job_id: str | None = None,
    application_id: str | None = None,
    session_id: str | None = None,
    metadata: str | None = None,
) -> None:
    """Append-only event log used by the dashboard & analytics."""
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO interview_events "
            "(company_id, job_id, application_id, session_id, event, metadata) "
            "VALUES (?,?,?,?,?,?)",
            (company_id, job_id, application_id, session_id, event, metadata),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass


def audit(
    action: str,
    *,
    actor: str | None = None,
    target: str | None = None,
    metadata: str | None = None,
    ip: str | None = None,
) -> None:
    """Append a row to the audit log. Used for staff-style actions
    (provisioning, suspension, link revocation) that we want to be able to
    explain after the fact."""
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO audit_log (actor, action, target, metadata, ip) "
            "VALUES (?,?,?,?,?)",
            (actor, action, target, metadata, ip),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass
