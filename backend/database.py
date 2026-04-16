"""SQLite database for persistent storage of candidates, sessions, and evaluations."""
import hashlib
import os
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "portal.db"


def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


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
    conn.commit()
    conn.close()


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
