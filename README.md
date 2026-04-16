# AI Interview Portal

Voice-based AI technical interviewer for software engineering, AI/ML, and robotics roles.

**Pipeline:** mic → Deepgram STT → Groq LLM (Llama 3.3 70B) → ElevenLabs TTS → speaker

## Stack
- **STT:** Deepgram (`nova-2`)
- **LLM:** Groq cloud API (`llama-3.3-70b-versatile`) — chosen over local Ollama due to hardware constraints on prototype machine. Provider-agnostic `backend/llm/` makes swap trivial.
- **TTS:** ElevenLabs (`eleven_turbo_v2_5`, voice: Rachel)
- **Backend:** Python 3.10+, FastAPI (Phase 9)

## Setup

```bash
python3 -m pip install -r requirements.txt
cp .env.example .env        # fill in keys
```

Required keys in `.env`:
- `DEEPGRAM_API_KEY` — deepgram.com
- `ELEVENLABS_API_KEY` — elevenlabs.io
- `GROQ_API_KEY` — console.groq.com (free tier)

## Run the pipeline (Phase 5+)

```bash
# Full pipeline: audio → transcript → LLM reply → speech
python -m backend.main tests/audio/sample.wav
python -m backend.main tests/audio/sample.wav --out tests/audio/reply.mp3
```

## Smoke tests (run after Phase 4)

```bash
python tests/smoke_llm.py              # Groq → text reply
python tests/smoke_tts.py              # ElevenLabs → tests/audio/output_tts.mp3
# Drop a short .wav at tests/audio/sample.wav first:
python tests/smoke_stt.py              # Deepgram → transcript
python tests/smoke_pipeline.py         # Full STT → LLM → TTS pipeline
python tests/smoke_engine.py           # Interview engine stages + memory
python tests/smoke_structured.py       # Structured JSON LLM output + scoring
python tests/smoke_streaming.py        # Deepgram real-time streaming STT
```

## Interview mode (text, Phase 6+)

```bash
python -m backend.main --interview     # Interactive text-based interview
```

## API server (Phase 9+)

```bash
uvicorn backend.api:app --reload --port 8000
```

### REST endpoints
- `POST /api/session` — create session (`{"candidate_name": "...", "use_structured": true}`)
- `GET  /api/session/{id}` — session status
- `POST /api/session/{id}/turn` — text turn (`{"text": "..."}`)
- `GET  /api/session/{id}/evaluations` — evaluation scores
- `GET  /api/audio/{id}/{file}` — serve TTS audio
- `GET  /api/health` — health check

### WebSocket (real-time audio)
- `WS /ws/interview/{id}` — send binary audio chunks, receive JSON transcripts + base64 audio replies

## Progress

See [PROGRESS.md](PROGRESS.md) for phase tracker.

## Project structure

```
backend/
  stt/deepgram_stt.py        # Phase 2 — file-based STT
  stt/deepgram_streaming.py  # Phase 8 — real-time streaming STT
  tts/elevenlabs_tts.py      # Phase 3
  llm/groq_client.py         # Phase 4
  llm/structured.py          # Phase 7 — JSON structured output
  interview/engine.py        # Phase 6 — interview state machine
  api.py                      # Phase 9 — FastAPI server
  main.py                    # Phase 5 pipeline + interview mode
tests/
  smoke_*.py                 # one per service
  audio/                     # test .wav files
```
