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
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.interview.engine import InterviewSession, Stage
from backend.tts.elevenlabs_tts import synthesize
from backend.stt.deepgram_stt import transcribe_file
from backend.stt.deepgram_streaming import StreamingTranscriber
from backend.database import init_db, get_db, hash_password, verify_password
from backend.resume_parser import extract_text_from_pdf, analyze_resume
from backend.email_service import send_interview_invite

# In-memory session store (hot cache)
sessions: dict[str, InterviewSession] = {}

AUDIO_DIR = Path("tests/audio/sessions")

# Server-side TTS (ElevenLabs) adds ~0.5-1.5s per turn. The browser has
# its own Web Speech API which speaks instantly; by default we skip the
# server synthesis entirely for lower latency. Flip USE_SERVER_TTS=1 in
# .env to restore ElevenLabs voice.
import os
USE_SERVER_TTS = os.getenv("USE_SERVER_TTS", "0") in ("1", "true", "True", "yes")


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


# --- Pydantic models ---

class SessionCreate(BaseModel):
    candidate_name: str | None = None
    use_structured: bool = True
    resume_id: str | None = None
    job_id: str | None = None
    invite_token: str | None = None

class SessionResponse(BaseModel):
    session_id: str
    stage: str
    total_turns: int
    is_finished: bool
    evaluations_count: int
    avg_score: float | None
    avg_ai_likelihood: float | None = None
    cheating_flags_count: int = 0

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
    job_title = ""
    job_skills = []
    job_description = ""
    candidate_name = req.candidate_name

    # Load resume context if provided
    if req.resume_id:
        db = get_db()
        row = db.execute("SELECT raw_text, skills_json FROM resumes WHERE id=?", (req.resume_id,)).fetchone()
        db.close()
        if row:
            skills_data = json.loads(row["skills_json"]) if row["skills_json"] else {}
            resume_context = skills_data.get("experience_summary", row["raw_text"][:1000])
            if skills_data.get("skills"):
                resume_context += f"\nSkills: {', '.join(skills_data['skills'])}"
            if skills_data.get("suggested_questions"):
                resume_context += f"\nSuggested questions: {'; '.join(skills_data['suggested_questions'][:5])}"

    # Load job context if provided
    if req.job_id:
        db = get_db()
        row = db.execute("SELECT title, description, required_skills FROM jobs WHERE id=?", (req.job_id,)).fetchone()
        db.close()
        if row:
            job_title = row["title"]
            job_description = row["description"] or ""
            job_skills = [s.strip() for s in (row["required_skills"] or "").split(",") if s.strip()]

    # Validate invite token if provided
    if req.invite_token:
        db = get_db()
        app_row = db.execute(
            "SELECT a.*, c.name as cname, c.email, j.title, j.description, j.required_skills, r.raw_text, r.skills_json "
            "FROM applications a "
            "JOIN candidates c ON a.candidate_id=c.id "
            "LEFT JOIN jobs j ON a.job_id=j.id "
            "LEFT JOIN resumes r ON a.resume_id=r.id "
            "WHERE a.invite_token=? AND a.status='invited'",
            (req.invite_token,)
        ).fetchone()
        db.close()
        if app_row:
            candidate_name = app_row["cname"]
            if app_row["title"]:
                job_title = app_row["title"]
                job_description = app_row["description"] or ""
                job_skills = [s.strip() for s in (app_row["required_skills"] or "").split(",") if s.strip()]
            if app_row["raw_text"]:
                skills_data = json.loads(app_row["skills_json"]) if app_row["skills_json"] else {}
                resume_context = skills_data.get("experience_summary", app_row["raw_text"][:1000])
                if skills_data.get("skills"):
                    resume_context += f"\nSkills: {', '.join(skills_data['skills'])}"

    session = InterviewSession(
        session_id=sid,
        candidate_name=candidate_name,
        use_structured=req.use_structured,
        resume_context=resume_context,
        job_title=job_title,
        job_skills=job_skills,
        job_description=job_description,
    )
    sessions[sid] = session

    # Persist to DB
    db = get_db()
    db.execute(
        "INSERT INTO interview_sessions (id, candidate_id, resume_id, job_id) VALUES (?,?,?,?)",
        (sid, None, req.resume_id, req.job_id),
    )
    db.commit()
    db.close()

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
    )


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

    audio_url = None
    if USE_SERVER_TTS:
        try:
            audio_path = AUDIO_DIR / session_id / f"turn_{status['total_turns']}.mp3"
            audio_path.parent.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(synthesize, reply, audio_path)
            audio_url = f"/api/audio/{session_id}/turn_{status['total_turns']}.mp3"
        except Exception:
            pass

    return TurnResponse(
        reply=reply,
        stage=status["stage"],
        total_turns=status["total_turns"],
        is_finished=status["is_finished"],
        audio_url=audio_url,
    )


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
        # Run STT in thread pool
        transcript = await asyncio.to_thread(transcribe_file, str(tmp_path))
    finally:
        tmp_path.unlink(missing_ok=True)

    if not transcript or not transcript.strip():
        raise HTTPException(400, "No speech detected in audio")

    # Run LLM in thread pool
    reply = await asyncio.to_thread(session.turn, transcript.strip(), 0, True)
    status = session.get_status()

    audio_url = None
    if USE_SERVER_TTS:
        try:
            audio_path = AUDIO_DIR / session_id / f"turn_{status['total_turns']}.mp3"
            audio_path.parent.mkdir(parents=True, exist_ok=True)
            await asyncio.to_thread(synthesize, reply, audio_path)
            audio_url = f"/api/audio/{session_id}/turn_{status['total_turns']}.mp3"
        except Exception:
            pass

    return TurnResponse(
        reply=reply,
        stage=status["stage"],
        total_turns=status["total_turns"],
        is_finished=status["is_finished"],
        audio_url=audio_url,
    )


