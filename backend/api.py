"""Phase 9 — FastAPI server with REST + WebSocket endpoints.

Endpoints:
    POST   /api/session          — create new interview session
    GET    /api/session/{id}     — get session status
    POST   /api/session/{id}/turn — text turn (for testing)
    WS     /ws/interview/{id}    — real-time audio interview
    GET    /api/health            — health check
    GET    /                      — serve frontend (Phase 10)
"""
from __future__ import annotations

import uuid
import asyncio
import base64
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend.interview.engine import InterviewSession, Stage
from backend.tts.elevenlabs_tts import synthesize
from backend.stt.deepgram_stt import transcribe_file
from backend.stt.deepgram_streaming import StreamingTranscriber

# In-memory session store
sessions: dict[str, InterviewSession] = {}

AUDIO_DIR = Path("tests/audio/sessions")


@asynccontextmanager
async def lifespan(app: FastAPI):
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    yield
    sessions.clear()


app = FastAPI(title="AI Interview Portal", version="0.9.0", lifespan=lifespan)


# --- Pydantic models ---

class SessionCreate(BaseModel):
    candidate_name: str | None = None
    use_structured: bool = True


class SessionResponse(BaseModel):
    session_id: str
    stage: str
    total_turns: int
    is_finished: bool
    evaluations_count: int
    avg_score: float | None


class TextTurnRequest(BaseModel):
    text: str


class TurnResponse(BaseModel):
    reply: str
    stage: str
    total_turns: int
    is_finished: bool
    audio_url: str | None = None


# --- REST endpoints ---

@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.9.0"}


@app.post("/api/session", response_model=SessionResponse)
def create_session(req: SessionCreate):
    sid = uuid.uuid4().hex[:12]
    session = InterviewSession(
        session_id=sid,
        candidate_name=req.candidate_name,
        use_structured=req.use_structured,
    )
    sessions[sid] = session
    status = session.get_status()
    return SessionResponse(
        session_id=sid,
        stage=status["stage"],
        total_turns=status["total_turns"],
        is_finished=status["is_finished"],
        evaluations_count=status["evaluations_count"],
        avg_score=status["avg_score"],
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
    )


@app.post("/api/session/{session_id}/turn", response_model=TurnResponse)
def text_turn(session_id: str, req: TextTurnRequest):
    """Text-only turn for testing (no audio)."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    reply = session.turn(req.text)
    status = session.get_status()

    # Synthesize audio for the reply
    audio_path = AUDIO_DIR / session_id / f"turn_{status['total_turns']}.mp3"
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    synthesize(reply, audio_path)

    return TurnResponse(
        reply=reply,
        stage=status["stage"],
        total_turns=status["total_turns"],
        is_finished=status["is_finished"],
        audio_url=f"/api/audio/{session_id}/turn_{status['total_turns']}.mp3",
    )


@app.get("/api/audio/{session_id}/{filename}")
def serve_audio(session_id: str, filename: str):
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
    }


# --- WebSocket endpoint for real-time audio ---

@app.websocket("/ws/interview/{session_id}")
async def ws_interview(ws: WebSocket, session_id: str):
    """Real-time audio interview via WebSocket.

    Protocol:
        Client sends: binary audio chunks (linear16, 16kHz, mono)
        Client sends: JSON {"type": "end_turn"} to signal end of speech
        Server sends: JSON {"type": "transcript", "text": "..."} for interim STT
        Server sends: JSON {"type": "reply", "text": "...", "audio": "<base64 mp3>", "stage": "...", "turn": N}
        Server sends: JSON {"type": "finished"} when interview ends
    """
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
            # Start a new streaming transcription for this turn
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

            # Receive audio chunks until end_turn signal
            while True:
                message = await ws.receive()

                if message.get("type") == "websocket.disconnect":
                    raise WebSocketDisconnect()

                if "bytes" in message:
                    await transcriber.send_audio(message["bytes"])
                elif "text" in message:
                    import json
                    data = json.loads(message["text"])
                    if data.get("type") == "end_turn":
                        break

            # Finalize transcription
            full_text = await transcriber.finish()
            if not full_text:
                full_text = " ".join(collected_transcript)
            collected_transcript.clear()

            if not full_text.strip():
                await ws.send_json({"type": "error", "message": "No speech detected"})
                continue

            # Get LLM reply
            reply = session.turn(full_text.strip())
            status = session.get_status()

            # Synthesize audio reply
            audio_path = AUDIO_DIR / session_id / f"turn_{status['total_turns']}.mp3"
            audio_path.parent.mkdir(parents=True, exist_ok=True)
            synthesize(reply, audio_path)

            # Read audio and send as base64
            audio_b64 = base64.b64encode(audio_path.read_bytes()).decode()

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


# --- Serve frontend static files (Phase 10) ---

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

    @app.get("/")
    def serve_index():
        index = FRONTEND_DIR / "index.html"
        if index.exists():
            return FileResponse(index)
        return {"message": "Frontend not built yet — see Phase 10"}
