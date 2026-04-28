"""SQLite database for persistent storage of candidates, sessions, and evaluations."""
import hashlib
import os
import sqlite3
import uuid
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "portal.db"

DEMO_COMPANY_NAME = "DemoCorp"
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
    """)

    # Migrations for older DBs that were created before these columns existed.
    for col, decl in [
        ("role_family",           "TEXT DEFAULT 'software_engineering'"),
        ("seniority",             "TEXT DEFAULT 'mid'"),
        ("min_experience_years",  "REAL DEFAULT 0"),
        ("max_experience_years",  "REAL DEFAULT 40"),
        ("department",            "TEXT DEFAULT ''"),
        ("employment_type",       "TEXT DEFAULT 'full_time'"),
    ]:
        _ensure_column(conn, "jobs", col, decl)

    conn.commit()
    _seed_demo_company(conn)
    conn.close()


def _seed_demo_company(conn: sqlite3.Connection) -> None:
    """Seed a mock company + one JD per role family if not already present.

    Running this is idempotent — we look up by company name and only insert
    missing JDs (matched by exact title).
    """
    # Import inside the function so this module doesn't import the profiles
    # package at top level (avoids any future circular-import risk).
    from backend.interview.role_profiles import MOCK_JDS

    row = conn.execute(
        "SELECT id FROM companies WHERE name=?", (DEMO_COMPANY_NAME,)
    ).fetchone()
    if row:
        company_id = row["id"]
    else:
        company_id = uuid.uuid4().hex[:12]
        conn.execute(
            "INSERT INTO companies (id, name, email, password_hash, auth_token) VALUES (?,?,?,?,?)",
            (
                company_id,
                DEMO_COMPANY_NAME,
                DEMO_COMPANY_EMAIL,
                hash_password(DEMO_COMPANY_PASSWORD),
                uuid.uuid4().hex,
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
