"""FastAPI server with REST + WebSocket endpoints.

Endpoints:
    POST   /api/session              -- create new interview session
    GET    /api/session/{id}         -- get session status
    POST   /api/session/{id}/turn    -- text turn
    POST   /api/session/{id}/audio-turn -- audio turn (file upload)
    POST   /api/session/{id}/cheating-report -- report cheating violations
    GET    /api/session/{id}/evaluations -- get evaluation scores
    POST   /api/resume/upload        -- upload and parse resume
    POST   /api/company              -- register company
    POST   /api/company/{id}/jobs    -- create job posting
    GET    /api/jobs                  -- list active jobs
    GET    /api/jobs/{id}            -- job details
    POST   /api/jobs/{id}/apply      -- apply to job
    POST   /api/invite/send          -- send interview invite
    GET    /api/invite/{token}       -- validate invite token
    WS     /ws/interview/{id}        -- real-time audio interview
    GET    /api/health               -- health check
    GET    /                         -- serve frontend
"""
from __future__ import annotations

import uuid
import json
import asyncio
import base64
import tempfile
import secrets
from datetime import datetime, timedelta
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.interview.engine import InterviewSession, Stage
from backend.interview.role_profiles import (
    list_role_families, ALL_PROFILES, SENIORITY_TIERS, infer_seniority,
    TOTAL_DURATION_MIN_DEFAULT, get_interviewer_name,
)
from backend.interview.preflight import build_interview_brief
from backend.interview.report import synthesize_report
from backend.tts.elevenlabs_tts import synthesize as elevenlabs_synthesize
from backend.tts.edge_tts_provider import synthesize as edge_synthesize
from backend.stt.deepgram_stt import transcribe_file, STTTimeout
from backend.stt.deepgram_streaming import StreamingTranscriber
from backend.database import (
    init_db, get_db, hash_password, verify_password, slugify, unique_slug,
    log_event, audit, ensure_aptitude_bank, ensure_coding_bank,
)


def _ensure_aptitude_bank(db, company_id: str) -> None:
    """Thin wrapper so the existing db connection is reused (avoids opening
    a second sqlite handle while one is still mid-transaction)."""
    if company_id:
        ensure_aptitude_bank(db, company_id)
        ensure_coding_bank(db, company_id)
from backend.resume_parser import extract_text_from_pdf, analyze_resume
from backend.email_service import (
    send_interview_invite, send_lead_notification, send_owner_setup_email,
)

# In-memory session store (hot cache)
sessions: dict[str, InterviewSession] = {}


# ── Simple in-process rate limiter ─────────────────────────────────────
#
# Sliding-window counter keyed by (bucket, ip). Good enough for a single
# uvicorn worker and abuse-prevention on public endpoints. For multi-worker
# deploys, swap this for a Redis-backed limiter. We deliberately keep it
# in-process to avoid adding Redis as a dependency.
import time as _time
_rate_buckets: dict[tuple[str, str], list[float]] = {}


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(request: Request, *, bucket: str, max_calls: int, window_s: float) -> None:
    """Raise 429 if the caller exceeds `max_calls` in the last `window_s`."""
    now = _time.monotonic()
    ip = _client_ip(request)
    key = (bucket, ip)
    history = _rate_buckets.setdefault(key, [])
    cutoff = now - window_s
    # Keep only the recent entries — bounded memory per IP.
    while history and history[0] < cutoff:
        history.pop(0)
    if len(history) >= max_calls:
        raise HTTPException(429, "Too many requests — slow down.")
    history.append(now)

AUDIO_DIR = Path("tests/audio/sessions")

# Server-side TTS (ElevenLabs) adds ~0.5-1.5s per turn. The browser has
# its own Web Speech API which speaks instantly; by default we skip the
# server synthesis entirely for lower latency. Flip USE_SERVER_TTS=1 in
# .env to restore ElevenLabs voice.
import os
from dotenv import load_dotenv

# Load .env before reading any env vars.
load_dotenv()

# Server-side TTS is on by default. We use Microsoft Edge TTS (free, no key,
# natural neural female voice — Aria) as the primary path. ElevenLabs is the
# alternate and is only attempted if TTS_PROVIDER=elevenlabs is set explicitly.
# Set USE_SERVER_TTS=0 to force the browser Web Speech API instead.
_tts_override = os.getenv("USE_SERVER_TTS")
if _tts_override is None:
    USE_SERVER_TTS = True  # Edge TTS works without any key
else:
    USE_SERVER_TTS = _tts_override in ("1", "true", "True", "yes")

TTS_PROVIDER = os.getenv("TTS_PROVIDER", "edge").lower()  # "edge" | "elevenlabs"


@asynccontextmanager
async def lifespan(app: FastAPI):
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    init_db()
    yield
    sessions.clear()


