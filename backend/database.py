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
    """Lightweight migration — add column if missing. Idempotent and safe
    under concurrent workers: if another process adds the column between the
    PRAGMA check and the ALTER, SQLite raises 'duplicate column name', which
    we swallow (the column now exists either way)."""
    cols = {r["name"] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in cols:
        try:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
        except sqlite3.OperationalError as e:
            if "duplicate column name" not in str(e).lower():
                raise


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
        CREATE TABLE IF NOT EXISTS coding_problems (
            id TEXT PRIMARY KEY,
            company_id TEXT REFERENCES companies(id),
            role_family TEXT,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            hint TEXT DEFAULT '',
            examples_json TEXT DEFAULT '[]',
            boilerplate TEXT DEFAULT '',
            active INTEGER DEFAULT 1,
            position INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS consents (
            id TEXT PRIMARY KEY,
            application_id TEXT REFERENCES applications(id),
            candidate_id TEXT,
            notice_version TEXT NOT NULL,
            acknowledged INTEGER DEFAULT 1,
            ip TEXT,
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        # Compliance (NYC Local Law 144 / EU AI Act): require an AEDT use
        # notice + consent before any assessment, and allow the candidate to
        # request an alternative (non-AI) assessment. Default 0 for additive
        # safety — existing jobs and old invite links are unaffected until a
        # recruiter (or the demo seed below) opts in.
        ("aedt_notice_required",   "INTEGER DEFAULT 0"),
        ("alt_assessment_enabled", "INTEGER DEFAULT 0"),
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
        # Compliance: candidate's alternative-assessment request state.
        # '' = none requested; 'requested' = candidate asked; 'granted' /
        # 'declined' = recruiter acted. Purely additive; never gates anything.
        ("alt_assessment_status",  "TEXT DEFAULT ''"),
    ]:
        _ensure_column(conn, "applications", col, decl)

    # Aptitude question bank: enforce uniqueness of (company, position) so
    # the dashboard ordering is stable.
    # Aptitude bank: optional role tagging so a company can curate per-role
    # question sets. NULL means "general" and is served as a fallback for
    # any role that has no role-specific questions yet.
    _ensure_column(conn, "aptitude_questions", "role_family", "TEXT")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_aptitude_q_company ON aptitude_questions(company_id, active)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_aptitude_q_role ON aptitude_questions(company_id, role_family, active)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_aptitude_a_application ON aptitude_attempts(application_id)"
    )
    # Additive: recruiter-authored starter/boilerplate code the candidate
    # fills in (so they write only the logic). Empty string = no boilerplate.
    _ensure_column(conn, "coding_problems", "boilerplate", "TEXT DEFAULT ''")
    # Gap 2 — AI-aware coding: per-problem policy on AI assistance.
    # 'forbidden' (default, = today's behaviour) | 'allowed' | 'required'.
    _ensure_column(conn, "coding_problems", "ai_policy", "TEXT DEFAULT 'forbidden'")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_coding_problems_company ON coding_problems(company_id, active)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_coding_problems_role ON coding_problems(company_id, role_family, active)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_consents_application ON consents(application_id)"
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
    # v2: heal applications that got 'skipped' from the v1 backfill but
    # whose job actually requires aptitude — they were silently bypassing
    # the gate. Resets to 'pending' so candidates see the test on next
    # visit. 'passed'/'failed' are terminal and untouched.
    if schema_version < 2:
        conn.execute(
            """
            UPDATE applications SET aptitude_status='pending'
            WHERE aptitude_status='skipped'
              AND job_id IN (SELECT id FROM jobs WHERE aptitude_required=1)
            """
        )
        conn.execute("PRAGMA user_version = 2")
        conn.commit()
    # v3: enforce "every served coding problem has examples". v1 seeded
    # 1 problem per role with no examples; the v2 seed adds two new ones
    # WITH examples but couldn't touch the v1 row when the title differed.
    # Disable any active row that has no examples — the recruiter can
    # re-enable manually if they want a no-example problem.
    if schema_version < 3:
        try:
            conn.execute(
                """
                UPDATE coding_problems SET active=0
                WHERE active=1
                  AND (examples_json IS NULL OR TRIM(examples_json)='' OR examples_json='[]')
                """
            )
            conn.execute("PRAGMA user_version = 3")
            conn.commit()
        except Exception:
            pass
    # v4: re-enable rows that the v3 cleanup disabled but a later
    # ensure_coding_bank() filled with examples. Without this, half the
    # engineering roles end up with only 1 active role-specific problem.
    # Safe-by-construction: only flips active=1 if (a) examples_json now
    # has content AND (b) the title is in our seed bank — a recruiter
    # disabling a custom problem is untouched.
    if schema_version < 4:
        try:
            from json import loads as _jl
            # Build seed-title set once.
            seed_titles: set[str] = set()
            try:
                seed_titles.add(_GENERIC_CODING["title"])
                for problems in _ROLE_CODING_PROBLEMS.values():
                    lst = problems if isinstance(problems, list) else [problems]
                    for p in lst:
                        seed_titles.add(p["title"])
            except Exception:
                pass
            rows = conn.execute(
                "SELECT id, title, examples_json FROM coding_problems WHERE active=0"
            ).fetchall()
            for r in rows:
                if r["title"] not in seed_titles:
                    continue
                try:
                    if _jl(r["examples_json"] or "[]"):
                        conn.execute(
                            "UPDATE coding_problems SET active=1 WHERE id=?",
                            (r["id"],),
                        )
                except Exception:
                    continue
            conn.execute("PRAGMA user_version = 4")
            conn.commit()
        except Exception:
            pass

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
    # Backfill aptitude banks for EVERY existing tenant so no company is left
    # with an empty bank, and force aptitude_required=1 on every active job
    # — otherwise the gate silently skips for jobs created before this
    # migration. Tenants that have curated their own bank are no-ops because
    # ensure_aptitude_bank only inserts where the relevant slice is empty.
    for r in conn.execute("SELECT id FROM companies").fetchall():
        ensure_aptitude_bank(conn, r["id"])
        ensure_coding_bank(conn, r["id"])
    conn.execute(
        "UPDATE jobs SET aptitude_required=1 WHERE aptitude_required=0"
    )
    conn.commit()
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
    # Exercise the compliance gate on the demo too (off by default elsewhere).
    conn.execute(
        "UPDATE jobs SET aedt_notice_required=1, alt_assessment_enabled=1 "
        "WHERE company_id=? AND aedt_notice_required=0",
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


# Per-role aptitude pack. Three role-tagged MCQs per family, layered on top
# of the 10 generic questions so every role gets a slightly different mix
# but no role has to ship its own 10-question bank to be playable. The
# query layer prefers role_family matches and falls back to NULL/general
# rows so a partially-curated bank still serves a full 10-question round.
_ROLE_APTITUDE_PACKS: dict[str, list[dict]] = {
    "software_engineering": [
        {
            "category": "technical",
            "question_text": "Big-O of binary search on a sorted array is:",
            "options": ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Which data structure offers average O(1) insert AND O(1) lookup?",
            "options": ["Balanced BST", "Hash map", "Sorted array", "Linked list"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A race condition is best avoided by:",
            "options": ["Adding more threads", "Synchronizing shared state via locks or message passing", "Using global variables", "Catching all exceptions"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "mobile_engineering": [
        {
            "category": "technical",
            "question_text": "On both iOS and Android, doing heavy work on the main thread causes:",
            "options": ["Faster rendering", "Frame drops / ANRs", "Lower memory usage", "Battery savings"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "An offline-first mobile feature must:",
            "options": ["Refuse writes when offline", "Queue local writes and reconcile when online", "Always block until network returns", "Disable the UI"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Code-push / OTA updates typically apply to:",
            "options": ["Native machine code", "JavaScript/HTML/CSS bundles in hybrid apps", "Device firmware", "Provisioning profiles"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "genai_engineering": [
        {
            "category": "technical",
            "question_text": "Retrieval-augmented generation (RAG) primarily addresses:",
            "options": ["Latency", "Hallucinations by grounding on retrieved context", "Tokenization", "Cost per request only"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Temperature in an LLM controls:",
            "options": ["Maximum tokens", "Sampling randomness", "Cost", "Context window size"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Embeddings are useful because they:",
            "options": ["Encrypt prompts", "Map text to dense vectors enabling similarity search", "Speed up tokenization", "Replace fine-tuning"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "database_engineering": [
        {
            "category": "technical",
            "question_text": "A B-tree index on (a, b) supports an efficient lookup by:",
            "options": ["b alone", "a alone, or (a, b)", "Any combination", "Only b descending"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "MVCC means:",
            "options": ["Multi-Version Concurrency Control", "Most Valuable Column Caching", "Multi-Versioned Cluster Cache", "Multi-Volume Crash Containment"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "VACUUM in Postgres primarily reclaims:",
            "options": ["RAM", "Dead tuple space and updates statistics", "Connections", "WAL"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "backend_engineering": [
        {
            "category": "technical",
            "question_text": "Which HTTP status code best indicates an idempotent retry was accepted but produced no new effect?",
            "options": ["200 OK", "201 Created", "204 No Content", "409 Conflict"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Two concurrent writers update the same row. The lost-update problem is best avoided by:",
            "options": [
                "Increasing the connection pool",
                "Optimistic concurrency with a version column",
                "Adding more application replicas",
                "Disabling auto-commit",
            ],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Which is the strongest consistency guarantee in a distributed key-value store?",
            "options": ["Eventual", "Read-your-writes", "Causal", "Linearizable"],
            "correct_index": 3,
            "difficulty": "medium",
        },
    ],
    "frontend_engineering": [
        {
            "category": "technical",
            "question_text": "Which Core Web Vital measures input responsiveness?",
            "options": ["LCP", "FID/INP", "CLS", "TTFB"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "React hydration mismatches typically arise when:",
            "options": [
                "Server and client render different markup for the same component",
                "useEffect runs twice in strict mode",
                "The bundler tree-shakes unused exports",
                "CSS-in-JS uses className",
            ],
            "correct_index": 0,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "The most reliable way to debounce a fast-firing input handler is:",
            "options": [
                "useMemo of the handler",
                "useCallback of the handler",
                "Trailing setTimeout cleared on each keystroke",
                "Wrapping in React.memo",
            ],
            "correct_index": 2,
            "difficulty": "easy",
        },
    ],
    "fullstack_engineering": [
        {
            "category": "technical",
            "question_text": "A zero-downtime column addition is safest if the new column is:",
            "options": ["NOT NULL with no default", "Nullable, backfilled in a separate step", "An auto-increment", "A computed expression"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "JWT vs session cookies — which is best when you must revoke immediately?",
            "options": ["JWT", "Server-side session id in a cookie", "Both are equivalent", "Neither — use OAuth always"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "CSRF protection is most necessary for which kind of endpoint?",
            "options": ["GET with no side effects", "Cookie-authenticated POST", "Bearer-authenticated POST", "Public JSON API with no auth"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
    "android_engineering": [
        {
            "category": "technical",
            "question_text": "On Android, process death can occur:",
            "options": ["Never", "Only on crash", "When the OS reclaims memory in the background", "Only on reboot"],
            "correct_index": 2,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A Kotlin coroutine launched in viewModelScope is cancelled when:",
            "options": ["The Activity pauses", "The ViewModel is cleared", "The fragment loses focus", "The user backgrounds the app"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Baseline Profiles primarily improve:",
            "options": ["APK size", "Cold-start time", "Battery", "Network throughput"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "ios_engineering": [
        {
            "category": "technical",
            "question_text": "ARC most resembles:",
            "options": ["Tracing GC", "Reference counting at compile time", "Manual malloc/free", "Stack-only allocation"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A SwiftUI @State value is preserved across:",
            "options": ["View re-creation", "App relaunch", "Both", "Neither"],
            "correct_index": 0,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "URLSession default queue executes completion handlers on:",
            "options": ["Main queue", "A serial background queue", "A delegate-configurable queue", "Whichever thread initiated the request"],
            "correct_index": 2,
            "difficulty": "medium",
        },
    ],
    "data_engineering": [
        {
            "category": "technical",
            "question_text": "Idempotent upserts in a streaming pipeline typically require:",
            "options": ["Auto-increment primary keys", "A natural or composite business key + merge", "Random UUIDs", "Wide tables"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Columnar storage (Parquet, ORC) helps most with:",
            "options": ["Random single-row lookups", "Analytical scans over a few columns", "Transactional writes", "Small message queues"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Watermarks in stream processing are used to:",
            "options": ["Compress events", "Reason about event-time completeness for late data", "Encrypt payloads", "Partition tables"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "data_science": [
        {
            "category": "quantitative",
            "question_text": "A p-value of 0.04 at α=0.05 means:",
            "options": [
                "The null is true with 4% probability",
                "The alternative is true with 96% probability",
                "Under the null, we'd see data this extreme ~4% of the time",
                "The effect size is 4%",
            ],
            "correct_index": 2,
            "difficulty": "medium",
        },
        {
            "category": "quantitative",
            "question_text": "Increasing statistical power requires:",
            "options": ["Smaller samples", "A smaller effect size", "Higher significance threshold (more α)", "Lowering noise / variance"],
            "correct_index": 3,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Stratified sampling helps most when:",
            "options": ["The population is homogeneous", "Subgroups have different variances and matter", "Data is already random", "You want bigger samples"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
    "ml_engineering": [
        {
            "category": "technical",
            "question_text": "Cross-validation primarily controls for:",
            "options": ["Overfitting", "Data leakage", "Class imbalance", "Slow training"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A model with high bias but low variance is best addressed by:",
            "options": ["More regularization", "A more expressive model / features", "More training data", "Smaller learning rate"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "For online serving with strict latency, the best feature store pattern is:",
            "options": ["Recompute on read", "Precomputed offline + cache lookup", "Train-time pipeline at serve time", "Random hashing"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "machine_learning": [  # alias used by some seeds
        {
            "category": "technical",
            "question_text": "Cross-validation primarily controls for:",
            "options": ["Overfitting", "Data leakage", "Class imbalance", "Slow training"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A model with high bias but low variance is best addressed by:",
            "options": ["More regularization", "A more expressive model / features", "More training data", "Smaller learning rate"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "ROC-AUC of 0.5 indicates:",
            "options": ["Perfect classifier", "Random-guess classifier", "Always-positive classifier", "Calibration error"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
    "devops_sre": [
        {
            "category": "technical",
            "question_text": "An SLO of 99.9% monthly availability gives roughly how much error budget?",
            "options": ["~4 minutes", "~43 minutes", "~7 hours", "~3 days"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "A canary deploy is best paired with:",
            "options": ["Manual smoke tests on prod", "Automated health checks + rollback", "Larger machines", "Bigger error budget"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "p99 latency is most useful because it:",
            "options": ["Hides outliers", "Reflects the tail real users feel", "Averages well", "Is cheaper to measure"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
    "devops_engineering": [  # alias
        {
            "category": "technical",
            "question_text": "Infrastructure-as-Code primarily improves:",
            "options": ["Auditable, reproducible provisioning", "Application latency", "Database throughput", "Frontend bundle size"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A blue/green deploy is best when you need:",
            "options": ["Fast rollback", "Zero infrastructure cost", "Lower CPU usage", "Smaller container images"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Which Linux signal does Kubernetes send first when terminating a pod?",
            "options": ["SIGKILL", "SIGTERM", "SIGHUP", "SIGSTOP"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "qa_automation": [
        {
            "category": "technical",
            "question_text": "A flaky test is best handled by:",
            "options": ["Marking it skipped", "Retrying silently in CI", "Quarantining + diagnosing the root cause", "Increasing timeouts"],
            "correct_index": 2,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "The testing pyramid suggests:",
            "options": ["Most tests should be E2E", "Most tests should be unit, fewer integration, fewest E2E", "Equal counts at each level", "No unit tests"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Page Object Model is mainly used to:",
            "options": ["Reduce browser memory", "Encapsulate UI selectors and actions", "Speed up tests", "Replace assertions"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "qa_testing": [  # alias
        {
            "category": "technical",
            "question_text": "Equivalence partitioning is a:",
            "options": ["Black-box test design technique", "White-box coverage metric", "Performance test pattern", "Type of mocking"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Boundary value analysis primarily targets:",
            "options": ["Off-by-one errors at edges", "Race conditions", "Network failures", "Database deadlocks"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Smoke tests are:",
            "options": ["Exhaustive regression", "Quick checks that the build is not catastrophically broken", "Load tests", "Security scans"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
    "security_engineering": [
        {
            "category": "technical",
            "question_text": "Defense in depth means:",
            "options": ["A single strong perimeter", "Layered controls so no single failure is fatal", "Always using encryption", "Avoiding open-source dependencies"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Which is NOT a parameterized-query benefit?",
            "options": ["Prevents SQL injection", "Plan reuse / caching", "Type safety", "Auto-encrypts data at rest"],
            "correct_index": 3,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "OAuth 2.0 access tokens should be:",
            "options": ["Permanent", "Long-lived and shared", "Short-lived and scoped", "Stored unencrypted in localStorage"],
            "correct_index": 2,
            "difficulty": "medium",
        },
    ],
    "cloud_engineering": [
        {
            "category": "technical",
            "question_text": "An S3 lifecycle policy is best used to:",
            "options": ["Encrypt data", "Tier old objects to cheaper storage", "Enable global replication", "Increase throughput"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "IAM least-privilege means:",
            "options": ["Grant admin then revoke later", "Grant only the permissions a workload needs", "Use root for automation", "Disable MFA"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "An ALB vs an NLB — pick NLB when you need:",
            "options": ["Path-based routing", "HTTP/2 termination", "Ultra-low latency Layer-4 forwarding", "Cognito auth"],
            "correct_index": 2,
            "difficulty": "medium",
        },
    ],
    "embedded_systems": [
        {
            "category": "technical",
            "question_text": "A volatile variable in C tells the compiler:",
            "options": ["Inline the access", "Do not cache its value across reads/writes", "It is constant", "It is thread-local"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Interrupt service routines should:",
            "options": ["Do heavy processing", "Be as short as possible", "Allocate memory", "Sleep on I/O"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "DMA is primarily used to:",
            "options": ["Encrypt memory", "Transfer data without CPU intervention", "Compress data", "Schedule threads"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
    "vlsi_engineering": [
        {
            "category": "technical",
            "question_text": "Setup time is the minimum interval BEFORE the clock edge during which:",
            "options": ["Data must be stable", "Clock must be high", "Reset must be low", "Output is sampled"],
            "correct_index": 0,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "A blocking assignment in Verilog (=) versus non-blocking (<=) — use non-blocking for:",
            "options": ["Combinational logic", "Sequential always blocks", "Initial blocks only", "Both are identical"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Static timing analysis ignores:",
            "options": ["Logical 0/1 values", "Clock topology", "Path delays", "Setup/hold checks"],
            "correct_index": 0,
            "difficulty": "medium",
        },
    ],
    "electrical_engineering": [
        {
            "category": "technical",
            "question_text": "Ohm's law states:",
            "options": ["V = IR", "P = IV²", "V = I/R", "R = VI"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "An RC low-pass filter's cutoff frequency is:",
            "options": ["2π × R × C", "R × C", "1 / (2π × R × C)", "R / C"],
            "correct_index": 2,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "The primary purpose of a flyback diode is to:",
            "options": ["Rectify AC", "Protect against inductive kickback", "Amplify signal", "Regulate voltage"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "mechanical_engineering": [
        {
            "category": "technical",
            "question_text": "Bernoulli's equation is conservation of:",
            "options": ["Mass", "Energy per unit volume along a streamline", "Momentum", "Charge"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "The Reynolds number indicates:",
            "options": ["Material hardness", "Ratio of inertial to viscous forces", "Thermal conductivity", "Elastic limit"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Yield strength is the stress at which:",
            "options": ["Material breaks", "Material starts permanent deformation", "Strain rate equals zero", "Temperature stops rising"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
    "product_management": [
        {
            "category": "technical",
            "question_text": "An A/B test shows your feature lifts revenue by 3% but increases support tickets by 30%. The best next step is:",
            "options": ["Ship it — revenue wins", "Kill it — support cost wins", "Investigate the ticket cause before deciding", "Run a longer test"],
            "correct_index": 2,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "RICE prioritization stands for:",
            "options": ["Revenue, Investment, Cost, Effort", "Reach, Impact, Confidence, Effort", "Risk, Importance, Complexity, Estimate", "Research, Implementation, Cost, Evaluation"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A North-Star metric should primarily reflect:",
            "options": ["Engineering output", "Revenue this quarter", "Long-term customer value", "Marketing spend"],
            "correct_index": 2,
            "difficulty": "medium",
        },
    ],
    "ux_ui_design": [
        {
            "category": "technical",
            "question_text": "The minimum recommended touch-target size on mobile is approximately:",
            "options": ["24×24 px", "32×32 px", "44×44 px", "64×64 px"],
            "correct_index": 2,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "WCAG AA requires a contrast ratio of at least:",
            "options": ["2.0:1", "3.0:1 for body text", "4.5:1 for body text", "10:1 for body text"],
            "correct_index": 2,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Hick's Law predicts:",
            "options": ["Decision time grows with the number of choices", "Larger targets are faster to click", "Users skim before they read", "Memory decays exponentially"],
            "correct_index": 0,
            "difficulty": "medium",
        },
    ],
    "sales": [
        {
            "category": "technical",
            "question_text": "BANT in sales qualification stands for:",
            "options": ["Budget, Authority, Need, Timeline", "Brand, Audience, Network, Trust", "Best-Available-Next-Time", "Business, Account, Negotiation, Terms"],
            "correct_index": 0,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "MEDDIC is most commonly used in:",
            "options": ["Inbound consumer sales", "Complex B2B / enterprise sales", "Retail walk-ins", "Cold email blasts"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "verbal",
            "question_text": "A customer says 'your product is too expensive.' The strongest response is to:",
            "options": ["Immediately offer a discount", "Walk away", "Ask what they're comparing it to and quantify value", "Mention competitors' weaknesses"],
            "correct_index": 2,
            "difficulty": "medium",
        },
    ],
    "marketing": [
        {
            "category": "technical",
            "question_text": "CTR stands for:",
            "options": ["Customer Transition Rate", "Click-Through Rate", "Conversion-To-Revenue", "Cost To Reach"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A 'last-touch' attribution model:",
            "options": ["Credits the first ad seen", "Credits only the last interaction before conversion", "Splits credit equally", "Uses ML to weight touches"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "CAC payback period measures:",
            "options": ["Time for a customer to recoup their fee", "Time for the company to recoup acquisition cost from a customer", "Time between purchase and refund", "Time to onboard a customer"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "hr_people": [
        {
            "category": "technical",
            "question_text": "Structured interviews predict job performance better than unstructured ones because:",
            "options": ["They are shorter", "They use the same questions and rubric for every candidate", "They include puzzles", "They rely on intuition"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "verbal",
            "question_text": "A manager reports that their team's eNPS has dropped 20 points. The best first action is to:",
            "options": ["Replace the manager", "Run individual skip-level conversations to identify root causes", "Reduce headcount", "Increase bonuses"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "POSH (Prevention of Sexual Harassment) compliance in Indian companies primarily requires:",
            "options": ["Annual offsite", "Internal Complaints Committee + policy + training", "External legal counsel on retainer", "Mandatory exit interviews"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "consulting": [
        {
            "category": "quantitative",
            "question_text": "Estimating the number of barbershops in Bangalore is best approached via:",
            "options": ["Web scraping", "A top-down population-based estimate validated with bottom-up sanity checks", "Wikipedia lookup", "Single Google search"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "MECE in consulting stands for:",
            "options": ["Most Efficient, Cost-Effective", "Mutually Exclusive, Collectively Exhaustive", "Maximally Empirical, Continuously Evaluated", "Multi-Entity, Cross-Enterprise"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A pyramid-principle deck leads with:",
            "options": ["Background detail", "The conclusion / recommendation", "Methodology", "Appendix"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
    "operations_management": [
        {
            "category": "technical",
            "question_text": "Little's Law states that the average number in a system equals:",
            "options": ["Arrival rate × time in system", "Throughput × cost", "Inventory × turnover", "Demand × elasticity"],
            "correct_index": 0,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "SLA vs OLA — an OLA is an agreement between:",
            "options": ["Two external companies", "Internal teams within the same company", "Customer and product", "Vendor and end user"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "quantitative",
            "question_text": "A bottleneck in a process is best identified by looking at:",
            "options": ["The fastest station", "The slowest station with the longest queue ahead of it", "Total headcount", "Marketing spend"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
    "business_analyst": [
        {
            "category": "technical",
            "question_text": "A funnel conversion of 100 → 40 → 8 has its biggest drop between:",
            "options": ["Steps 1 → 2 (60% drop)", "Steps 2 → 3 (80% drop)", "They are equal", "Cannot be determined"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "Cohort analysis is most useful for:",
            "options": ["Counting unique users", "Comparing user behaviour by signup period over time", "Calculating ARPU", "Finding bugs"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "When stakeholders disagree on KPIs, the analyst should first:",
            "options": ["Pick one and move on", "Map each KPI to the underlying business question and reconcile", "Add more KPIs", "Defer to seniority"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "investment_banking_finance": [
        {
            "category": "quantitative",
            "question_text": "EV/EBITDA is preferred to P/E when comparing companies because EV/EBITDA:",
            "options": ["Ignores debt", "Is capital-structure neutral and excludes non-operating items", "Always equals P/E", "Is simpler to compute"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "quantitative",
            "question_text": "A DCF's terminal value typically represents:",
            "options": ["10% of total enterprise value", "A small rounding error", "The majority of total enterprise value", "Only negative cash flows"],
            "correct_index": 2,
            "difficulty": "medium",
        },
        {
            "category": "quantitative",
            "question_text": "WACC stands for:",
            "options": ["Weighted Average Cost of Capital", "Working Asset Capital Cost", "Worldwide Average Currency Conversion", "Weighted Annual Cash Conversion"],
            "correct_index": 0,
            "difficulty": "easy",
        },
    ],
    "product_marketing": [
        {
            "category": "technical",
            "question_text": "Positioning is best defined as:",
            "options": ["The price point of a product", "How a product is perceived relative to alternatives in the customer's mind", "The number of features it has", "The colour of the logo"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A 'jobs-to-be-done' frame asks:",
            "options": ["What feature do users want?", "What progress is the user trying to make in their life?", "Which competitor are they switching from?", "What's the average revenue per user?"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "PMF (product-market fit) is most reliably indicated by:",
            "options": ["High signup volume", "Strong organic retention and word-of-mouth", "Funded ad campaigns", "Press coverage"],
            "correct_index": 1,
            "difficulty": "medium",
        },
    ],
    "civil_engineering": [
        {
            "category": "technical",
            "question_text": "Reinforced concrete primarily uses steel to resist:",
            "options": ["Compression", "Tension", "Both equally", "Shear only"],
            "correct_index": 1,
            "difficulty": "easy",
        },
        {
            "category": "technical",
            "question_text": "A simply supported beam under a central point load has maximum bending moment at:",
            "options": ["The supports", "The midspan", "Quarter span", "It is uniform"],
            "correct_index": 1,
            "difficulty": "medium",
        },
        {
            "category": "technical",
            "question_text": "Slump test measures concrete's:",
            "options": ["Compressive strength", "Workability", "Setting time", "Cement content"],
            "correct_index": 1,
            "difficulty": "easy",
        },
    ],
}


# Per-role coding problems served at the final coding round. Mirrors the
# legacy TS bank in `web/src/lib/coding-problems.ts`. Recruiters can edit
# / add / remove via the dashboard; only `active=1` rows are served.
_GENERIC_CODING = {
    "title": "Top-K most-frequent words",
    "prompt": (
        "Given a list of strings, return the K most-frequently occurring "
        "strings (ties broken alphabetically). Outline your approach in "
        "pseudocode — focus on the data structures, complexity, and edge "
        "cases, NOT compilable syntax."
    ),
    "hint": "A hash map for counts plus a heap of size K is enough. State its O(N log K) bound.",
    "examples": [
        {"input": '["the","day","is","the","day"], K=1', "output": '["the"]'},
        {"input": '["a","b","c","a","b","a"], K=2', "output": '["a","b"]'},
    ],
}

# Two coding problems per engineering role, each with example test cases.
# All ask for PSEUDOCODE — we don't compile candidate code. The examples
# serve as input/output illustrations that clarify the problem statement.
# Recruiters can edit titles, prompts, hints and test cases per problem
# via the /coding-bank dashboard.
_ROLE_CODING_PROBLEMS: dict[str, list[dict]] = {
    "software_engineering": [
        {
            "title": "Closest pair to target sum",
            "prompt": "Given an array of integers and a target T, return the pair of indices whose values sum CLOSEST to T (absolute difference; ties broken by leftmost index). Pseudocode the approach — discuss data structures, complexity, and how you'd handle duplicates and very large arrays.",
            "hint": "Hash map of complements is O(n); sort + two-pointer is O(n log n) but simpler.",
            "examples": [
                {"input": "nums=[1,3,4,7,10], T=15", "output": "(2,4) → 4+10=14"},
                {"input": "nums=[-5,5,0,0], T=0", "output": "(0,1) or (2,3)"},
            ],
        },
        {
            "title": "Longest substring with K distinct characters",
            "prompt": "Pseudocode the algorithm that returns the LENGTH of the longest substring containing at most K distinct characters. Describe your data structures, time/space complexity, and edge cases.",
            "hint": "Sliding window + hash map of last-seen indices gives you O(n).",
            "examples": [
                {"input": "s='eceba', K=2", "output": "3 (ece)"},
                {"input": "s='aa', K=1", "output": "2 (aa)"},
            ],
        },
    ],
    "backend_engineering": [
        {
            "title": "Idempotent payment-capture API",
            "prompt": "Pseudocode the server logic for an idempotent /capture endpoint: same Idempotency-Key on retry must not double-charge. Describe the schema for tracking keys, the failure modes you guard against, and the response shape on retry.",
            "hint": "Unique constraint on (merchant_id, idempotency_key); use a state machine for partial writes.",
            "examples": [
                {"input": "POST /capture key=K1 amount=500 (first)", "output": "201, charge_id=ch_001"},
                {"input": "POST /capture key=K1 amount=500 (retry)", "output": "200, charge_id=ch_001 (same)"},
            ],
        },
        {
            "title": "Rate-limited fan-out",
            "prompt": "Pseudocode a worker that fans out 100k webhook deliveries respecting a 200 RPS budget shared across all workers. Describe the queue, the token-bucket location, and how you handle backoff on receiver 429s.",
            "hint": "Token bucket in Redis with Lua for atomic decrement; worker blocks until tokens available.",
            "examples": [
                {"input": "queue=10k events, 1 worker, 200 RPS", "output": "drains in ~50s"},
                {"input": "receiver returns 429", "output": "exponential backoff per (event_id), max 5 attempts"},
            ],
        },
    ],
    "frontend_engineering": [
        {
            "title": "Debounced typeahead with race-safety",
            "prompt": "Pseudocode a typeahead component that fires search after 200ms of keystroke quiet, cancels stale in-flight requests, and recovers gracefully on a network error. Describe the state machine — NOT runnable React.",
            "hint": "AbortController + a request-token are cleaner than a setTimeout race.",
            "examples": [
                {"input": "user types 'a','ap','app' within 100ms", "output": "single GET /search?q=app"},
                {"input": "first request still pending, user types more", "output": "abort first, fire second"},
            ],
        },
        {
            "title": "Virtualized list rendering",
            "prompt": "Pseudocode a virtualised list renderer for 50k rows: only DOM-mount rows in the visible viewport ± overscan. Describe the math for which rows are visible, what happens on resize, and how you keep scroll position stable.",
            "hint": "scrollTop / rowHeight gives start index; floor it. Keep an offset-spacer above and below.",
            "examples": [
                {"input": "container 600px, row 40px, scrollTop 800", "output": "first visible row idx=20"},
                {"input": "user resizes window", "output": "recompute visible window, no scrollTop change"},
            ],
        },
    ],
    "fullstack_engineering": [
        {
            "title": "Optimistic UI for like button",
            "prompt": "Pseudocode the end-to-end flow for an optimistic 'like': client-side state update, async POST, error rollback, and reconciliation if a stale state was rendered. Describe the local cache, the inflight tracker, and the rollback rule.",
            "hint": "Roll back to the SERVER-confirmed state on error, not the pre-click state.",
            "examples": [
                {"input": "user clicks Like → POST fails", "output": "UI reverts to liked=false, toast 'failed'"},
                {"input": "user clicks Like → POST 200", "output": "UI stays liked=true, confirmed"},
            ],
        },
        {
            "title": "Zero-downtime schema migration",
            "prompt": "Pseudocode the deploy sequence to add a NOT NULL column `country` to a `users` table being written 500 RPS, without downtime. Describe the steps, the rollback, and what could go wrong at each step.",
            "hint": "Add nullable → backfill → enforce NOT NULL → drop default. Don't deploy code that requires the column until step 3.",
            "examples": [
                {"input": "step 1 fails midway", "output": "no data change; rollback is no-op"},
                {"input": "step 3: NOT NULL constraint", "output": "blocks if backfill left NULLs; backfill first"},
            ],
        },
    ],
    "android_engineering": [
        {
            "title": "Offline-first like queue",
            "prompt": "Pseudocode an offline-first action queue for an Android Like button: local persistence, FIFO ordering, exponential backoff retry, and conflict handling if the server state diverged. Describe the local record and the syncer loop.",
            "hint": "Persist BEFORE optimistic UI; idempotency keys keep retries safe.",
            "examples": [
                {"input": "user likes 5 items offline → reconnects", "output": "5 POSTs in order, retries on failure"},
                {"input": "server says item already liked", "output": "merge: keep liked=true, drop from queue"},
            ],
        },
        {
            "title": "Cold-start optimisation",
            "prompt": "Pseudocode the strategy that reduces a Redmi Note cold-start from 2.4s → 1.2s: identify the work to defer, what to baseline-profile, and what to measure to prove the win. NOT Kotlin code — describe the plan.",
            "hint": "Application.onCreate is the killer — push to lazy init, parallelise content provider warm-up.",
            "examples": [
                {"input": "Application.onCreate inits Firebase, Analytics, ImageLoader", "output": "defer all but ImageLoader to first-frame"},
                {"input": "first frame still 1.6s", "output": "add Baseline Profile, re-measure"},
            ],
        },
    ],
    "ios_engineering": [
        {
            "title": "Image prefetcher for vertical feed",
            "prompt": "Pseudocode an image prefetcher for a vertically scrolling iOS feed: cap memory at 80MB, cancel out-of-window requests, share an in-flight fetch across cells. Describe data structures and the cancellation rule.",
            "hint": "OrderedSet for LRU eviction; per-URL future deduplicates cell requests.",
            "examples": [
                {"input": "user scrolls fast past 30 items", "output": "26 fetches cancelled, 4 served from cache"},
                {"input": "memory hits 80MB", "output": "evict LRU until 60MB"},
            ],
        },
        {
            "title": "Background download with resume",
            "prompt": "Pseudocode a resumable background download using URLSession's background config: kicks off a 500MB file download, survives app suspend, resumes on app launch.",
            "hint": "URLSessionDownloadTask + resumeData persisted to disk on cancel/fail.",
            "examples": [
                {"input": "user backgrounds app at 30%", "output": "system continues, app notified on completion"},
                {"input": "app killed at 50%", "output": "resumeData on disk; next launch reads it and resumes"},
            ],
        },
    ],
    "mobile_engineering": [
        {
            "title": "Offline action queue",
            "prompt": "Pseudocode an offline-first action queue for a mobile app: local persistence, FIFO ordering, exponential backoff retry, and conflict handling when the server state diverges. Describe the local record, the syncer loop, and the merge rule.",
            "hint": "Persist BEFORE optimistic UI; idempotency keys keep retries safe.",
            "examples": [
                {"input": "user performs 3 actions offline", "output": "3 records persisted, FIFO retry on reconnect"},
                {"input": "server returns 409 conflict", "output": "skip the conflict action, keep going"},
            ],
        },
        {
            "title": "Push-notification dedup",
            "prompt": "Pseudocode a notification handler that dedupes pushes by message_id across foreground+background paths. Describe storage, TTL, and what happens on cold start.",
            "hint": "SharedPrefs / NSUserDefaults with a bounded ring buffer of last-N message IDs.",
            "examples": [
                {"input": "same message_id arrives 2x within 5s", "output": "shown once"},
                {"input": "app cold-start, push pre-buffered", "output": "checked against persisted ring; dedupes correctly"},
            ],
        },
    ],
    "data_engineering": [
        {
            "title": "Streaming dedup with watermark",
            "prompt": "Pseudocode a streaming dedup of events keyed by (user_id, action_id) within a 24-hour window. Describe state size, watermarking, and what happens on a late arrival beyond the watermark.",
            "hint": "Bloom filter + 24h time-bucketed state; emit late events to a side-output for audit.",
            "examples": [
                {"input": "same (u1, a1) at t=0 and t=10min", "output": "second event dropped"},
                {"input": "(u1, a1) at t=0 and t=25h (late)", "output": "kept (window expired), logged"},
            ],
        },
        {
            "title": "Backfill a derived table",
            "prompt": "Pseudocode the orchestration to backfill 90 days of a derived analytics table from raw events, without blocking ongoing ingestion. Describe partitioning, parallelism, and the cutover.",
            "hint": "Write to a shadow table, validate row counts, swap with a metadata flip.",
            "examples": [
                {"input": "90 days × 1B events/day, 50-node cluster", "output": "partition by date, run 50 parallel days at a time"},
                {"input": "validation step fails on day 47", "output": "abort cutover; raw events untouched"},
            ],
        },
    ],
    "database_engineering": [
        {
            "title": "Sliding-window join",
            "prompt": "Pseudocode a 24-hour sliding-window join between `orders` and `events` on user_id, producing rows where an event happened within 24h before its matching order. Describe indexes, partitioning, and how you'd run it incrementally.",
            "hint": "Index (user_id, event_ts); incremental run uses a watermark on event_ts and orders.created_at.",
            "examples": [
                {"input": "orders=10M, events=100M, 1y data", "output": "partition by month; use covering index"},
                {"input": "incremental run, last_run=yesterday", "output": "only scan orders/events created since"},
            ],
        },
        {
            "title": "Diagnose a slow query",
            "prompt": "Pseudocode the steps to diagnose a query that's gone from 50ms to 8s overnight. Describe what you'd check first, what you'd grab from pg_stat / EXPLAIN, and the order of remediations.",
            "hint": "ANALYZE → EXPLAIN (BUFFERS, ANALYZE) → look for new seq scans, missing index, or stats drift.",
            "examples": [
                {"input": "EXPLAIN shows Seq Scan on a 10M table", "output": "create / re-create the missing index"},
                {"input": "EXPLAIN looks fine but slow", "output": "check pg_stat_statements for buffer hit ratio"},
            ],
        },
    ],
    "data_science": [
        {
            "title": "A/B test sample size",
            "prompt": "In pseudocode + math, outline the sample-size calc for an A/B test detecting a 2% lift on a 5% baseline conversion at alpha=0.05, power=0.8. Then describe assignment, monitoring, and stopping rules.",
            "hint": "n ≈ 16 * p(1-p) / Δ² per arm (rough rule of thumb).",
            "examples": [
                {"input": "baseline 5%, lift 2%, α=0.05, power=0.8", "output": "≈ 3,800 per arm"},
                {"input": "lift 10% on same baseline", "output": "≈ 150 per arm — much easier"},
            ],
        },
        {
            "title": "Holdout segment selection",
            "prompt": "Pseudocode the algorithm that picks a stratified holdout of 10% from a 5M-user population, preserving the distribution across (tier, country, signup_month). Describe correctness checks.",
            "hint": "Stratified random with proportional allocation; verify each stratum's holdout share is 10% ± ε.",
            "examples": [
                {"input": "5M users, 3 strata vars, 10% holdout", "output": "500k held out, distribution preserved"},
                {"input": "tiny stratum (n=20)", "output": "min-2 rule: always keep ≥2 in holdout"},
            ],
        },
    ],
    "ml_engineering": [
        {
            "title": "Online feature freshness",
            "prompt": "Pseudocode an online feature-store read: given user_id, return freshest aggregate features for inference with a 5ms p99 budget. Describe storage, TTL, and graceful degradation.",
            "hint": "Redis hash per user with TTL; fall back to last-good aggregate on stale.",
            "examples": [
                {"input": "user has features updated 30s ago", "output": "served, fresh"},
                {"input": "feature pipeline lagging 10min", "output": "served with 'stale' flag; downstream model knows"},
            ],
        },
        {
            "title": "Embedding cache for ranking",
            "prompt": "Pseudocode the cache strategy that serves user embeddings to a ranking service with 95% hit rate. Describe key, TTL, eviction, and what triggers a recompute.",
            "hint": "Key by (user_id, embedding_version); TTL 12h; LRU eviction.",
            "examples": [
                {"input": "model version bump → cache version key changes", "output": "old keys age out via TTL"},
                {"input": "hot user, cache miss", "output": "compute synchronously, store, serve"},
            ],
        },
    ],
    "machine_learning": [
        {
            "title": "Online vs offline reconciliation",
            "prompt": "Pseudocode the training/serving consistency for a ranking model: offline batch trains weekly, online learner updates hourly. Describe how the two converge, what feature parity you guarantee, and the rollback rule.",
            "hint": "A/B traffic split + shadow scoring + parity test on a holdout cohort.",
            "examples": [
                {"input": "online learner drifts beyond 5% MAE", "output": "auto-rollback to last offline checkpoint"},
                {"input": "feature added online but not offline", "output": "block traffic flip until offline retrained"},
            ],
        },
        {
            "title": "Threshold tuning for imbalanced classifier",
            "prompt": "Pseudocode the procedure that picks a probability threshold for a fraud classifier with 99.5% legitimate / 0.5% fraud. Describe inputs, the cost function, and how you'd validate it post-deploy.",
            "hint": "Optimise weighted F-beta on a held-out calibration set; sweep thresholds 0.01→0.99.",
            "examples": [
                {"input": "cost(FP)=1, cost(FN)=100", "output": "threshold ≈ 0.05 (very low — favour recall)"},
                {"input": "post-deploy drift detected", "output": "re-run with last 7d of data, re-pick threshold"},
            ],
        },
    ],
    "genai_engineering": [
        {
            "title": "Streaming RAG with context budget",
            "prompt": "Pseudocode a RAG pipeline that retrieves top-k chunks, fits them into an N-token context budget (longest-fit first with deduplication), and streams the LLM response. Describe embedding lookup, the dedup step, and what to do when chunks overflow.",
            "hint": "Embed query → cosine-sim → MMR for diversity → token-greedy pack → stream LLM.",
            "examples": [
                {"input": "k=10 chunks totalling 12k tokens, budget 8k", "output": "dedup + drop lowest-scoring until ≤8k"},
                {"input": "all chunks identical (high overlap)", "output": "MMR returns 1; remaining budget used by next-most-diverse"},
            ],
        },
        {
            "title": "Cost-tier prompt routing",
            "prompt": "Pseudocode the router that decides whether a query should hit Haiku, Sonnet, or Opus based on length, complexity heuristics, and a per-tenant cost budget. Describe inputs and the fall-through logic.",
            "hint": "Length + question-type classifier; downgrade if monthly spend > X% of budget.",
            "examples": [
                {"input": "short factual query, low spend", "output": "route → Haiku"},
                {"input": "long reasoning task, budget exceeded", "output": "downgrade to Sonnet, log the override"},
            ],
        },
    ],
    "devops_sre": [
        {
            "title": "Auto-rollback guardrail",
            "prompt": "Pseudocode the deploy guard that decides whether to auto-rollback based on error-rate and latency over a sliding window. Describe inputs, thresholds, and the rollback action.",
            "hint": "p99 latency, error rate, and dependency error rate — any trip → rollback.",
            "examples": [
                {"input": "error rate >1% for 60s post-deploy", "output": "trigger rollback, page oncall"},
                {"input": "latency p99 spike but error rate stable", "output": "alert only, don't rollback"},
            ],
        },
        {
            "title": "Error-budget burn rate",
            "prompt": "Pseudocode the alerting policy for an SLO of 99.9% monthly with multi-window burn-rate alerts (fast + slow burn). Describe the windows, thresholds, and what happens at each level.",
            "hint": "Google SRE workbook: 2% budget in 1h = fast burn; 5% in 6h = slow burn.",
            "examples": [
                {"input": "2% budget burned in 30min", "output": "page (fast burn)"},
                {"input": "10% budget burned over 7 days", "output": "ticket only (slow burn)"},
            ],
        },
    ],
    "devops_engineering": [
        {
            "title": "Blue/green deploy guardrails",
            "prompt": "Pseudocode the deploy script's go/no-go logic: ramp 5% → 25% → 100% with health checks at each stage, automatic rollback on error-rate > 1% sustained for 60s. Describe the state machine.",
            "hint": "Latency p99, error rate, dependency error rate — three independent guardrails; ANY trip → rollback.",
            "examples": [
                {"input": "5% → healthy 5min → 25%", "output": "proceed"},
                {"input": "25% → error rate 2% for 65s", "output": "rollback to 0%, page"},
            ],
        },
        {
            "title": "Terraform drift detection",
            "prompt": "Pseudocode a nightly job that detects drift between IaC and live AWS state for 200 resources. Describe outputs, severity classification, and the auto-remediation policy.",
            "hint": "terraform plan → diff against last apply; classify by resource type (security drift = page).",
            "examples": [
                {"input": "SG ingress drift in prod", "output": "page immediately"},
                {"input": "tag drift on dev resource", "output": "ticket, not page"},
            ],
        },
    ],
    "cloud_engineering": [
        {
            "title": "Cost-aware autoscaler",
            "prompt": "Pseudocode the autoscaler for a stateless API: scale up when p99 > SLO for 2 consecutive windows, scale down when CPU < 30% AND queue depth < 5 for 10 minutes. Cap max instances per env.",
            "hint": "Hysteresis: different up vs. down thresholds prevent thrash.",
            "examples": [
                {"input": "p99 750ms vs SLO 500ms × 2 windows", "output": "scale up by 25%"},
                {"input": "CPU 20%, queue 2, for 12min", "output": "scale down by 1 instance (until floor)"},
            ],
        },
        {
            "title": "Multi-AZ failover decision",
            "prompt": "Pseudocode the runtime decision that an AZ is unhealthy: inputs (per-AZ error rate, latency, health-check pass rate), thresholds, and the action (evacuate vs. throttle).",
            "hint": "Require 2 independent signals to agree before evacuating — avoid panic failovers.",
            "examples": [
                {"input": "AZ-1a: 30% error rate, others healthy", "output": "evacuate 1a traffic to 1b/1c"},
                {"input": "all 3 AZs spike together", "output": "throttle, don't failover (likely global cause)"},
            ],
        },
    ],
    "qa_automation": [
        {
            "title": "Flaky-test triage",
            "prompt": "Pseudocode the algorithm that classifies a failing test as 'flaky' vs. 'truly broken' from its last 30 runs across branches. Describe inputs, signals, and the cut-off.",
            "hint": "If pass rate across branches > 80% but recent runs failing, likely flaky.",
            "examples": [
                {"input": "30-day pass rate 92%, last 5 runs 0/5", "output": "broken — not flaky"},
                {"input": "30-day pass rate 65%, intermittent", "output": "flaky — quarantine"},
            ],
        },
        {
            "title": "API contract test generator",
            "prompt": "Pseudocode a tool that reads an OpenAPI spec and generates contract tests covering: required fields, type validation, response codes for each error case. Describe how you keep tests in sync with spec changes.",
            "hint": "Parse the spec → enumerate operations → for each, generate happy + error variants.",
            "examples": [
                {"input": "POST /users with required field 'email'", "output": "test: 400 when email missing"},
                {"input": "spec adds new 401 case", "output": "regenerate, fail-the-build until reviewed"},
            ],
        },
    ],
    "security_engineering": [
        {
            "title": "Rate limiter for login",
            "prompt": "Pseudocode a per-IP-and-account rate limiter for /login with exponential backoff, lockout, and CAPTCHA escalation. Describe storage, failure-open behaviour, and audit logs.",
            "hint": "Sliding window in Redis with Lua atomic increments; fail-open on Redis outage.",
            "examples": [
                {"input": "5 failed attempts in 60s from one IP", "output": "CAPTCHA required"},
                {"input": "20 failed attempts in 5min on one account", "output": "lockout 15min, email user"},
            ],
        },
        {
            "title": "SSRF guardrails for URL fetcher",
            "prompt": "Pseudocode the validation for a user-submitted URL fetcher to block SSRF: DNS rebinding, link-local addresses, internal cloud metadata IPs. Describe the allow-list and the check order.",
            "hint": "Resolve DNS → check final IP is NOT in private ranges (169.254.*, 10.*, 172.16.*, fc00::/7).",
            "examples": [
                {"input": "https://metadata.aws.local", "output": "blocked (resolves to 169.254.169.254)"},
                {"input": "https://example.com via DNS rebinding", "output": "re-resolve and compare with fetch IP"},
            ],
        },
    ],
    "embedded_systems": [
        {
            "title": "ISR-safe ring buffer",
            "prompt": "Pseudocode a single-producer (ISR) / single-consumer (main loop) ring buffer for sensor samples. Describe head/tail indices, why ISR writes are safe without locks, and overrun handling.",
            "hint": "If only producer moves head and only consumer moves tail, and indices are atomic-aligned, you don't need a mutex.",
            "examples": [
                {"input": "buf size=64, producer rate>consumer rate", "output": "overrun: drop oldest, set overrun_flag"},
                {"input": "consumer faster than producer", "output": "tail==head → empty; consumer spins or sleeps"},
            ],
        },
        {
            "title": "Watchdog kicker",
            "prompt": "Pseudocode the firmware watchdog-feeder that kicks the WDT only if EVERY critical task has checked in within the period. Describe what 'check in' means and the failure path.",
            "hint": "Bitmask of task-IDs; only feed WDT when all bits set; reset bitmask each period.",
            "examples": [
                {"input": "tasks A,B,C all check in within 100ms", "output": "feed WDT"},
                {"input": "task B misses check-in", "output": "WDT fires → reset"},
            ],
        },
    ],
    "vlsi_engineering": [
        {
            "title": "Async FIFO between clock domains",
            "prompt": "Pseudocode the control logic for a clock-domain-crossing FIFO with gray-coded pointers and a 2-flop synchroniser on each side. Describe full / empty signals and how you avoid metastability.",
            "hint": "Gray coding ensures only one bit toggles per increment — that's what makes the 2-flop sync safe.",
            "examples": [
                {"input": "write_ptr=Gray(N), read_ptr_synced=Gray(N)", "output": "empty signal"},
                {"input": "write_ptr leads read_ptr by depth", "output": "full signal"},
            ],
        },
        {
            "title": "Setup/hold timing closure",
            "prompt": "Pseudocode the iterative process to close timing on a path that fails by 200ps. Describe the order of fixes (cell sizing, buffering, retiming) and what data you'd grab between iterations.",
            "hint": "Start with cell sizing (cheapest); only retime if sizing/buffering can't close it.",
            "examples": [
                {"input": "fail by 200ps after place", "output": "upsize first 3 cells, re-run STA"},
                {"input": "still fails by 50ps", "output": "insert buffer at high-fanout net"},
            ],
        },
    ],
    "electrical_engineering": [
        {
            "title": "PI controller for buck converter",
            "prompt": "Pseudocode a discrete PI controller for regulating Vout on a buck converter. Inputs: setpoint, measured Vout, sample period, Kp, Ki. Include integrator anti-windup.",
            "hint": "Clamp the integrator when the actuator saturates — otherwise it winds up and overshoots on recovery.",
            "examples": [
                {"input": "setpoint=5V, Vout=4.8V, Kp=0.5, Ki=0.1", "output": "duty cycle increases towards saturation"},
                {"input": "duty cycle at 100%, integrator clamped", "output": "no further integration until error reverses"},
            ],
        },
        {
            "title": "Battery SoC estimation (Coulomb counting + EKF)",
            "prompt": "Pseudocode a hybrid SoC estimator that combines Coulomb counting with an Extended Kalman Filter on OCV. Describe inputs, state update, and recalibration triggers.",
            "hint": "Coulomb counting drifts; EKF correction at known OCV plateaus snaps it back.",
            "examples": [
                {"input": "discharge current 2A for 1h, SoC 0.5→0.3", "output": "Coulomb count tracks"},
                {"input": "battery rests, OCV stable", "output": "EKF correction applied; resets drift"},
            ],
        },
    ],
    "mechanical_engineering": [
        {
            "title": "Bolt sizing under combined load",
            "prompt": "Pseudocode the calculation picking the smallest ISO M-series bolt grade carrying a known axial preload AND shear load with safety factor 2.5. Describe inputs, failure modes checked, and iteration.",
            "hint": "Check tensile (Sy), shear (~0.577×Sy), and bearing — pick size satisfying worst-case.",
            "examples": [
                {"input": "F_axial=20kN, F_shear=10kN, grade 8.8", "output": "M10 sufficient"},
                {"input": "same loads, grade 4.6", "output": "M14 required"},
            ],
        },
        {
            "title": "Heat-sink sizing for a CPU",
            "prompt": "Pseudocode the steps to size a heat-sink for a 65W TDP CPU given ambient 35°C and max junction 90°C. Describe inputs, the thermal resistance budget, and what you'd verify.",
            "hint": "ΔT_max / TDP = total Rθ budget; subtract Rθ_j-c and Rθ_c-s, what's left is Rθ_s-a.",
            "examples": [
                {"input": "TDP=65W, T_amb=35°C, T_j=90°C", "output": "Rθ_total ≤ 0.85°C/W"},
                {"input": "Rθ_j-c=0.2, Rθ_c-s=0.1", "output": "heat-sink needs Rθ_s-a ≤ 0.55"},
            ],
        },
    ],
    "civil_engineering": [
        {
            "title": "Tension steel for RCC beam (IS 456)",
            "prompt": "Pseudocode the calc that returns the area of tension steel for a simply-supported RCC beam per IS 456. Inputs: span, factored UDL, beam depth, fck, fy. Include the section check at the end.",
            "hint": "Mu = 0.87·fy·Ast·(d - 0.42·xu); solve for Ast then verify under-reinforced.",
            "examples": [
                {"input": "L=6m, w=30kN/m, d=400mm, M25, Fe500", "output": "Ast ≈ 1180 mm²"},
                {"input": "section is over-reinforced", "output": "increase depth or use doubly-reinforced design"},
            ],
        },
        {
            "title": "Foundation choice for soft soil",
            "prompt": "Pseudocode the decision logic that picks isolated / raft / pile foundation for a 10-storey building given SBC, water-table depth, and load. Describe the inputs, the gates, and what you'd verify on-site.",
            "hint": "Isolated only at high SBC; raft when columns overlap; pile when soft soil below required bearing depth.",
            "examples": [
                {"input": "SBC=80 kN/m², 10 storey", "output": "raft or pile (isolated would be massive)"},
                {"input": "soft soil 15m below, dense layer at 18m", "output": "pile foundation to 18m+"},
            ],
        },
    ],
}


def ensure_coding_bank(conn: sqlite3.Connection, company_id: str) -> None:
    """Idempotent: lay down one default coding problem per role family per
    company. Recruiters can edit/extend via the dashboard CRUD; we only
    insert where the (company, role_family) slice is currently empty so we
    don't clobber recruiter edits."""
    import json as _json
    # Always lay down the generic problem (NULL role) as the last-resort
    # fallback for roles that don't have a tagged problem yet.
    n = conn.execute(
        "SELECT COUNT(*) AS n FROM coding_problems "
        "WHERE company_id=? AND role_family IS NULL AND active=1",
        (company_id,),
    ).fetchone()["n"]
    if n == 0:
        conn.execute(
            "INSERT INTO coding_problems "
            "(id, company_id, role_family, title, prompt, hint, examples_json, active, position) "
            "VALUES (?,?,NULL,?,?,?,?,1,0)",
            (
                uuid.uuid4().hex[:12], company_id,
                _GENERIC_CODING["title"], _GENERIC_CODING["prompt"],
                _GENERIC_CODING["hint"],
                _json.dumps(_GENERIC_CODING.get("examples", [])),
            ),
        )
    # Per-role packs — each role gets a LIST of problems (we ship 2 per
    # engineering role). Strategy:
    #   - For a problem whose title doesn't yet exist in this slice: INSERT
    #     it (with examples, hint, prompt).
    #   - For a problem whose title DOES exist but the existing row has an
    #     empty/missing examples_json: UPDATE examples (and hint if empty)
    #     so old v1-seed rows pick up the new test cases.
    # We never touch a row that already has examples filled in (preserves
    # any recruiter edits) and never re-enable a disabled row.
    for role_family, problems in _ROLE_CODING_PROBLEMS.items():
        problem_list = problems if isinstance(problems, list) else [problems]
        existing_rows = {
            r["title"]: r for r in conn.execute(
                "SELECT id, title, examples_json, hint FROM coding_problems "
                "WHERE company_id=? AND role_family=?",
                (company_id, role_family),
            ).fetchall()
        }
        next_pos_row = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS p FROM coding_problems "
            "WHERE company_id=? AND role_family=?",
            (company_id, role_family),
        ).fetchone()
        next_pos = (next_pos_row["p"] if next_pos_row else -1) + 1
        for problem in problem_list:
            existing = existing_rows.get(problem["title"])
            if existing is None:
                conn.execute(
                    "INSERT INTO coding_problems "
                    "(id, company_id, role_family, title, prompt, hint, examples_json, active, position) "
                    "VALUES (?,?,?,?,?,?,?,1,?)",
                    (
                        uuid.uuid4().hex[:12], company_id, role_family,
                        problem["title"], problem["prompt"],
                        problem.get("hint", ""),
                        _json.dumps(problem.get("examples", [])),
                        next_pos,
                    ),
                )
                next_pos += 1
            else:
                # Top-up: fill in examples / hint if the existing row is
                # missing them (typical for v1 seed rows that were later
                # disabled by the v3 migration for lacking examples).
                # Also re-enable the row if we just gave it examples —
                # otherwise candidates lose what is now a complete problem.
                # Don't overwrite non-empty fields — recruiter edits win.
                try:
                    cur_examples = _json.loads(existing["examples_json"] or "[]")
                except (TypeError, ValueError):
                    cur_examples = []
                updates = []
                params: list = []
                added_examples = False
                if not cur_examples and problem.get("examples"):
                    updates.append("examples_json=?")
                    params.append(_json.dumps(problem["examples"]))
                    added_examples = True
                if not (existing["hint"] or "").strip() and problem.get("hint"):
                    updates.append("hint=?")
                    params.append(problem["hint"])
                if added_examples:
                    # Roll back the v3 auto-disable now that this row has
                    # examples. Without this, the migration ordering would
                    # leave half the engineering roles with only 1 problem.
                    updates.append("active=1")
                if updates:
                    params.append(existing["id"])
                    conn.execute(
                        f"UPDATE coding_problems SET {', '.join(updates)} WHERE id=?",
                        params,
                    )
    conn.commit()


def ensure_aptitude_bank(conn: sqlite3.Connection, company_id: str) -> None:
    """Make sure a company has a usable aptitude bank.

    On first call for a given company we insert the 10 generic questions
    (NULL role_family) so any role gets at least a 10-question round. We
    also lay down per-role question packs whenever the matching role_family
    isn't already populated — so a job posted for, say, machine_learning
    serves ML-flavoured items even on a freshly-provisioned tenant.

    Idempotent: rechecks counts on every call, so it's cheap to call from
    job-creation paths.
    """
    import json as _json
    # Generic backbone (NULL role_family) — only insert if missing.
    n = conn.execute(
        "SELECT COUNT(*) AS n FROM aptitude_questions "
        "WHERE company_id=? AND role_family IS NULL AND active=1",
        (company_id,),
    ).fetchone()["n"]
    if n == 0:
        base_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS p FROM aptitude_questions WHERE company_id=?",
            (company_id,),
        ).fetchone()["p"]
        for i, q in enumerate(_MOCK_APTITUDE_QUESTIONS):
            conn.execute(
                "INSERT INTO aptitude_questions "
                "(id, company_id, category, question_text, options_json, correct_index, difficulty, active, position, role_family) "
                "VALUES (?,?,?,?,?,?,?,?,?,NULL)",
                (
                    uuid.uuid4().hex[:12], company_id,
                    q["category"], q["question_text"],
                    _json.dumps(q["options"]), q["correct_index"],
                    q["difficulty"], 1, base_pos + 1 + i,
                ),
            )

    # Per-role packs — insert any pack we don't yet have for this company.
    for role_family, pack in _ROLE_APTITUDE_PACKS.items():
        existing = conn.execute(
            "SELECT COUNT(*) AS n FROM aptitude_questions "
            "WHERE company_id=? AND role_family=? AND active=1",
            (company_id, role_family),
        ).fetchone()["n"]
        if existing:
            continue
        base_pos = conn.execute(
            "SELECT COALESCE(MAX(position), -1) AS p FROM aptitude_questions WHERE company_id=?",
            (company_id,),
        ).fetchone()["p"]
        for i, q in enumerate(pack):
            conn.execute(
                "INSERT INTO aptitude_questions "
                "(id, company_id, category, question_text, options_json, correct_index, difficulty, active, position, role_family) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    uuid.uuid4().hex[:12], company_id,
                    q["category"], q["question_text"],
                    _json.dumps(q["options"]), q["correct_index"],
                    q["difficulty"], 1, base_pos + 1 + i, role_family,
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