@app.post("/api/session/{session_id}/cheating-report")
def report_cheating(session_id: str, report: CheatingReport):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    for v in report.violations:
        session.add_cheating_flag(v)
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


# --- Auth helper ---

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
    jid = uuid.uuid4().hex[:12]
    db = get_db()
    co = db.execute("SELECT id FROM companies WHERE id=?", (company_id,)).fetchone()
    if not co:
        db.close()
        raise HTTPException(404, "Company not found")
    db.execute(
        "INSERT INTO jobs (id, company_id, title, description, required_skills) VALUES (?,?,?,?,?)",
        (jid, company_id, req.title, req.description, req.required_skills),
    )
    db.commit()
    db.close()
    return {"job_id": jid, "title": req.title}


@app.get("/api/jobs")
def list_jobs():
    db = get_db()
    rows = db.execute(
        "SELECT j.*, c.name as company_name FROM jobs j JOIN companies c ON j.company_id=c.id WHERE j.status='active' ORDER BY j.created_at DESC"
    ).fetchall()
    db.close()
    return [dict(r) for r in rows]


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
    candidate_name: str = Form(...),
    candidate_email: str = Form(...),
    resume: UploadFile = File(...),
):
    db = get_db()
    job = db.execute("SELECT * FROM jobs WHERE id=? AND status='active'", (job_id,)).fetchone()
    if not job:
        db.close()
        raise HTTPException(404, "Job not found or inactive")

    # Parse resume
    content = await resume.read()
    raw_text = extract_text_from_pdf(content)
    skills_data = analyze_resume(raw_text) if raw_text.strip() else {}

    candidate_id = uuid.uuid4().hex[:12]
    resume_id = uuid.uuid4().hex[:12]
    app_id = uuid.uuid4().hex[:12]
    invite_token = uuid.uuid4().hex[:16]

    db.execute("INSERT INTO candidates (id, name, email) VALUES (?,?,?)", (candidate_id, candidate_name, candidate_email))
    db.execute(
        "INSERT INTO resumes (id, candidate_id, filename, raw_text, skills_json) VALUES (?,?,?,?,?)",
        (resume_id, candidate_id, resume.filename, raw_text[:5000], json.dumps(skills_data)),
    )
    db.execute(
        "INSERT INTO applications (id, job_id, candidate_id, resume_id, status, invite_token) VALUES (?,?,?,?,?,?)",
        (app_id, job_id, candidate_id, resume_id, "applied", invite_token),
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
def validate_invite(token: str):
    db = get_db()
    row = db.execute(
        "SELECT a.*, c.name, c.email, j.title, j.id as jid, j.description, j.required_skills, "
        "r.id as rid, r.skills_json "
        "FROM applications a "
        "JOIN candidates c ON a.candidate_id=c.id "
        "LEFT JOIN jobs j ON a.job_id=j.id "
        "LEFT JOIN resumes r ON a.resume_id=r.id "
        "WHERE a.invite_token=?",
        (token,)
    ).fetchone()
    db.close()
    if not row:
        raise HTTPException(404, "Invalid invite token")

    skills = []
    if row["skills_json"]:
        try:
            skills = json.loads(row["skills_json"]).get("skills", [])
        except Exception:
            pass

    return {
        "valid": True,
        "candidate_name": row["name"],
        "candidate_email": row["email"],
        "job_title": row["title"],
        "job_id": row["jid"],
        "resume_id": row["rid"],
        "skills": skills,
        "status": row["status"],
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
                synthesize(reply, audio_path)
                audio_b64 = base64.b64encode(audio_path.read_bytes()).decode()
            except Exception:
                pass

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

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


@app.get("/")
def serve_index():
    index = FRONTEND_DIR / "index.html"
    if index.exists():
        return FileResponse(index, media_type="text/html")
    return {"message": "Frontend not built yet"}


@app.get("/static/{file_path:path}")
def serve_static(file_path: str):
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
    }
    mime = mime_map.get(full_path.suffix, "application/octet-stream")
    return FileResponse(full_path, media_type=mime)