app = FastAPI(title="AI Interview Portal", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def static_cache_headers(request, call_next):
    """Cache headers tuned for the Next.js static export.

    Why this matters: Next.js writes content-hashed bundle names like
    `chunks/255-fbf9dcd7d44e3455.js`. Each rebuild changes hashes for any
    chunk whose source touched. If a browser caches an old `index.html` that
    references chunks from a previous build, the JS 404s and the page goes
    blank — exactly the "home page not loading" bug we hit.

    Strategy:
      - `/_next/static/*`  → cached forever, immutable. The hash in the URL
        already invalidates on change.
      - HTML pages         → `no-cache` so browsers always revalidate (304
        on no change, 200 on a rebuild). Cheap, and prevents stale-shell.
      - Everything else    → leave defaults.
    """
    response = await call_next(request)
    p = request.url.path
    if p.startswith("/_next/static/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif p == "/" or p.endswith(".html") or p.endswith("/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.middleware("http")
async def rsc_payload_redirect(request, call_next):
    """Next.js static-export emits an `index.txt` RSC payload alongside every
    `index.html`. The Next.js client router fetches these via fetch() during
    client-side navigation. If a *browser* lands on one directly (cached link,
    extension prefetch, manual URL), it shows the raw payload as plain text.

    This redirects user-facing navigations to the parent directory; the JS
    router still works because `fetch()` doesn't send `Sec-Fetch-Dest: document`.
    """
    path = request.url.path
    if path.endswith("/index.txt") and request.method in ("GET", "HEAD"):
        sec_dest = request.headers.get("sec-fetch-dest", "")
        accept = request.headers.get("accept", "")
        is_navigation = sec_dest == "document" or (
            "text/html" in accept and sec_dest != "empty"
        )
        if is_navigation:
            from fastapi.responses import RedirectResponse
            target = path[: -len("index.txt")] or "/"
            return RedirectResponse(target, status_code=308)
    return await call_next(request)


# --- Pydantic models ---

class SessionCreate(BaseModel):
    candidate_name: str | None = None
    use_structured: bool = True
    resume_id: str | None = None
    job_id: str | None = None
    invite_token: str | None = None
    target_duration_min: float | None = None  # defaults to TOTAL_DURATION_MIN_DEFAULT

class SessionResponse(BaseModel):
    session_id: str
    stage: str
    total_turns: int
    is_finished: bool
    evaluations_count: int
    avg_score: float | None
    avg_ai_likelihood: float | None = None
    cheating_flags_count: int = 0
    # Surface time-budget + interviewer info to the frontend so it can show
    # the timer / progress / "Hi, I'm Sara" without an extra round-trip.
    target_duration_min: float = float(TOTAL_DURATION_MIN_DEFAULT)
    elapsed_min: float = 0.0
    remaining_min: float = float(TOTAL_DURATION_MIN_DEFAULT)
    stage_remaining_min: float = 0.0
    interviewer_name: str = "Sara"
    role_family: str = "backend_engineering"
    seniority: str = "mid"
    # Whether the role gets a coding round after the voice interview. The
    # frontend uses this to decide whether to transition into the IDE phase
    # after wrap_up — non-engineering roles (PM, Sales, HR, etc.) go
    # straight to the report screen.
    has_coding_round: bool = True

class TextTurnRequest(BaseModel):
    text: str
    time_to_respond_ms: int = 0
    is_voice_input: bool = False

class TurnResponse(BaseModel):
    reply: str
    stage: str
    total_turns: int
    is_finished: bool
    audio_url: str | None = None
    # Populated on /audio-turn so the frontend can render the candidate's
    # own transcribed words instead of a "[voice input]" placeholder.
    transcript: str | None = None
    # Per-turn score and time-remaining surface so the UI can show a chip
    # and update its progress bar without polling.
    last_turn_score: float | None = None
    elapsed_min: float = 0.0
    remaining_min: float = 0.0
    stage_remaining_min: float = 0.0

class CompanyCreate(BaseModel):
    name: str
    email: str | None = None
    password: str

class CompanyLogin(BaseModel):
    name: str
    password: str

class JobCreate(BaseModel):
    title: str
    description: str = ""
    required_skills: str = ""
    role_family: str = "software_engineering"
    seniority: str = "mid"
    min_experience_years: float = 0
    max_experience_years: float = 40
    department: str = ""
    employment_type: str = "full_time"

class JobApply(BaseModel):
    candidate_name: str
    candidate_email: str

class InviteSend(BaseModel):
    application_id: str

class CheatingReport(BaseModel):
    violations: list[dict]


# --- Health ---

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


# --- Session endpoints ---

@app.post("/api/session", response_model=SessionResponse)
def create_session(req: SessionCreate):
    sid = uuid.uuid4().hex[:12]

    resume_context = ""
    resume_json: dict = {}
    job_row_for_brief: dict | None = None
    job_title = ""
    job_skills: list[str] = []
    job_description = ""
    role_family = "backend_engineering"
    seniority = "mid"
    candidate_name = req.candidate_name
    candidate_experience_years: float | None = None
    session_company_id: str | None = None
    session_application_id: str | None = None

    # Load resume context if provided
    if req.resume_id:
        db = get_db()
        row = db.execute("SELECT raw_text, skills_json FROM resumes WHERE id=?", (req.resume_id,)).fetchone()
        db.close()
        if row:
            resume_json = json.loads(row["skills_json"]) if row["skills_json"] else {}
            resume_context = resume_json.get("experience_summary", row["raw_text"][:1000])
            if resume_json.get("skills"):
                resume_context += f"\nSkills: {', '.join(resume_json['skills'])}"
            if resume_json.get("suggested_questions"):
                resume_context += f"\nSuggested questions: {'; '.join(resume_json['suggested_questions'][:5])}"
            if resume_json.get("experience_years") is not None:
                try:
                    candidate_experience_years = float(resume_json["experience_years"])
                except (TypeError, ValueError):
                    pass

    # Load job context if provided
    if req.job_id:
        db = get_db()
        row = db.execute(
            "SELECT title, description, required_skills, role_family, seniority, "
            "min_experience_years, max_experience_years FROM jobs WHERE id=?",
            (req.job_id,)
        ).fetchone()
        db.close()
        if row:
            job_row_for_brief = dict(row)
            job_title = row["title"]
            job_description = row["description"] or ""
            job_skills = [s.strip() for s in (row["required_skills"] or "").split(",") if s.strip()]
            role_family = row["role_family"] or role_family
            seniority = row["seniority"] or seniority

    # Validate invite token if provided
    if req.invite_token:
        db = get_db()
        app_row = db.execute(
            "SELECT a.*, c.name as cname, c.email, j.title, j.description, j.required_skills, "
            "j.role_family, j.seniority, j.min_experience_years, j.max_experience_years, "
            "j.company_id, j.aptitude_required, "
            "r.raw_text, r.skills_json "
            "FROM applications a "
            "JOIN candidates c ON a.candidate_id=c.id "
            "LEFT JOIN jobs j ON a.job_id=j.id "
            "LEFT JOIN resumes r ON a.resume_id=r.id "
            "WHERE a.invite_token=? AND a.status IN ('invited','in_progress','aptitude_passed','rejected_aptitude')",
            (req.invite_token,)
        ).fetchone()
        db.close()
        if app_row:
            if app_row["invite_revoked_at"]:
                raise HTTPException(410, "This interview link has been revoked")
            if app_row["invite_expires_at"]:
                try:
                    exp = datetime.fromisoformat(app_row["invite_expires_at"])
                    if exp < datetime.utcnow():
                        raise HTTPException(410, "This interview link has expired")
                except HTTPException:
                    raise
                except (ValueError, TypeError):
                    pass

            # ── Aptitude gate ─────────────────────────────────────────────
            # If the job requires aptitude and this application hasn't
            # passed it, refuse to create the interview session. The
            # frontend reads the structured detail and redirects.
            # 'skipped' = grandfathered legacy app; 'passed' = cleared.
            apt_status = app_row["aptitude_status"] or "pending"
            apt_required = bool(app_row["aptitude_required"])
            if apt_required and apt_status not in ("passed", "skipped"):
                if apt_status == "failed":
                    raise HTTPException(
                        status_code=403,
                        detail={
                            "error": "aptitude_failed",
                            "message": "You did not clear the aptitude round. This application is closed.",
                        },
                    )
                raise HTTPException(
                    status_code=403,
                    detail={
                        "error": "aptitude_required",
                        "aptitude_url": f"/aptitude/?invite={req.invite_token}",
                        "message": "Please complete the aptitude round before starting the interview.",
                    },
                )

            session_company_id = app_row["company_id"]
            session_application_id = app_row["id"]
            candidate_name = app_row["cname"]
            if app_row["title"]:
                job_title = app_row["title"]
                job_description = app_row["description"] or ""
                job_skills = [s.strip() for s in (app_row["required_skills"] or "").split(",") if s.strip()]
                role_family = app_row["role_family"] or role_family
                seniority = app_row["seniority"] or seniority
                job_row_for_brief = {
                    "title": job_title,
                    "description": job_description,
                    "required_skills": app_row["required_skills"],
                    "role_family": role_family,
                    "seniority": seniority,
                    "min_experience_years": app_row["min_experience_years"],
                    "max_experience_years": app_row["max_experience_years"],
                }
            if app_row["raw_text"]:
                resume_json = json.loads(app_row["skills_json"]) if app_row["skills_json"] else {}
                resume_context = resume_json.get("experience_summary", app_row["raw_text"][:1000])
                if resume_json.get("skills"):
                    resume_context += f"\nSkills: {', '.join(resume_json['skills'])}"
                if resume_json.get("experience_years") is not None:
                    try:
                        candidate_experience_years = float(resume_json["experience_years"])
                    except (TypeError, ValueError):
                        pass

    # If the candidate's experience is clearly outside the posted range, nudge
    # seniority toward the candidate's actual level.
    if candidate_experience_years is not None:
        seniority = infer_seniority(candidate_experience_years)

    target_minutes = float(req.target_duration_min) if req.target_duration_min else float(TOTAL_DURATION_MIN_DEFAULT)
    # Sane bounds — 5 minutes is a smoke test, 60 is the hard upper.
    target_minutes = max(5.0, min(60.0, target_minutes))

    # Run preflight: read resume against JD and produce the interview brief
    # the engine will surface to the LLM. Best-effort — empty dict on failure.
    brief: dict = {}
    if resume_json or job_row_for_brief:
        try:
            brief = build_interview_brief(resume_json or {}, job_row_for_brief, seniority)
        except Exception:
            brief = {}

    session = InterviewSession(
        session_id=sid,
        candidate_name=candidate_name,
        use_structured=req.use_structured,
        resume_context=resume_context,
        job_title=job_title,
        job_skills=job_skills,
        job_description=job_description,
        role_family=role_family,
        seniority=seniority,
        candidate_experience_years=candidate_experience_years,
        target_duration_min=target_minutes,
        interview_brief=brief,
    )
    sessions[sid] = session

    # If we resolved company_id from the invite token, prefer that. Otherwise
    # try to derive it from the job_id (direct session creation by recruiters).
    if not session_company_id and req.job_id:
        db = get_db()
        jrow = db.execute(
            "SELECT company_id FROM jobs WHERE id=?", (req.job_id,)
        ).fetchone()
        db.close()
        if jrow:
            session_company_id = jrow["company_id"]

    # Persist to DB (with the new columns)
    db = get_db()
    db.execute(
        "INSERT INTO interview_sessions "
        "(id, candidate_id, resume_id, job_id, role_family, seniority, "
        " target_duration_min, interview_brief_json, company_id) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (sid, None, req.resume_id, req.job_id, role_family, seniority,
         target_minutes, json.dumps(brief) if brief else None,
         session_company_id),
    )
    if session_application_id:
        db.execute(
            "UPDATE applications SET session_id=?, invite_used_at=CURRENT_TIMESTAMP, "
            "status='in_progress' WHERE id=?",
            (sid, session_application_id),
        )
    db.commit()
    db.close()
    log_event(
        "interview_started",
        company_id=session_company_id,
        job_id=req.job_id,
        application_id=session_application_id,
        session_id=sid,
    )

    status = session.get_status()
    return SessionResponse(
        session_id=sid,
        stage=status["stage"],
        total_turns=status["total_turns"],
        is_finished=status["is_finished"],
        evaluations_count=status["evaluations_count"],
        avg_score=status["avg_score"],
        avg_ai_likelihood=status["avg_ai_likelihood"],
        cheating_flags_count=status["cheating_flags_count"],
        target_duration_min=status["target_duration_min"],
        elapsed_min=status["elapsed_min"],
        remaining_min=status["remaining_min"],
        stage_remaining_min=status["stage_remaining_min"],
        interviewer_name=status["interviewer_name"],
        role_family=status["role_family"],
        seniority=status["seniority"],
        has_coding_round=status["has_coding_round"],
    )


@app.get("/api/session/{session_id}", response_model=SessionResponse)
def get_session(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    status = session.get_status()
    return SessionResponse(
        session_id=session_id,
        stage=status["stage"],
        total_turns=status["total_turns"],
        is_finished=status["is_finished"],
        evaluations_count=status["evaluations_count"],
        avg_score=status["avg_score"],
        avg_ai_likelihood=status["avg_ai_likelihood"],
        cheating_flags_count=status["cheating_flags_count"],
        target_duration_min=status["target_duration_min"],
        elapsed_min=status["elapsed_min"],
        remaining_min=status["remaining_min"],
        stage_remaining_min=status["stage_remaining_min"],
        interviewer_name=status["interviewer_name"],
        role_family=status["role_family"],
        seniority=status["seniority"],
        has_coding_round=status["has_coding_round"],
    )


@app.get("/api/session/{session_id}/report")
async def get_report(session_id: str):
    """Synthesized end-of-interview report. Cached on the session after the
    first call so repeated views are instant. The candidate-side report page
    polls this endpoint after the interview ends."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session.cached_report:
        return _report_envelope(session, session.cached_report)

    # Run synthesis off the event loop — it's an LLM call.
    report = await asyncio.to_thread(synthesize_report, session)
    # Attach coding-round submissions so both the candidate report and the
    # recruiter view (which reads report_json) can render the coding card.
    report["coding_submissions"] = session.coding_submissions
    session.cached_report = report

    # Persist EVERY column the recruiter dashboard reads — without this, the
    # candidate's score never makes it out of in-memory and the recruiter
    # sees "Not yet scored" forever. We write:
    #   - report_json    : full synthesized report (cheat-analysis tab)
    #   - total_score    : avg_score from session.get_status()
    #   - cheating_flags : the in-memory list batched from /cheating-report
    #   - status         : 'finished' so the dashboard finished-count moves
    #   - finished_at    : completion timestamp
    # We also bump applications.status='finished' so the kanban shows the
    # candidate in the correct column.
    try:
        status = session.get_status()
        avg = status.get("avg_score")
        db = get_db()
        db.execute(
            "UPDATE interview_sessions "
            "SET report_json=?, total_score=?, cheating_flags=?, status='finished', "
            "    finished_at=CURRENT_TIMESTAMP "
            "WHERE id=?",
            (
                json.dumps(report),
                float(avg) if avg is not None else None,
                json.dumps(session.cheating_flags),
                session_id,
            ),
        )
        # Move the linked application to 'finished' so the recruiter pipeline
        # advances. We only move from in_progress — never overwrite a manual
        # rejection or hire decision the recruiter already made.
        db.execute(
            "UPDATE applications SET status='finished' "
            "WHERE session_id=? AND status='in_progress'",
            (session_id,),
        )
        db.commit()
        db.close()
        log_event("interview_finished", session_id=session_id)
    except Exception as e:
        # Don't fail the candidate's view just because the write failed —
        # but DO log it so we notice in the server log.
        print(f"[REPORT] Persist failed for {session_id}: {e}")

    return _report_envelope(session, report)


def _report_envelope(session: InterviewSession, report: dict) -> dict:
    status = session.get_status()
    return {
        "session_id": session.session_id,
        "interviewer_name": status["interviewer_name"],
        "role_family": status["role_family"],
        "seniority": status["seniority"],
        "candidate_name": session.candidate_name,
        "job_title": session.job_title,
        "target_duration_min": status["target_duration_min"],
        "elapsed_min": status["elapsed_min"],
        "total_turns": status["total_turns"],
        "evaluations_count": status["evaluations_count"],
        "avg_score": status["avg_score"],
        "avg_ai_likelihood": status["avg_ai_likelihood"],
        "cheating_flags_count": status["cheating_flags_count"],
        "cheating_flags": session.cheating_flags,
        "topics_covered": status["topics_covered"],
        "interview_brief": session.interview_brief,
        "evaluations": session.evaluations,
        "coding_submissions": report.get("coding_submissions", session.coding_submissions),
        "report": report,
    }


@app.post("/api/session/{session_id}/turn", response_model=TurnResponse)
async def text_turn(session_id: str, req: TextTurnRequest):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    # Run LLM call in thread pool (CPU-bound work)
    reply = await asyncio.to_thread(
        session.turn, req.text, req.time_to_respond_ms, req.is_voice_input
    )
    status = session.get_status()

    audio_url = await _try_synthesize(session_id, reply, status["total_turns"])

    last_score = session.evaluations[-1].get("score") if session.evaluations else None
    return TurnResponse(
        reply=reply,
        stage=status["stage"],
        total_turns=status["total_turns"],
        is_finished=status["is_finished"],
        audio_url=audio_url,
        last_turn_score=last_score,
        elapsed_min=status["elapsed_min"],
        remaining_min=status["remaining_min"],
        stage_remaining_min=status["stage_remaining_min"],
    )


async def _try_synthesize(session_id: str, text: str, turn_n: int) -> str | None:
    """Attempt server-side TTS. Tries the configured provider first (Edge by
    default), then falls through to the alternate. On total failure, logs a
    one-line reason and returns None so the frontend can fall back to the
    browser Web Speech API."""
    if not USE_SERVER_TTS:
        return None

    audio_path = AUDIO_DIR / session_id / f"turn_{turn_n}.mp3"
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    rel_url = f"/api/audio/{session_id}/turn_{turn_n}.mp3"

    providers: list[tuple[str, callable]] = []
    if TTS_PROVIDER == "elevenlabs":
        providers.append(("elevenlabs", elevenlabs_synthesize))
        providers.append(("edge", edge_synthesize))
    else:
        providers.append(("edge", edge_synthesize))
        if os.getenv("ELEVENLABS_API_KEY"):
            providers.append(("elevenlabs", elevenlabs_synthesize))

    last_error = None
    for name, fn in providers:
        try:
            await asyncio.to_thread(fn, text, audio_path)
            return rel_url
        except Exception as e:
            last_error = (name, str(e)[:200].replace("\n", " "))
            continue

    if last_error:
        print(
            f"[TTS] all providers failed (session={session_id} turn={turn_n}): "
            f"last={last_error[0]}: {last_error[1]}"
        )
    return None


@app.post("/api/session/{session_id}/audio-turn", response_model=TurnResponse)
async def audio_turn(session_id: str, audio: UploadFile = File(...)):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    suffix = ".webm" if "webm" in (audio.content_type or "") else ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        # Run STT in a thread pool so the event loop stays free for other
        # requests while Deepgram is uploading / processing the audio.
        transcript = await asyncio.to_thread(transcribe_file, str(tmp_path))
    except STTTimeout as e:
        # All Deepgram retries exhausted. Surface this to the client as a
        # 503 with a stable error code so the frontend can retry the whole
        # /audio-turn request (the blob is still cached in the browser)
        # rather than discarding the candidate's answer.
        raise HTTPException(
            status_code=503,
            detail={"error": "stt_timeout", "message": str(e)},
        )
    except HTTPException:
        raise
    except Exception as e:
        # Any other STT failure — expose as 502 with a stable code so the
        # frontend can distinguish "service problem, retry" from genuine
        # "no speech" 400s.
        raise HTTPException(
            status_code=502,
            detail={"error": "stt_failed", "message": str(e)},
        )
    finally:
        tmp_path.unlink(missing_ok=True)

    if not transcript or not transcript.strip():
        raise HTTPException(400, "No speech detected in audio")

    # Run LLM in thread pool
    reply = await asyncio.to_thread(session.turn, transcript.strip(), 0, True)
    status = session.get_status()

    audio_url = await _try_synthesize(session_id, reply, status["total_turns"])

    last_score = session.evaluations[-1].get("score") if session.evaluations else None
    return TurnResponse(
        reply=reply,
        stage=status["stage"],
        total_turns=status["total_turns"],
        is_finished=status["is_finished"],
        audio_url=audio_url,
        transcript=transcript.strip(),
        last_turn_score=last_score,
        elapsed_min=status["elapsed_min"],
        remaining_min=status["remaining_min"],
        stage_remaining_min=status["stage_remaining_min"],
    )


@app.post("/api/session/{session_id}/cheating-report")
def report_cheating(session_id: str, report: CheatingReport):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    for v in report.violations:
        session.add_cheating_flag(v)
    # Mirror to the DB so the recruiter's cheat-analysis tab populates in
    # real time AND violations survive a server restart. We rewrite the
    # whole JSON blob each batch — the column is small and a single row.
    try:
        db = get_db()
        db.execute(
            "UPDATE interview_sessions SET cheating_flags=? WHERE id=?",
            (json.dumps(session.cheating_flags), session_id),
        )
        db.commit()
        db.close()
    except Exception as e:
        print(f"[CHEAT] Persist failed for {session_id}: {e}")
    return {"status": "recorded", "total_flags": len(session.cheating_flags)}


@app.get("/api/audio/{session_id}/{filename}")
def serve_audio(session_id: str, filename: str):
    # Prevent path traversal
    if ".." in filename or "/" in filename:
        raise HTTPException(400, "Invalid filename")
    path = AUDIO_DIR / session_id / filename
    if not path.exists():
        raise HTTPException(404, "Audio file not found")
    return FileResponse(path, media_type="audio/mpeg")


@app.get("/api/session/{session_id}/evaluations")
def get_evaluations(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    status = session.get_status()
    return {
        "session_id": session_id,
        "evaluations": session.evaluations,
        "avg_score": status["avg_score"],
        "avg_ai_likelihood": status["avg_ai_likelihood"],
        "cheating_flags_count": status["cheating_flags_count"],
        "cheating_flags": session.cheating_flags,
    }


# ─── Aptitude gate (candidate-facing) ──────────────────────────────────
#
# Flow:
#   GET  /api/aptitude/{token}            → load questions + state
#   POST /api/aptitude/{token}/start      → create attempt, set in_progress
#   POST /api/aptitude/{token}/submit     → grade, finalize, set passed/failed
#
# Server enforces the timer (started_at + duration_min). A late submission
# is silently graded on whatever answers came in (typically auto-fired by
# the browser on timeout, but we don't trust the client).


def _load_application_by_invite(invite_token: str) -> dict:
    """Resolve an invite token to its application row + job aptitude config.

    Raises 404 if the token is unknown, 410 if revoked/expired.
    """
    db = get_db()
    row = db.execute(
        "SELECT a.id AS application_id, a.candidate_id, a.job_id, "
        "       a.aptitude_status, a.aptitude_score, a.aptitude_started_at, "
        "       a.aptitude_completed_at, a.invite_expires_at, a.invite_revoked_at, "
        "       j.company_id, j.title AS job_title, j.role_family, j.seniority, "
        "       j.aptitude_required, j.aptitude_pass_score, j.aptitude_total, "
        "       j.aptitude_duration_min, "
        "       c.name AS candidate_name "
        "FROM applications a "
        "LEFT JOIN jobs j ON a.job_id=j.id "
        "LEFT JOIN candidates c ON a.candidate_id=c.id "
        "WHERE a.invite_token=?",
        (invite_token,),
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Invite not found")
    if row["invite_revoked_at"]:
        raise HTTPException(410, "This link has been revoked")
    if row["invite_expires_at"]:
        try:
            exp = datetime.fromisoformat(row["invite_expires_at"])
            if exp < datetime.utcnow():
                raise HTTPException(410, "This link has expired")
        except (ValueError, TypeError):
            pass
    return dict(row)


@app.get("/api/aptitude/{invite_token}")
def aptitude_get(invite_token: str):
    """Return the active question bank for the candidate's company + their
    current attempt state. Questions are returned WITHOUT correct_index so a
    snooping candidate can't read it out of the network panel."""
    app_row = _load_application_by_invite(invite_token)
    db = get_db()
    # Self-heal: an application can be stuck at 'skipped' if it was created
    # before the aptitude gate existed (one-shot backfill) OR if it's a
    # returning candidate hitting the duplicate-application path which
    # hands back an old invite token. If the job actually REQUIRES
    # aptitude, reset the status to 'pending' so the candidate sees the
    # test now instead of silently bypassing.
    if (
        app_row["aptitude_status"] == "skipped"
        and bool(app_row["aptitude_required"])
    ):
        db.execute(
            "UPDATE applications SET aptitude_status='pending' WHERE id=?",
            (app_row["application_id"],),
        )
        db.commit()
        app_row = dict(app_row)
        app_row["aptitude_status"] = "pending"
    total_q = int(app_row["aptitude_total"] or 10)
    # Role-aware question selection: prefer questions tagged to this job's
    # role_family, then fall back to general (role_family IS NULL) questions
    # so a partially-curated bank still serves a full 10-question round.
    role_fam = app_row["role_family"] or "general"
    qrows = db.execute(
        "SELECT id, category, question_text, options_json, difficulty, position, role_family "
        "FROM aptitude_questions "
        "WHERE company_id=? AND active=1 "
        "  AND (role_family=? OR role_family IS NULL OR role_family='') "
        "ORDER BY CASE WHEN role_family=? THEN 0 ELSE 1 END, position ASC, created_at ASC "
        "LIMIT ?",
        (app_row["company_id"], role_fam, role_fam, total_q),
    ).fetchall()
    # If the role-aware filter returned nothing (e.g. a company with zero
    # tagged questions), fall back to the original company-wide query so
    # the candidate isn't shown an empty test.
    if not qrows:
        qrows = db.execute(
            "SELECT id, category, question_text, options_json, difficulty, position, role_family "
            "FROM aptitude_questions WHERE company_id=? AND active=1 "
            "ORDER BY position ASC, created_at ASC LIMIT ?",
            (app_row["company_id"], total_q),
        ).fetchall()
    questions = [
        {
            "id": r["id"],
            "category": r["category"],
            "question_text": r["question_text"],
            "options": json.loads(r["options_json"]),
            "difficulty": r["difficulty"],
        }
        for r in qrows
    ]
    # If an attempt is in progress, surface time remaining.
    seconds_remaining: int | None = None
    if app_row["aptitude_status"] == "in_progress" and app_row["aptitude_started_at"]:
        try:
            started = datetime.fromisoformat(app_row["aptitude_started_at"])
            total_sec = int(app_row["aptitude_duration_min"] or 10) * 60
            elapsed = int((datetime.utcnow() - started).total_seconds())
            seconds_remaining = max(0, total_sec - elapsed)
        except (ValueError, TypeError):
            seconds_remaining = None
    db.close()
    return {
        "candidate_name": app_row["candidate_name"],
        "job_title": app_row["job_title"],
        "status": app_row["aptitude_status"],
        "score": app_row["aptitude_score"],
        "pass_score": app_row["aptitude_pass_score"] or 6,
        "total": app_row["aptitude_total"] or 10,
        "duration_min": app_row["aptitude_duration_min"] or 10,
        "seconds_remaining": seconds_remaining,
        "questions": questions,
        "aptitude_required": bool(app_row["aptitude_required"]),
    }


@app.post("/api/aptitude/{invite_token}/start")
def aptitude_start(invite_token: str):
    """Begin the timed aptitude round. Idempotent: if an attempt is already
    in progress, returns it instead of overwriting."""
    app_row = _load_application_by_invite(invite_token)
    if not app_row["aptitude_required"]:
        return {"status": "skipped", "message": "Aptitude not required for this job."}
    if app_row["aptitude_status"] == "passed":
        return {"status": "passed", "message": "Already cleared."}
    if app_row["aptitude_status"] == "failed":
        raise HTTPException(403, "You did not clear the aptitude round. Locked out.")

    db = get_db()
    if app_row["aptitude_status"] == "in_progress" and app_row["aptitude_started_at"]:
        # Resume the existing attempt.
        db.close()
        return aptitude_get(invite_token)

    # Fresh start.
    attempt_id = uuid.uuid4().hex[:12]
    now = datetime.utcnow().isoformat()
    db.execute(
        "INSERT INTO aptitude_attempts (id, application_id, started_at, status) "
        "VALUES (?,?,?,?)",
        (attempt_id, app_row["application_id"], now, "in_progress"),
    )
    db.execute(
        "UPDATE applications SET aptitude_status='in_progress', aptitude_started_at=? "
        "WHERE id=?",
        (now, app_row["application_id"]),
    )
    db.commit()
    db.close()
    log_event(
        "aptitude_started",
        company_id=app_row["company_id"],
        job_id=app_row["job_id"],
        application_id=app_row["application_id"],
    )
    return aptitude_get(invite_token)


class AptitudeSubmit(BaseModel):
    # Map of question_id → selected option index (0-based). Missing answers
    # are graded as wrong.
    answers: dict[str, int]


@app.post("/api/aptitude/{invite_token}/submit")
def aptitude_submit(invite_token: str, payload: AptitudeSubmit):
    """Grade the attempt and finalize pass/fail."""
    app_row = _load_application_by_invite(invite_token)
    if not app_row["aptitude_required"]:
        raise HTTPException(400, "Aptitude not required for this job.")
    if app_row["aptitude_status"] in ("passed", "failed"):
        raise HTTPException(400, f"Aptitude already {app_row['aptitude_status']}.")
    if app_row["aptitude_status"] != "in_progress":
        raise HTTPException(400, "Aptitude not started yet — call /start first.")

    pass_score = int(app_row["aptitude_pass_score"] or 6)
    total = int(app_row["aptitude_total"] or 10)

    db = get_db()
    # Grading honours the same role-aware ordering that we serve to the
    # candidate — otherwise a candidate could see role-specific questions
    # but be graded against the generic bank (or vice versa).
    role_fam = app_row["role_family"] or "general"
    qrows = db.execute(
        "SELECT id, correct_index FROM aptitude_questions "
        "WHERE company_id=? AND active=1 "
        "  AND (role_family=? OR role_family IS NULL OR role_family='') "
        "ORDER BY CASE WHEN role_family=? THEN 0 ELSE 1 END, position ASC, created_at ASC "
        "LIMIT ?",
        (app_row["company_id"], role_fam, role_fam, total),
    ).fetchall()
    if not qrows:
        qrows = db.execute(
            "SELECT id, correct_index FROM aptitude_questions "
            "WHERE company_id=? AND active=1 "
            "ORDER BY position ASC, created_at ASC LIMIT ?",
            (app_row["company_id"], total),
        ).fetchall()

    score = 0
    for r in qrows:
        chosen = payload.answers.get(r["id"])
        if chosen is not None and int(chosen) == int(r["correct_index"]):
            score += 1

    passed = score >= pass_score
    new_status = "passed" if passed else "failed"
    now = datetime.utcnow().isoformat()

    db.execute(
        "UPDATE aptitude_attempts SET completed_at=?, status=?, score=?, total=?, answers_json=? "
        "WHERE application_id=? AND status='in_progress'",
        (now, new_status, score, total, json.dumps(payload.answers),
         app_row["application_id"]),
    )
    # Also update applications.status so the recruiter view reflects progress.
    new_app_status = "aptitude_passed" if passed else "rejected_aptitude"
    db.execute(
        "UPDATE applications SET aptitude_status=?, aptitude_score=?, "
        "aptitude_completed_at=?, status=? WHERE id=?",
        (new_status, score, now, new_app_status, app_row["application_id"]),
    )
    db.commit()
    db.close()
    log_event(
        "aptitude_completed",
        company_id=app_row["company_id"],
        job_id=app_row["job_id"],
        application_id=app_row["application_id"],
        metadata={"score": score, "total": total, "passed": passed},
    )
    return {
        "status": new_status,
        "score": score,
        "total": total,
        "pass_score": pass_score,
        "passed": passed,
    }


# ─── Aptitude question bank (recruiter-facing CRUD) ───────────────────


def _verify_slug_auth(slug: str, request: Request) -> dict:
    """Resolve `/c/<slug>` to a company row and verify the bearer token.
    Returns the company row. Raises 401/404 as appropriate."""
    db = get_db()
    co = db.execute("SELECT * FROM companies WHERE slug=?", (slug,)).fetchone()
    db.close()
    if not co:
        raise HTTPException(404, "Workspace not found")
    token = (request.headers.get("authorization", "") or "").removeprefix("Bearer ").strip()
    if not token or token != co["auth_token"]:
        raise HTTPException(401, "Unauthorized")
    return dict(co)


class AptitudeQuestionIn(BaseModel):
    category: str = "general"
    question_text: str
    options: list[str]
    correct_index: int
    difficulty: str = "easy"
    active: bool = True
    position: int | None = None


@app.get("/api/c/{slug}/aptitude/questions")
def aptitude_q_list(slug: str, request: Request):
    """List the company's aptitude bank (recruiter only). Includes
    correct_index — this endpoint is auth-gated."""
    co = _verify_slug_auth(slug, request)
    db = get_db()
    rows = db.execute(
        "SELECT id, category, question_text, options_json, correct_index, "
        "       difficulty, active, position, created_at "
        "FROM aptitude_questions WHERE company_id=? "
        "ORDER BY position ASC, created_at ASC",
        (co["id"],),
    ).fetchall()
    db.close()
    return [
        {
            "id": r["id"],
            "category": r["category"],
            "question_text": r["question_text"],
            "options": json.loads(r["options_json"]),
            "correct_index": r["correct_index"],
            "difficulty": r["difficulty"],
            "active": bool(r["active"]),
            "position": r["position"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@app.post("/api/c/{slug}/aptitude/questions")
def aptitude_q_create(slug: str, q: AptitudeQuestionIn, request: Request):
    co = _verify_slug_auth(slug, request)
    if len(q.options) < 2 or len(q.options) > 6:
        raise HTTPException(400, "Provide 2 to 6 options.")
    if q.correct_index < 0 or q.correct_index >= len(q.options):
        raise HTTPException(400, "correct_index out of range.")
    qid = uuid.uuid4().hex[:12]
    db = get_db()
    # Auto-position: append to end if not provided.
    pos = q.position
    if pos is None:
        max_pos = db.execute(
            "SELECT COALESCE(MAX(position), -1) AS p FROM aptitude_questions WHERE company_id=?",
            (co["id"],),
        ).fetchone()["p"]
        pos = (max_pos or -1) + 1
    db.execute(
        "INSERT INTO aptitude_questions "
        "(id, company_id, category, question_text, options_json, correct_index, difficulty, active, position) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (qid, co["id"], q.category, q.question_text.strip(),
         json.dumps(q.options), q.correct_index, q.difficulty,
         1 if q.active else 0, pos),
    )
    db.commit()
    db.close()
    return {"id": qid, "ok": True}


@app.patch("/api/c/{slug}/aptitude/questions/{qid}")
def aptitude_q_update(slug: str, qid: str, q: AptitudeQuestionIn, request: Request):
    co = _verify_slug_auth(slug, request)
    if len(q.options) < 2 or len(q.options) > 6:
        raise HTTPException(400, "Provide 2 to 6 options.")
    if q.correct_index < 0 or q.correct_index >= len(q.options):
        raise HTTPException(400, "correct_index out of range.")
    db = get_db()
    row = db.execute(
        "SELECT id FROM aptitude_questions WHERE id=? AND company_id=?",
        (qid, co["id"]),
    ).fetchone()
    if not row:
        db.close()
        raise HTTPException(404, "Question not found")
    db.execute(
        "UPDATE aptitude_questions SET category=?, question_text=?, options_json=?, "
        "correct_index=?, difficulty=?, active=?, position=COALESCE(?, position) WHERE id=?",
        (q.category, q.question_text.strip(), json.dumps(q.options),
         q.correct_index, q.difficulty, 1 if q.active else 0, q.position, qid),
    )
    db.commit()
    db.close()
    return {"ok": True}


@app.delete("/api/c/{slug}/aptitude/questions/{qid}")
def aptitude_q_delete(slug: str, qid: str, request: Request):
    """Soft delete: sets active=0 so historical attempts still resolve."""
    co = _verify_slug_auth(slug, request)
    db = get_db()
    row = db.execute(
        "SELECT id FROM aptitude_questions WHERE id=? AND company_id=?",
        (qid, co["id"]),
    ).fetchone()
    if not row:
        db.close()
        raise HTTPException(404, "Question not found")
    db.execute("UPDATE aptitude_questions SET active=0 WHERE id=?", (qid,))
    db.commit()
    db.close()
    return {"ok": True}


# ─── Coding problems CRUD (recruiter dashboard) ───────────────────────
#
# The coding round at the end of the interview pulls its problem from this
# table. One problem per (company, role_family) by default; recruiters can
# add more or edit/disable them through the dashboard. Candidate-facing
# endpoint is /api/session/{id}/coding-problem (further below).


class CodingProblemIn(BaseModel):
    role_family: str | None = None  # NULL means "generic / fallback"
    title: str
    prompt: str
    hint: str = ""
    examples: list[dict] = []  # [{"input": "...", "output": "..."}]
    boilerplate: str = ""  # starter code the candidate fills in (any/all roles)
    active: bool = True
    position: int | None = None


@app.get("/api/c/{slug}/coding-problems")
def coding_q_list(slug: str, request: Request):
    co = _verify_slug_auth(slug, request)
    # Make sure the bank exists so first-time recruiters see the seed
    # problems and can edit them, rather than an empty list.
    db = get_db()
    ensure_coding_bank(db, co["id"])
    rows = db.execute(
        "SELECT id, role_family, title, prompt, hint, examples_json, "
        "       boilerplate, active, position, created_at "
        "FROM coding_problems WHERE company_id=? "
        "ORDER BY COALESCE(role_family, ''), position ASC, created_at ASC",
        (co["id"],),
    ).fetchall()
    db.close()
    return [
        {
            "id": r["id"],
            "role_family": r["role_family"],
            "title": r["title"],
            "prompt": r["prompt"],
            "hint": r["hint"] or "",
            "examples": json.loads(r["examples_json"] or "[]"),
            "boilerplate": r["boilerplate"] or "",
            "active": bool(r["active"]),
            "position": r["position"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@app.post("/api/c/{slug}/coding-problems")
def coding_q_create(slug: str, q: CodingProblemIn, request: Request):
    co = _verify_slug_auth(slug, request)
    if not q.title.strip() or not q.prompt.strip():
        raise HTTPException(400, "Title and prompt are required.")
    if q.role_family is not None and q.role_family.strip() == "":
        q.role_family = None
    qid = uuid.uuid4().hex[:12]
    db = get_db()
    pos = q.position
    if pos is None:
        pos = (db.execute(
            "SELECT COALESCE(MAX(position), -1) AS p FROM coding_problems WHERE company_id=?",
            (co["id"],),
        ).fetchone()["p"] or -1) + 1
    db.execute(
        "INSERT INTO coding_problems "
        "(id, company_id, role_family, title, prompt, hint, examples_json, boilerplate, active, position) "
        "VALUES (?,?,?,?,?,?,?,?,?,?)",
        (
            qid, co["id"], q.role_family, q.title.strip(), q.prompt.strip(),
            q.hint.strip(), json.dumps(q.examples or []), q.boilerplate or "",
            1 if q.active else 0, pos,
        ),
    )
    db.commit()
    db.close()
    return {"id": qid, "ok": True}


@app.patch("/api/c/{slug}/coding-problems/{qid}")
def coding_q_update(slug: str, qid: str, q: CodingProblemIn, request: Request):
    co = _verify_slug_auth(slug, request)
    if not q.title.strip() or not q.prompt.strip():
        raise HTTPException(400, "Title and prompt are required.")
    if q.role_family is not None and q.role_family.strip() == "":
        q.role_family = None
    db = get_db()
    row = db.execute(
        "SELECT id FROM coding_problems WHERE id=? AND company_id=?",
        (qid, co["id"]),
    ).fetchone()
    if not row:
        db.close()
        raise HTTPException(404, "Problem not found")
    db.execute(
        "UPDATE coding_problems SET role_family=?, title=?, prompt=?, hint=?, "
        "examples_json=?, boilerplate=?, active=?, position=COALESCE(?, position) WHERE id=?",
        (
            q.role_family, q.title.strip(), q.prompt.strip(), q.hint.strip(),
            json.dumps(q.examples or []), q.boilerplate or "",
            1 if q.active else 0, q.position, qid,
        ),
    )
    db.commit()
    db.close()
    return {"ok": True}


@app.delete("/api/c/{slug}/coding-problems/{qid}")
def coding_q_delete(slug: str, qid: str, request: Request):
    """Soft delete — preserves history if the problem was already served."""
    co = _verify_slug_auth(slug, request)
    db = get_db()
    row = db.execute(
        "SELECT id FROM coding_problems WHERE id=? AND company_id=?",
        (qid, co["id"]),
    ).fetchone()
    if not row:
        db.close()
        raise HTTPException(404, "Problem not found")
    db.execute("UPDATE coding_problems SET active=0 WHERE id=?", (qid,))
    db.commit()
    db.close()
    return {"ok": True}


# ─── Candidate-facing: fetch the coding problem for an active session ───


@app.get("/api/session/{session_id}/coding-problem")
def get_session_coding_problem(session_id: str):
    """Return the LIST of problems the candidate should solve in the IDE
    round (typically 2 for engineering roles). Resolution order:
      1. All active problems tagged with the session's role_family
      2. If none, generic (role_family IS NULL) problems
      3. Hard-coded last-resort so the round never blanks

    Response shape: {"problems": [{title, prompt, hint, examples}, ...]}
    """
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    company_id = getattr(session, "_company_id", None)
    role_fam = session.role_family
    db = get_db()
    if not company_id:
        row = db.execute(
            "SELECT company_id FROM interview_sessions WHERE id=?", (session_id,)
        ).fetchone()
        company_id = row["company_id"] if row else None

    rows: list = []
    if company_id:
        rows = db.execute(
            "SELECT * FROM coding_problems "
            "WHERE company_id=? AND active=1 AND role_family=? "
            "ORDER BY position ASC, created_at ASC",
            (company_id, role_fam),
        ).fetchall()
        if not rows:
            rows = db.execute(
                "SELECT * FROM coding_problems "
                "WHERE company_id=? AND active=1 "
                "  AND (role_family IS NULL OR role_family='') "
                "ORDER BY position ASC, created_at ASC",
                (company_id,),
            ).fetchall()
    db.close()

    if rows:
        problems = [
            {
                "title": r["title"],
                "prompt": r["prompt"],
                "hint": r["hint"] or "",
                "examples": json.loads(r["examples_json"] or "[]"),
                "boilerplate": (r["boilerplate"] if "boilerplate" in r.keys() else "") or "",
            }
            for r in rows
        ]
        return {"problems": problems}

    # Last-resort hard-coded so the round never blanks.
    return {
        "problems": [
            {
                "title": "Top-K most-frequent words",
                "prompt": (
                    "Given a list of strings, return the K most-frequently occurring "
                    "strings (ties broken alphabetically). Outline the approach in "
                    "pseudocode — focus on data structures, complexity, and edge cases."
                ),
                "hint": "Hash map for counts + a heap of size K is enough.",
                "examples": [],
            }
        ]
    }


# ─── Recruiter view: all interview sessions + their reports ────────────


@app.get("/api/c/{slug}/sessions")
def list_sessions_for_company(slug: str, request: Request):
    """Every interview session under this company. Powers the dashboard's
    "Reports" view — works across server restarts because data is read
    from the DB, not the in-memory session cache."""
    co = _verify_slug_auth(slug, request)
    db = get_db()
    rows = db.execute(
        "SELECT s.id, s.stage, s.status, s.total_score, s.created_at, "
        "       s.finished_at, s.target_duration_min, s.role_family, s.seniority, "
        "       (s.report_json IS NOT NULL) AS has_report, "
        "       c.name AS candidate_name, c.email AS candidate_email, "
        "       j.title AS job_title, j.id AS job_id, "
        "       a.aptitude_score AS aptitude_score, "
        "       a.aptitude_status AS aptitude_status "
        "FROM interview_sessions s "
        "LEFT JOIN applications a ON a.session_id=s.id "
        "LEFT JOIN candidates c ON COALESCE(a.candidate_id, s.candidate_id)=c.id "
        "LEFT JOIN jobs j ON s.job_id=j.id "
        "WHERE s.company_id=? "
        "ORDER BY s.created_at DESC",
        (co["id"],),
    ).fetchall()
    db.close()
    return [
        {
            "session_id": r["id"],
            "stage": r["stage"],
            "status": r["status"],
            "total_score": r["total_score"],
            "created_at": r["created_at"],
            "finished_at": r["finished_at"],
            "target_duration_min": r["target_duration_min"],
            "role_family": r["role_family"],
            "seniority": r["seniority"],
            "has_report": bool(r["has_report"]),
            "candidate_name": r["candidate_name"],
            "candidate_email": r["candidate_email"],
            "job_title": r["job_title"],
            "job_id": r["job_id"],
            "aptitude_score": r["aptitude_score"],
            "aptitude_status": r["aptitude_status"],
        }
        for r in rows
    ]


@app.get("/api/c/{slug}/sessions/{session_id}/report")
async def get_session_report_for_recruiter(slug: str, session_id: str, request: Request):
    """Cached report_json for one session. Falls back to synthesizing from
    eval_records if needed and the live session is still in memory."""
    co = _verify_slug_auth(slug, request)
    db = get_db()
    row = db.execute(
        "SELECT s.*, c.name AS cname, c.email AS cemail, j.title AS jtitle "
        "FROM interview_sessions s "
        "LEFT JOIN applications a ON a.session_id=s.id "
        "LEFT JOIN candidates c ON COALESCE(a.candidate_id, s.candidate_id)=c.id "
        "LEFT JOIN jobs j ON s.job_id=j.id "
        "WHERE s.id=? AND s.company_id=?",
        (session_id, co["id"]),
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Session not found in this workspace")

    report: dict | None = None
    if row["report_json"]:
        report = json.loads(row["report_json"])
    elif session_id in sessions:
        # Live session, not yet flushed — synthesize on demand.
        sess = sessions[session_id]
        report = sess.cached_report or await asyncio.to_thread(synthesize_report, sess)
        sess.cached_report = report
        try:
            d2 = get_db()
            d2.execute(
                "UPDATE interview_sessions SET report_json=? WHERE id=?",
                (json.dumps(report), session_id),
            )
            d2.commit()
            d2.close()
        except Exception:
            pass

    # Per-turn evaluations from DB so the recruiter view shows the timeline.
    db = get_db()
    evals = db.execute(
        "SELECT turn_number, stage, score, correctness, depth, communication, "
        "       relevance, topic, strengths, weaknesses, notes, ai_likelihood, "
        "       candidate_excerpt "
        "FROM eval_records WHERE session_id=? ORDER BY turn_number ASC",
        (session_id,),
    ).fetchall()
    db.close()

    return {
        "session_id": session_id,
        "candidate_name": row["cname"],
        "candidate_email": row["cemail"],
        "job_title": row["jtitle"],
        "stage": row["stage"],
        "status": row["status"],
        "total_score": row["total_score"],
        "created_at": row["created_at"],
        "finished_at": row["finished_at"],
        "report": report,
        "evaluations": [dict(e) for e in evals],
        "coding_submissions": (report or {}).get("coding_submissions", []),
        "cheating_flags": json.loads(row["cheating_flags"] or "[]"),
    }


# --- Resume endpoints ---

@app.post("/api/resume/upload")
async def upload_resume(
    file: UploadFile = File(...),
    candidate_name: str = Form(""),
    candidate_email: str = Form(""),
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")

    content = await file.read()
    raw_text = extract_text_from_pdf(content)
    if not raw_text.strip():
        raise HTTPException(400, "Could not extract text from PDF")

    skills_data = analyze_resume(raw_text)

    resume_id = uuid.uuid4().hex[:12]
    candidate_id = uuid.uuid4().hex[:12]

    db = get_db()
    db.execute(
        "INSERT INTO candidates (id, name, email) VALUES (?,?,?)",
        (candidate_id, candidate_name, candidate_email),
    )
    db.execute(
        "INSERT INTO resumes (id, candidate_id, filename, raw_text, skills_json) VALUES (?,?,?,?,?)",
        (resume_id, candidate_id, file.filename, raw_text[:5000], json.dumps(skills_data)),
    )
    db.commit()
    db.close()

    return {
        "resume_id": resume_id,
        "candidate_id": candidate_id,
        "filename": file.filename,
        "skills": skills_data.get("skills", []),
        "experience_years": skills_data.get("experience_years"),
        "domains": skills_data.get("domains", []),
        "key_projects": skills_data.get("key_projects", []),
        "education": skills_data.get("education", ""),
        "experience_summary": skills_data.get("experience_summary", ""),
        "suggested_questions": skills_data.get("suggested_questions", []),
    }


# --- Auth helpers ---

def verify_company_auth(company_id: str, request: Request):
    """Check that the request carries a valid Bearer token for the given company."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Missing or invalid Authorization header")
    token = auth_header[len("Bearer "):]
    db = get_db()
    row = db.execute(
        "SELECT id FROM companies WHERE id=? AND auth_token=?", (company_id, token)
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(403, "Invalid or expired auth token")


def get_candidate_from_token(request: Request) -> Optional[dict]:
    """Resolve the Bearer token to a candidate row, or return None if no
    token / unknown token. Used by /api/jobs/{id}/apply to attach an
    application to the signed-in candidate without breaking anonymous apply."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header[len("Bearer "):]
    if not token:
        return None
    db = get_db()
    row = db.execute(
        "SELECT id, name, email FROM candidates WHERE auth_token=?",
        (token,),
    ).fetchone()
    db.close()
    return dict(row) if row else None


def require_candidate(request: Request) -> dict:
    cand = get_candidate_from_token(request)
    if not cand:
        raise HTTPException(401, "Candidate sign-in required")
    return cand


# --- Candidate auth endpoints ---

class CandidateSignup(BaseModel):
    name: str
    email: str
    password: str


class CandidateLogin(BaseModel):
    email: str
    password: str


def _norm_email(s: str) -> str:
    return (s or "").strip().lower()


@app.post("/api/candidate/signup")
def candidate_signup(req: CandidateSignup):
    email = _norm_email(req.email)
    if not email or "@" not in email:
        raise HTTPException(400, "Valid email required")
    if not req.password or len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if not req.name.strip():
        raise HTTPException(400, "Name required")

    db = get_db()
    existing = db.execute(
        "SELECT id FROM candidates WHERE LOWER(email)=? AND password_hash IS NOT NULL",
        (email,),
    ).fetchone()
    if existing:
        db.close()
        raise HTTPException(409, "An account with this email already exists. Try signing in.")

    cid = uuid.uuid4().hex[:12]
    pw_hash = hash_password(req.password)
    auth_token = uuid.uuid4().hex
    db.execute(
        "INSERT INTO candidates (id, name, email, password_hash, auth_token) VALUES (?,?,?,?,?)",
        (cid, req.name.strip(), email, pw_hash, auth_token),
    )
    db.commit()
    db.close()
    return {"candidate_id": cid, "name": req.name.strip(), "email": email, "auth_token": auth_token}


@app.post("/api/candidate/login")
def candidate_login(req: CandidateLogin):
    email = _norm_email(req.email)
    if not email or not req.password:
        raise HTTPException(400, "Email and password required")
    db = get_db()
    row = db.execute(
        "SELECT id, name, email, password_hash FROM candidates "
        "WHERE LOWER(email)=? AND password_hash IS NOT NULL",
        (email,),
    ).fetchone()
    if not row or not verify_password(req.password, row["password_hash"]):
        db.close()
        raise HTTPException(401, "Invalid email or password")
    new_token = uuid.uuid4().hex
    db.execute("UPDATE candidates SET auth_token=? WHERE id=?", (new_token, row["id"]))
    db.commit()
    db.close()
    return {
        "candidate_id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "auth_token": new_token,
    }


@app.get("/api/candidate/me")
def candidate_me(request: Request):
    cand = require_candidate(request)
    return cand


@app.get("/api/candidate/me/applications")
def candidate_my_applications(request: Request):
    cand = require_candidate(request)
    db = get_db()
    rows = db.execute(
        "SELECT a.id as application_id, a.status, a.invite_token, a.created_at, "
        "  j.id as job_id, j.title as job_title, j.role_family, j.seniority, "
        "  c.name as company_name "
        "FROM applications a "
        "LEFT JOIN jobs j ON a.job_id=j.id "
        "LEFT JOIN companies c ON j.company_id=c.id "
        "WHERE a.candidate_id=? ORDER BY a.created_at DESC",
        (cand["id"],),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


# --- Company & Job endpoints ---

@app.post("/api/company")
def create_company(req: CompanyCreate):
    cid = uuid.uuid4().hex[:12]
    pw_hash = hash_password(req.password)
    auth_token = uuid.uuid4().hex
    db = get_db()
    db.execute(
        "INSERT INTO companies (id, name, email, password_hash, auth_token) VALUES (?,?,?,?,?)",
        (cid, req.name, req.email, pw_hash, auth_token),
    )
    db.commit()
    db.close()
    return {"company_id": cid, "name": req.name, "auth_token": auth_token}


@app.post("/api/company/login")
def company_login(req: CompanyLogin):
    db = get_db()
    row = db.execute("SELECT id, password_hash FROM companies WHERE name=?", (req.name,)).fetchone()
    if not row:
        db.close()
        raise HTTPException(401, "Invalid company name or password")
    if not verify_password(req.password, row["password_hash"]):
        db.close()
        raise HTTPException(401, "Invalid company name or password")
    # Generate a fresh auth token on each login
    new_token = uuid.uuid4().hex
    db.execute("UPDATE companies SET auth_token=? WHERE id=?", (new_token, row["id"]))
    db.commit()
    db.close()
    return {"company_id": row["id"], "auth_token": new_token}


@app.post("/api/company/{company_id}/jobs")
def create_job(company_id: str, req: JobCreate, request: Request):
    verify_company_auth(company_id, request)
    # Light validation: reject unknown role families so the prompt selection
    # never silently falls back to software engineering.
    if req.role_family not in ALL_PROFILES:
        raise HTTPException(400, f"Unknown role_family: {req.role_family}")
    if req.seniority not in SENIORITY_TIERS:
        raise HTTPException(400, f"Unknown seniority: {req.seniority}")

    jid = uuid.uuid4().hex[:12]
    db = get_db()
    co = db.execute("SELECT id FROM companies WHERE id=?", (company_id,)).fetchone()
    if not co:
        db.close()
        raise HTTPException(404, "Company not found")
    db.execute(
        """
        INSERT INTO jobs
          (id, company_id, title, description, required_skills,
           role_family, seniority, min_experience_years, max_experience_years,
           department, employment_type, aptitude_required)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1)
        """,
        (
            jid, company_id, req.title, req.description, req.required_skills,
            req.role_family, req.seniority,
            req.min_experience_years, req.max_experience_years,
            req.department, req.employment_type,
        ),
    )
    # Guarantee the company has an aptitude bank so the new gate isn't empty.
    _ensure_aptitude_bank(db, company_id)
    db.commit()
    db.close()
    return {"job_id": jid, "title": req.title}


@app.get("/api/jobs")
def list_jobs(
    role_family: Optional[str] = None,
    seniority: Optional[str] = None,
    min_experience_years: Optional[float] = None,
    max_experience_years: Optional[float] = None,
    skill: Optional[str] = None,
    q: Optional[str] = None,
):
    """List active jobs with two core filters (experience + role/skills) plus extras.

    - role_family: exact match on role family (e.g. "software_engineering").
    - seniority:   exact match on seniority tier.
    - min_experience_years / max_experience_years: candidate's YoE — we return
      jobs whose posted range overlaps the candidate's point.
    - skill: case-insensitive substring match against required_skills.
    - q: free-text match against title/description.
    """
    sql = [
        "SELECT j.*, c.name as company_name FROM jobs j",
        "JOIN companies c ON j.company_id=c.id",
        "WHERE j.status='active'",
    ]
    params: list = []
    if role_family:
        sql.append("AND j.role_family=?")
        params.append(role_family)
    if seniority:
        sql.append("AND j.seniority=?")
        params.append(seniority)
    # Experience filter: "I have X years" -> job whose range contains X.
    # We accept either bound and treat the missing one as open-ended.
    if min_experience_years is not None:
        sql.append("AND j.max_experience_years >= ?")
        params.append(min_experience_years)
    if max_experience_years is not None:
        sql.append("AND j.min_experience_years <= ?")
        params.append(max_experience_years)
    if skill:
        sql.append("AND LOWER(j.required_skills) LIKE ?")
        params.append(f"%{skill.lower()}%")
    if q:
        sql.append("AND (LOWER(j.title) LIKE ? OR LOWER(j.description) LIKE ?)")
        params.extend([f"%{q.lower()}%", f"%{q.lower()}%"])
    sql.append("ORDER BY j.created_at DESC")

    db = get_db()
    rows = db.execute(" ".join(sql), params).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.get("/api/roles")
def get_roles():
    """Catalog used by the frontend to render role/seniority filters."""
    return {
        "role_families": list_role_families(),
        "seniority_tiers": SENIORITY_TIERS,
    }


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    db = get_db()
    row = db.execute(
        "SELECT j.*, c.name as company_name FROM jobs j JOIN companies c ON j.company_id=c.id WHERE j.id=?",
        (job_id,)
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)


@app.post("/api/jobs/{job_id}/apply")
async def apply_to_job(
    job_id: str,
    request: Request,
    candidate_name: str = Form(""),
    candidate_email: str = Form(""),
    resume: UploadFile = File(...),
):
    """Apply to a job. Two modes:
    - **Authenticated** (preferred): pass `Authorization: Bearer <candidate_token>`.
      Reuses the signed-in candidate row; the form name/email are ignored.
    - **Anonymous** (legacy): pass candidate_name + candidate_email in the form.
      Creates a fresh candidates row without a password — used by the vanilla
      SPA. The new Next.js apply flow always sends a token instead."""
    db = get_db()
    job = db.execute("SELECT * FROM jobs WHERE id=? AND status='active'", (job_id,)).fetchone()
    if not job:
        db.close()
        raise HTTPException(404, "Job not found or inactive")

    # Resolve the candidate: prefer the Bearer token if present.
    cand = get_candidate_from_token(request)
    if cand:
        candidate_id = cand["id"]
        # Refuse a duplicate application from the same candidate to the same job.
        dup = db.execute(
            "SELECT id, invite_token, aptitude_status FROM applications "
            "WHERE candidate_id=? AND job_id=?",
            (candidate_id, job_id),
        ).fetchone()
        if dup:
            # Treat every re-apply as a fresh start so the candidate always
            # walks the canonical three-stage flow: aptitude → interview →
            # coding. Previously, a candidate who'd cleared aptitude once
            # would silently skip it on re-apply because aptitude_status was
            # still 'passed'. Historical attempt records remain in
            # `aptitude_attempts` for audit; only the gate state resets.
            if bool(job["aptitude_required"]) and dup["aptitude_status"] != "in_progress":
                db.execute(
                    "UPDATE applications SET aptitude_status='pending', "
                    "  aptitude_score=NULL, aptitude_started_at=NULL, "
                    "  aptitude_completed_at=NULL "
                    "WHERE id=?",
                    (dup["id"],),
                )
                # Reset the previous session reference too so the next start
                # creates a brand-new interview session (otherwise the old
                # `report_json` would clobber the new attempt's score).
                db.execute(
                    "UPDATE applications SET session_id=NULL, status='invited' WHERE id=?",
                    (dup["id"],),
                )
                db.commit()
            db.close()
            return {
                "application_id": dup["id"],
                "invite_token": dup["invite_token"],
                "candidate_id": candidate_id,
                "duplicate": True,
            }
    else:
        if not candidate_name.strip() or not candidate_email.strip():
            db.close()
            raise HTTPException(401, "Sign in or provide candidate_name + candidate_email")
        candidate_id = uuid.uuid4().hex[:12]
        db.execute(
            "INSERT INTO candidates (id, name, email) VALUES (?,?,?)",
            (candidate_id, candidate_name.strip(), _norm_email(candidate_email)),
        )

    # Parse resume
    content = await resume.read()
    raw_text = extract_text_from_pdf(content)
    skills_data = analyze_resume(raw_text) if raw_text.strip() else {}

    resume_id = uuid.uuid4().hex[:12]
    app_id = uuid.uuid4().hex[:12]
    invite_token = uuid.uuid4().hex[:16]

    db.execute(
        "INSERT INTO resumes (id, candidate_id, filename, raw_text, skills_json) VALUES (?,?,?,?,?)",
        (resume_id, candidate_id, resume.filename, raw_text[:5000], json.dumps(skills_data)),
    )
    db.execute(
        "INSERT INTO applications (id, job_id, candidate_id, resume_id, status, invite_token) "
        "VALUES (?,?,?,?,?,?)",
        (app_id, job_id, candidate_id, resume_id, "invited", invite_token),
    )
    db.commit()
    db.close()

    return {
        "application_id": app_id,
        "invite_token": invite_token,
        "candidate_id": candidate_id,
        "resume_id": resume_id,
        "skills": skills_data.get("skills", []),
    }


@app.get("/api/company/{company_id}/jobs")
def company_jobs(company_id: str, request: Request):
    """List a company's job postings (recruiter-only). Counts of active and
    total applications per job are joined in for the dashboard."""
    verify_company_auth(company_id, request)
    db = get_db()
    rows = db.execute(
        "SELECT j.*, "
        "  (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS application_count "
        "FROM jobs j "
        "WHERE j.company_id=? "
        "ORDER BY j.created_at DESC",
        (company_id,),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.post("/api/invite/send")
def send_invite(req: InviteSend, request: Request):
    db = get_db()
    row = db.execute(
        "SELECT a.*, c.name, c.email, j.title, j.company_id FROM applications a "
        "JOIN candidates c ON a.candidate_id=c.id "
        "JOIN jobs j ON a.job_id=j.id WHERE a.id=?",
        (req.application_id,)
    ).fetchone()
    if not row:
        db.close()
        raise HTTPException(404, "Application not found")

    # Verify the caller owns the company that posted this job
    verify_company_auth(row["company_id"], request)

    result = send_interview_invite(row["email"], row["name"], row["title"], row["invite_token"])

    db.execute("UPDATE applications SET status='invited' WHERE id=?", (req.application_id,))
    db.commit()
    db.close()

    return result


@app.get("/api/invite/{token}")
def validate_invite(token: str, request: Request):
    # 60 token-resolutions per IP per minute. Generous for a candidate refresh
    # cycle but caps brute-force enumeration at ~3600/hr.
    rate_limit(request, bucket="invite", max_calls=60, window_s=60)
    db = get_db()
    row = db.execute(
        "SELECT a.*, c.name, c.email, j.title, j.id as jid, j.description, j.required_skills, "
        "j.company_id, co.name as company_name, co.slug as company_slug, "
        "r.id as rid, r.skills_json "
        "FROM applications a "
        "JOIN candidates c ON a.candidate_id=c.id "
        "LEFT JOIN jobs j ON a.job_id=j.id "
        "LEFT JOIN companies co ON j.company_id=co.id "
        "LEFT JOIN resumes r ON a.resume_id=r.id "
        "WHERE a.invite_token=?",
        (token,)
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Invalid invite token")

    if row["invite_revoked_at"]:
        raise HTTPException(410, "This interview link has been revoked")
    if row["invite_expires_at"]:
        try:
            exp = datetime.fromisoformat(row["invite_expires_at"])
            if exp < datetime.utcnow():
                raise HTTPException(410, "This interview link has expired")
        except HTTPException:
            raise
        except (ValueError, TypeError):
            pass

    skills = []
    if row["skills_json"]:
        try:
            skills = json.loads(row["skills_json"]).get("skills", [])
        except Exception:
            pass

    log_event(
        "link_opened",
        company_id=row["company_id"], job_id=row["jid"],
        application_id=row["id"],
    )

    return {
        "valid": True,
        "candidate_name": row["name"],
        "candidate_email": row["email"],
        "job_title": row["title"],
        "job_id": row["jid"],
        "company_name": row["company_name"],
        "company_slug": row["company_slug"],
        "resume_id": row["rid"],
        "skills": skills,
        "status": row["status"],
        "expires_at": row["invite_expires_at"],
        "already_used": bool(row["invite_used_at"]),
    }


# --- Company dashboard ---

@app.get("/api/company/{company_id}/applications")
def company_applications(company_id: str, request: Request):
    verify_company_auth(company_id, request)
    db = get_db()
    rows = db.execute(
        "SELECT a.*, c.name, c.email, j.title FROM applications a "
        "JOIN candidates c ON a.candidate_id=c.id "
        "JOIN jobs j ON a.job_id=j.id "
        "WHERE j.company_id=? ORDER BY a.created_at DESC",
        (company_id,)
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


# =====================================================================
# Multi-tenant routes — /api/c/{slug}/*
#
# Every endpoint under this section runs through `get_company_by_slug()`
# which verifies the Bearer token against the company's auth_token. No
# query in this section should look up rows by id alone — always scope
# by `company_id = company["id"]` so a leaked token can't read across
# tenants.
# =====================================================================


def get_company_by_slug(slug: str, request: Request) -> dict:
    """Resolve `slug` → company row, validating the caller's Bearer token.

    Raises 404 if the slug doesn't exist (don't leak which slugs are taken
    via 401 vs 404), 401 if the token is missing/invalid for that slug.
    """
    db = get_db()
    company = db.execute(
        "SELECT id, name, slug, email, auth_token, status, plan, "
        "interview_quota_monthly, logo_url, brand_color "
        "FROM companies WHERE slug=?",
        (slug,),
    ).fetchone()
    db.close()
    if not company:
        raise HTTPException(404, "Workspace not found")

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Sign-in required")
    token = auth_header[len("Bearer "):]
    if not token or token != company["auth_token"]:
        raise HTTPException(401, "Invalid or expired auth token")
    if company["status"] != "active":
        raise HTTPException(403, f"Workspace {company['status']}")
    return dict(company)


class CompanySlugLogin(BaseModel):
    slug: str | None = None
    name: str | None = None
    password: str


@app.post("/api/auth/company/login")
def company_slug_login(req: CompanySlugLogin):
    """Login by slug (preferred) or by name (legacy). Returns slug + token."""
    if not req.password:
        raise HTTPException(400, "Password required")
    if not (req.slug or req.name):
        raise HTTPException(400, "Slug or name required")

    db = get_db()
    if req.slug:
        row = db.execute(
            "SELECT id, name, slug, password_hash, status FROM companies WHERE slug=?",
            (req.slug.strip().lower(),),
        ).fetchone()
    else:
        row = db.execute(
            "SELECT id, name, slug, password_hash, status FROM companies WHERE name=?",
            (req.name,),
        ).fetchone()
    if not row or not verify_password(req.password, row["password_hash"] or ""):
        if row:
            db.close()
        raise HTTPException(401, "Invalid credentials")
    if row["status"] != "active":
        db.close()
        raise HTTPException(403, f"Workspace {row['status']}")

    new_token = uuid.uuid4().hex
    db.execute("UPDATE companies SET auth_token=? WHERE id=?", (new_token, row["id"]))
    db.commit()
    db.close()
    return {
        "company_id": row["id"],
        "name": row["name"],
        "slug": row["slug"],
        "auth_token": new_token,
    }


@app.get("/api/c/{slug}/me")
def tenant_me(slug: str, request: Request):
    co = get_company_by_slug(slug, request)
    return {
        "company_id": co["id"],
        "name": co["name"],
        "slug": co["slug"],
        "email": co["email"],
        "status": co["status"],
        "plan": co["plan"],
        "logo_url": co["logo_url"],
        "brand_color": co["brand_color"],
    }


@app.get("/api/c/{slug}/dashboard")
def tenant_dashboard(slug: str, request: Request):
    """Dashboard summary: job count, application count, interview count, quota."""
    co = get_company_by_slug(slug, request)
    db = get_db()
    job_count = db.execute(
        "SELECT COUNT(*) AS n FROM jobs WHERE company_id=? AND status='active'",
        (co["id"],),
    ).fetchone()["n"]
    app_count = db.execute(
        "SELECT COUNT(*) AS n FROM applications a JOIN jobs j ON a.job_id=j.id "
        "WHERE j.company_id=?",
        (co["id"],),
    ).fetchone()["n"]
    sess_count = db.execute(
        "SELECT COUNT(*) AS n FROM interview_sessions WHERE company_id=?",
        (co["id"],),
    ).fetchone()["n"]
    finished = db.execute(
        "SELECT COUNT(*) AS n FROM interview_sessions "
        "WHERE company_id=? AND status='finished'",
        (co["id"],),
    ).fetchone()["n"]
    db.close()
    return {
        "company": {"id": co["id"], "name": co["name"], "slug": co["slug"]},
        "active_jobs": job_count,
        "applications": app_count,
        "interviews_started": sess_count,
        "interviews_finished": finished,
        "quota_monthly": co["interview_quota_monthly"],
    }


@app.get("/api/c/{slug}/jobs")
def tenant_list_jobs(slug: str, request: Request):
    co = get_company_by_slug(slug, request)
    db = get_db()
    rows = db.execute(
        "SELECT j.*, "
        " (SELECT COUNT(*) FROM applications a WHERE a.job_id=j.id) AS application_count "
        "FROM jobs j WHERE j.company_id=? ORDER BY j.created_at DESC",
        (co["id"],),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.post("/api/c/{slug}/jobs")
def tenant_create_job(slug: str, req: JobCreate, request: Request):
    co = get_company_by_slug(slug, request)
    if req.role_family not in ALL_PROFILES:
        raise HTTPException(400, f"Unknown role_family: {req.role_family}")
    if req.seniority not in SENIORITY_TIERS:
        raise HTTPException(400, f"Unknown seniority: {req.seniority}")
    jid = uuid.uuid4().hex[:12]
    db = get_db()
    db.execute(
        "INSERT INTO jobs "
        "(id, company_id, title, description, required_skills, "
        " role_family, seniority, min_experience_years, max_experience_years, "
        " department, employment_type, aptitude_required) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,1)",
        (
            jid, co["id"], req.title, req.description, req.required_skills,
            req.role_family, req.seniority,
            req.min_experience_years, req.max_experience_years,
            req.department, req.employment_type,
        ),
    )
    # Make sure the tenant has a question bank — newly-provisioned companies
    # would otherwise have aptitude_required=1 with zero questions, which
    # serves an empty test.
    _ensure_aptitude_bank(db, co["id"])
    db.commit()
    db.close()
    log_event("job_created", company_id=co["id"], job_id=jid)
    return {"job_id": jid, "title": req.title}


@app.get("/api/c/{slug}/jobs/{job_id}")
def tenant_get_job(slug: str, job_id: str, request: Request):
    co = get_company_by_slug(slug, request)
    db = get_db()
    row = db.execute(
        "SELECT * FROM jobs WHERE id=? AND company_id=?", (job_id, co["id"])
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Job not found")
    return dict(row)


@app.get("/api/c/{slug}/applications")
def tenant_applications(slug: str, request: Request):
    co = get_company_by_slug(slug, request)
    db = get_db()
    rows = db.execute(
        "SELECT a.*, c.name as candidate_name, c.email as candidate_email, "
        " j.title as job_title, j.role_family, j.seniority, "
        " s.total_score as session_score, s.status as session_status, "
        " s.stage as session_stage "
        "FROM applications a "
        "JOIN candidates c ON a.candidate_id=c.id "
        "JOIN jobs j ON a.job_id=j.id "
        "LEFT JOIN interview_sessions s ON a.session_id=s.id "
        "WHERE j.company_id=? "
        "ORDER BY a.created_at DESC",
        (co["id"],),
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


@app.get("/api/c/{slug}/candidates/{application_id}")
def tenant_candidate_detail(slug: str, application_id: str, request: Request):
    co = get_company_by_slug(slug, request)
    db = get_db()
    row = db.execute(
        "SELECT a.*, c.name as candidate_name, c.email as candidate_email, "
        " j.title as job_title, j.company_id, "
        " s.report_json, s.total_score, s.stage as session_stage, "
        " s.cheating_flags, s.finished_at, "
        " r.skills_json "
        "FROM applications a "
        "JOIN candidates c ON a.candidate_id=c.id "
        "JOIN jobs j ON a.job_id=j.id "
        "LEFT JOIN interview_sessions s ON a.session_id=s.id "
        "LEFT JOIN resumes r ON a.resume_id=r.id "
        "WHERE a.id=? AND j.company_id=?",
        (application_id, co["id"]),
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Application not found")
    out = dict(row)
    if out.get("report_json"):
        try:
            out["report"] = json.loads(out["report_json"])
        except Exception:
            out["report"] = None
    if out.get("skills_json"):
        try:
            out["resume_skills"] = json.loads(out["skills_json"])
        except Exception:
            out["resume_skills"] = None
    return out


# ── Bulk candidate-link generation ─────────────────────────────────────

class LinkCandidate(BaseModel):
    name: str | None = None
    email: str


class LinksGenerateRequest(BaseModel):
    candidates: list[LinkCandidate] = []
    count: int | None = None
    expires_in_days: int = 14
    send_email: bool = False


def _make_invite_token() -> str:
    """URL-safe base32, 12 chars."""
    return secrets.token_urlsafe(12)[:16]


@app.post("/api/c/{slug}/jobs/{job_id}/links")
def tenant_generate_links(
    slug: str, job_id: str, req: LinksGenerateRequest, request: Request
):
    co = get_company_by_slug(slug, request)
    db = get_db()
    job = db.execute(
        "SELECT id, title, company_id FROM jobs WHERE id=? AND company_id=?",
        (job_id, co["id"]),
    ).fetchone()
    if not job:
        db.close()
        raise HTTPException(404, "Job not found")

    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    expires_at = datetime.utcnow() + timedelta(days=max(1, min(60, req.expires_in_days)))
    expires_iso = expires_at.isoformat(timespec="seconds")

    targets: list[dict] = []
    if req.candidates:
        targets = [
            {"name": (c.name or c.email.split("@")[0]).strip(), "email": c.email.strip().lower()}
            for c in req.candidates if c.email and c.email.strip()
        ]
    elif req.count:
        n = max(1, min(200, int(req.count)))
        targets = [{"name": None, "email": None} for _ in range(n)]
    else:
        db.close()
        raise HTTPException(400, "Provide candidates[] or count")

    created: list[dict] = []
    for t in targets:
        cand_id = uuid.uuid4().hex[:12]
        db.execute(
            "INSERT INTO candidates (id, name, email) VALUES (?,?,?)",
            (cand_id, t["name"] or "", t["email"] or ""),
        )
        token = _make_invite_token()
        app_id = uuid.uuid4().hex[:12]
        db.execute(
            "INSERT INTO applications "
            "(id, job_id, candidate_id, resume_id, status, invite_token, "
            " invite_expires_at, created_by_company) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (
                app_id, job_id, cand_id, None, "invited", token,
                expires_iso, co["id"],
            ),
        )
        url = f"{base_url}/i/?token={token}"
        if req.send_email and t["email"]:
            try:
                send_interview_invite(
                    t["email"], t["name"] or "Candidate", job["title"], token
                )
            except Exception:
                pass
        log_event(
            "link_created",
            company_id=co["id"], job_id=job_id, application_id=app_id,
        )
        created.append({
            "application_id": app_id,
            "candidate_id": cand_id,
            "candidate_name": t["name"],
            "candidate_email": t["email"],
            "invite_token": token,
            "invite_url": url,
            "expires_at": expires_iso,
        })

    db.commit()
    db.close()
    return {"created": created, "count": len(created)}


@app.get("/api/c/{slug}/jobs/{job_id}/links")
def tenant_list_links(slug: str, job_id: str, request: Request):
    co = get_company_by_slug(slug, request)
    base_url = os.getenv("BASE_URL", "http://localhost:8000")
    db = get_db()
    rows = db.execute(
        "SELECT a.id as application_id, a.invite_token, a.status, a.created_at, "
        " a.invite_expires_at, a.invite_used_at, a.invite_revoked_at, "
        " c.name as candidate_name, c.email as candidate_email, "
        " s.id as session_id, s.status as session_status, s.total_score "
        "FROM applications a "
        "JOIN candidates c ON a.candidate_id=c.id "
        "JOIN jobs j ON a.job_id=j.id "
        "LEFT JOIN interview_sessions s ON a.session_id=s.id "
        "WHERE a.job_id=? AND j.company_id=? "
        "ORDER BY a.created_at DESC",
        (job_id, co["id"]),
    ).fetchall()
    db.close()
    out = []
    for r in rows:
        d = dict(r)
        d["invite_url"] = f"{base_url}/i/?token={d['invite_token']}"
        out.append(d)
    return out


@app.delete("/api/c/{slug}/links/{token}")
def tenant_revoke_link(slug: str, token: str, request: Request):
    co = get_company_by_slug(slug, request)
    db = get_db()
    row = db.execute(
        "SELECT a.id, a.job_id, j.company_id FROM applications a "
        "JOIN jobs j ON a.job_id=j.id "
        "WHERE a.invite_token=? AND j.company_id=?",
        (token, co["id"]),
    ).fetchone()
    if not row:
        db.close()
        raise HTTPException(404, "Link not found")
    db.execute(
        "UPDATE applications SET invite_revoked_at=CURRENT_TIMESTAMP WHERE id=?",
        (row["id"],),
    )
    db.commit()
    db.close()
    log_event(
        "link_revoked", company_id=co["id"], job_id=row["job_id"],
        application_id=row["id"],
    )
    audit(
        "link_revoked", actor=co["slug"], target=token,
        ip=_client_ip(request),
    )
    return {"revoked": True, "token": token}


@app.get("/api/c/{slug}/usage")
def tenant_usage(slug: str, request: Request):
    co = get_company_by_slug(slug, request)
    db = get_db()
    # Current calendar month
    started = db.execute(
        "SELECT COUNT(*) AS n FROM interview_sessions "
        "WHERE company_id=? AND created_at >= date('now', 'start of month')",
        (co["id"],),
    ).fetchone()["n"]
    finished = db.execute(
        "SELECT COUNT(*) AS n FROM interview_sessions "
        "WHERE company_id=? AND status='finished' "
        "AND created_at >= date('now', 'start of month')",
        (co["id"],),
    ).fetchone()["n"]
    db.close()
    return {
        "month_started": started,
        "month_finished": finished,
        "quota": co["interview_quota_monthly"],
    }


# =====================================================================
# Lead intake (public, no auth)
# =====================================================================

class LeadCreate(BaseModel):
    kind: str = "company"
    company_name: str | None = None
    contact_name: str
    email: str
    phone: str | None = None
    role_count: int | None = None
    use_case: str | None = None
    source: str = "contact_form"


@app.post("/api/leads")
def create_lead(req: LeadCreate, request: Request):
    # 5 lead submissions per IP per 10 minutes — cheap public endpoint, easy
    # to spam, but legitimate users only need 1.
    rate_limit(request, bucket="leads", max_calls=5, window_s=600)
    if not req.contact_name.strip() or "@" not in (req.email or ""):
        raise HTTPException(400, "Contact name and a valid email are required")
    lead_id = uuid.uuid4().hex[:12]
    db = get_db()
    db.execute(
        "INSERT INTO leads "
        "(id, kind, company_name, contact_name, email, phone, role_count, "
        " use_case, source, status) "
        "VALUES (?,?,?,?,?,?,?,?,?, 'new')",
        (
            lead_id, req.kind, req.company_name, req.contact_name.strip(),
            req.email.strip().lower(), req.phone, req.role_count,
            req.use_case, req.source,
        ),
    )
    db.commit()
    db.close()
    try:
        send_lead_notification({
            "id": lead_id, "kind": req.kind,
            "company_name": req.company_name,
            "contact_name": req.contact_name, "email": req.email,
            "phone": req.phone, "role_count": req.role_count,
            "use_case": req.use_case, "source": req.source,
        })
    except Exception:
        pass
    return {"lead_id": lead_id, "status": "new"}


# =====================================================================
# Onboarding: owner sets password via setup_token
# =====================================================================

class OnboardSetPassword(BaseModel):
    setup_token: str
    password: str


@app.post("/api/c/{slug}/onboard")
def tenant_onboard(slug: str, req: OnboardSetPassword):
    """Owner clicks email link → POSTs setup_token + new password.

    Token must match and not be expired. On success: hash password,
    rotate auth_token, clear setup_token, return auth_token + slug.
    """
    if not req.password or len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    db = get_db()
    co = db.execute(
        "SELECT id, name, slug, setup_token, setup_token_expires_at "
        "FROM companies WHERE slug=?",
        (slug,),
    ).fetchone()
    if not co:
        db.close()
        raise HTTPException(404, "Workspace not found")
    if not co["setup_token"] or co["setup_token"] != req.setup_token:
        db.close()
        raise HTTPException(403, "Invalid or used setup link")
    if co["setup_token_expires_at"]:
        try:
            exp = datetime.fromisoformat(co["setup_token_expires_at"])
            if exp < datetime.utcnow():
                db.close()
                raise HTTPException(410, "Setup link expired")
        except (ValueError, TypeError):
            pass
    new_token = uuid.uuid4().hex
    db.execute(
        "UPDATE companies SET password_hash=?, auth_token=?, "
        "setup_token=NULL, setup_token_expires_at=NULL WHERE id=?",
        (hash_password(req.password), new_token, co["id"]),
    )
    db.commit()
    db.close()
    return {
        "company_id": co["id"],
        "name": co["name"],
        "slug": co["slug"],
        "auth_token": new_token,
    }


@app.get("/api/c/{slug}/onboard/{token}")
def tenant_onboard_check(slug: str, token: str):
    """Lightweight pre-flight so the onboard page can show name + status."""
    db = get_db()
    co = db.execute(
        "SELECT name, slug, setup_token, setup_token_expires_at, password_hash "
        "FROM companies WHERE slug=?",
        (slug,),
    ).fetchone()
    db.close()
    if not co:
        raise HTTPException(404, "Workspace not found")
    if not co["setup_token"] or co["setup_token"] != token:
        raise HTTPException(403, "Invalid setup link")
    return {
        "name": co["name"],
        "slug": co["slug"],
        "expires_at": co["setup_token_expires_at"],
        "already_set": bool(co["password_hash"]),
    }


# --- WebSocket endpoint for real-time audio ---

@app.websocket("/ws/interview/{session_id}")
async def ws_interview(ws: WebSocket, session_id: str):
    await ws.accept()
    session = sessions.get(session_id)
    if not session:
        await ws.send_json({"type": "error", "message": "Session not found"})
        await ws.close()
        return

    transcriber = None
    collected_transcript = []

    try:
        while not session.is_finished:
            transcriber = StreamingTranscriber()

            async def on_partial(text):
                await ws.send_json({"type": "transcript", "text": text, "final": False})

            async def on_final(text):
                collected_transcript.append(text)
                await ws.send_json({"type": "transcript", "text": text, "final": True})

            transcriber.on_partial = on_partial
            transcriber.on_final = on_final

            await transcriber.start()
            await ws.send_json({"type": "listening"})

            while True:
                message = await ws.receive()
                if message.get("type") == "websocket.disconnect":
                    raise WebSocketDisconnect()
                if "bytes" in message:
                    await transcriber.send_audio(message["bytes"])
                elif "text" in message:
                    data = json.loads(message["text"])
                    if data.get("type") == "end_turn":
                        break

            full_text = await transcriber.finish()
            if not full_text:
                full_text = " ".join(collected_transcript)
            collected_transcript.clear()

            if not full_text.strip():
                await ws.send_json({"type": "error", "message": "No speech detected"})
                continue

            reply = session.turn(full_text.strip(), is_voice_input=True)
            status = session.get_status()

            audio_url = None
            audio_b64 = ""
            try:
                audio_path = AUDIO_DIR / session_id / f"turn_{status['total_turns']}.mp3"
                audio_path.parent.mkdir(parents=True, exist_ok=True)
                # Use the same provider chain as the REST path so the WS flow
                # automatically benefits from Edge TTS without code drift.
                if TTS_PROVIDER == "elevenlabs":
                    try:
                        elevenlabs_synthesize(reply, audio_path)
                    except Exception:
                        edge_synthesize(reply, audio_path)
                else:
                    edge_synthesize(reply, audio_path)
                audio_b64 = base64.b64encode(audio_path.read_bytes()).decode()
            except Exception as e:
                print(f"[TTS:ws] failed for session={session_id}: {e}")

            await ws.send_json({
                "type": "reply",
                "text": reply,
                "audio": audio_b64,
                "stage": status["stage"],
                "turn": status["total_turns"],
                "is_finished": status["is_finished"],
            })

            if status["is_finished"]:
                await ws.send_json({"type": "finished", "status": status})
                break

    except WebSocketDisconnect:
        pass
    finally:
        if transcriber and not transcriber.is_done:
            try:
                await transcriber.finish()
            except Exception:
                pass


# --- Serve frontend ---
#
# Two front-ends co-exist in this repo:
#
#   web/out/    — the Next.js 15 static export (recruiter dashboard, candidate
#                 detail, live-interview surface, analytics, etc.). When this
#                 directory is present we mount it as the primary site at "/".
#   frontend/   — the original vanilla-JS prototype. Still served under
#                 /static/* so legacy assets (e.g. avatar.glb) keep loading
#                 even after the Next.js cutover.
#
# All API routes (/api/*) and the WebSocket (/ws/*) are registered above the
# StaticFiles mount, so they always take precedence.

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"
WEB_OUT_DIR = Path(__file__).parent.parent / "web" / "out"


# Candidate portal (the original vanilla SPA: 3D avatar, anti-cheat, voice
# interview). Served under /candidate/* so the recruiter UI (Next.js) can own
# the rest of the site at /. The vanilla SPA uses absolute /static/* and /api/*
# paths, both of which still resolve correctly because they're registered as
# explicit routes above this mount.
@app.get("/candidate")
@app.get("/candidate/")
@app.get("/candidate/{rest:path}")
def serve_candidate_portal(rest: str = ""):
    index = FRONTEND_DIR / "index.html"
    if not index.exists():
        raise HTTPException(404, "Candidate portal assets missing")
    return FileResponse(index, media_type="text/html")


@app.get("/static/{file_path:path}")
def serve_legacy_static(file_path: str):
    """Legacy passthrough — serves files from the old vanilla frontend dir
    so the avatar.glb, anti-cheat assets, etc. remain reachable."""
    if ".." in file_path:
        raise HTTPException(400, "Invalid path")
    full_path = FRONTEND_DIR / file_path
    if not full_path.exists() or not full_path.is_file():
        raise HTTPException(404, "File not found")
    mime_map = {
        ".css": "text/css",
        ".js": "application/javascript",
        ".html": "text/html",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".glb": "model/gltf-binary",
        ".woff2": "font/woff2",
    }
    mime = mime_map.get(full_path.suffix, "application/octet-stream")
    return FileResponse(full_path, media_type=mime)


# Mount the Next.js static export at "/" if it has been built. StaticFiles
# with html=True auto-serves index.html for directory paths and falls back
# to index.html for unknown subpaths within the route prefix.
if WEB_OUT_DIR.exists() and (WEB_OUT_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(WEB_OUT_DIR), html=True), name="web")
else:
    @app.get("/")
    def serve_index_fallback():
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(index, media_type="text/html")
        return {
            "message": (
                "Frontend not built. Run `cd web && npm run build` to "
                "generate web/out/, or restart with the legacy frontend/."
            )
        }
