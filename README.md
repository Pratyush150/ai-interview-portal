# AI Interview Portal full

An end-to-end, voice-first AI interviewer for software engineering roles. A
candidate uploads a resume, gets matched to a job, and sits through a staged
interview with a senior-engineer-personality LLM — audio in, audio out,
realtime scoring, AI-answer detection, and a browser-side anti-cheat layer
that watches the camera, the keyboard, and the tab.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         AI INTERVIEW PORTAL                               │
│                                                                           │
│  Browser (vanilla JS)                           FastAPI backend           │
│  ┌──────────────┐   audio   ┌────────────────┐   ┌───────────────────┐    │
│  │ mic + VAD    │──────────▶│ /audio-turn    │──▶│ Deepgram STT      │    │
│  │ camera feed  │           │ /turn          │   │ Groq LLM (struct) │    │
│  │ anti-cheat   │──violations▶│ /cheating     │   │ ElevenLabs TTS   │    │
│  │ TTS player   │◀──reply+url┤ (Turn JSON)   │◀──│ (optional)        │    │
│  └──────────────┘           └────────────────┘   └───────────────────┘    │
│                                     │                                     │
│                                     ▼                                     │
│                              SQLite (portal.db)                           │
│                    candidates • resumes • jobs • applications •           │
│                    interview_sessions • eval_records • email_log          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Repository layout](#repository-layout)
3. [Running locally](#running-locally)
4. [Environment variables](#environment-variables)
5. [End-to-end data flows](#end-to-end-data-flows)
6. [Interview stage machine](#interview-stage-machine)
7. [LLM pipeline](#llm-pipeline)
8. [Speech pipeline — STT & TTS](#speech-pipeline)
9. [Always-on microphone + VAD](#always-on-microphone--vad)
10. [Anti-cheat subsystem](#anti-cheat-subsystem)
11. [AI-generated-answer detection](#ai-generated-answer-detection)
12. [Scoring rubric](#scoring-rubric)
13. [Resume parser](#resume-parser)
14. [Database schema](#database-schema)
15. [HTTP / WebSocket API](#http--websocket-api)
16. [Streaming, personas, memory, dashboard](#streaming-personas-memory-dashboard)
17. [Performance notes](#performance-notes)
18. [Roadmap — what's next and why](#roadmap--whats-next-and-why)

---

## Tech stack

| Layer       | Choice                                        | Why                                                           |
|-------------|-----------------------------------------------|---------------------------------------------------------------|
| STT         | Deepgram `nova-2` (file + streaming)          | sub-second latency, word-level timestamps, good with accents  |
| LLM         | Groq cloud, `llama-3.3-70b-versatile`         | Groq gives ~5–10× tokens/sec over other hosts; 70b for quality|
| LLM (fast)  | `llama-3.1-8b-instant`                        | used for intro / background / wrap-up where scoring isn't critical |
| TTS         | ElevenLabs `eleven_turbo_v2_5` (optional)     | highest quality; optional because browser Web Speech is instant and free |
| Backend     | Python 3.10+, FastAPI, SQLite, uvicorn        | zero-ops, one-file DB, async-friendly                         |
| Frontend    | Vanilla HTML / CSS / JS, Web Audio API        | no build step, smaller attack surface                         |
| PDF parse   | PyMuPDF (`fitz`)                              | fastest and most reliable text extractor for resumes          |
| Auth        | Salt + SHA-256 + bearer token                 | company dashboard only; candidates use signed invite tokens   |

---

## Repository layout

```
backend/
  api.py                      REST + WebSocket entry point
  database.py                 SQLite schema + helpers (hash/verify password)
  resume_parser.py            PDF → text → LLM-structured resume JSON
  email_service.py            invite-email dispatcher
  ai_detection.py             heuristic AI-answer detector
  scoring_rubric.py           LLM prompt text: rubric + AI-detection guidance
  interview/
    engine.py                 InterviewSession class + stage machine
  llm/
    groq_client.py            raw chat call
    structured.py             structured-JSON call + topic-diversity prompting
  stt/
    deepgram_stt.py           file-upload transcription
    deepgram_streaming.py     WebSocket streaming transcriber
  tts/
    elevenlabs_tts.py         synthesize(text, path) → MP3
frontend/
  index.html                  all screens in one SPA-ish page
  app.js                      session + VAD + resume render + screens
  anticheat.js                tab, copy, motion, phone, camera-off watchers
  style.css                   dark theme
data/
  portal.db                   auto-created SQLite file
tests/
  smoke_*.py                  one-off scripts for each subsystem
```

---

## Running locally

```bash
python3 -m pip install -r requirements.txt
cp .env.example .env           # fill in keys
uvicorn backend.api:app --reload --port 8000
# open http://localhost:8000/
```

Optional headless smoke tests (each validates one subsystem):

```bash
python tests/smoke_llm.py          # Groq round-trip
python tests/smoke_stt.py          # Deepgram file transcription
python tests/smoke_tts.py          # ElevenLabs synthesis
python tests/smoke_pipeline.py     # STT → LLM → TTS
python tests/smoke_engine.py       # stage machine
python tests/smoke_structured.py   # structured JSON + rubric scoring
python tests/smoke_streaming.py    # Deepgram streaming
```

---

## Environment variables

| Key                 | Required  | Default                        | Purpose                                 |
|---------------------|-----------|--------------------------------|-----------------------------------------|
| `GROQ_API_KEY`      | yes       | —                              | LLM requests                            |
| `GROQ_MODEL`        | no        | `llama-3.3-70b-versatile`      | primary LLM                             |
| `GROQ_FAST_MODEL`   | no        | `llama-3.1-8b-instant`         | used on light stages (intro, background, wrap-up) |
| `DEEPGRAM_API_KEY`  | only for voice | —                         | STT                                     |
| `ELEVENLABS_API_KEY`| only if `USE_SERVER_TTS=1` | —                 | high-quality TTS                        |
| `ELEVENLABS_VOICE_ID`| no       | `21m00Tcm4TlvDq8ikWAM` (Rachel)| voice choice                            |
| `USE_SERVER_TTS`    | no        | `0`                            | `1` = ElevenLabs; `0` = browser Web Speech (fast, free) |
| `SMTP_*`            | no        | —                              | outbound invite emails                  |

---

## End-to-end data flows

### A. Candidate applies to a job

```
browser ─▶ POST /api/jobs/:id/apply   (multipart: name, email, resume PDF)
            │
            ├──▶ PyMuPDF extracts raw text
            ├──▶ Groq LLM structures the resume (skills, domains, years, projects)
            ├──▶ INSERT candidates, resumes, applications (status=applied)
            └──▶ returns {application_id, invite_token, skills, experience_years,
                            domains, key_projects, education, experience_summary,
                            suggested_questions}

company dashboard ─▶ POST /api/invite/send   (Bearer token)
            │
            ├──▶ email_service.send_interview_invite(...)  (SMTP)
            └──▶ UPDATE applications SET status='invited'

candidate clicks invite link ?token=... ─▶ GET /api/invite/:token
            returns candidate_name, job_title, resume_id, job_id

candidate hits "Start Interview"
            ─▶ POST /api/session  { invite_token | resume_id + job_id }
            returns session_id, stage='intro'
```

### B. Interview turn (voice)

```
browser VAD detects end-of-utterance
    ├─ MediaRecorder.stop() → WebM/Opus blob
    └─ POST /api/session/:id/audio-turn  (multipart file)
            │
            ├─ Deepgram STT (thread pool)            ~ 300–800 ms
            ├─ session.turn(transcript, is_voice_input=True)
            │    ├─ builds messages: system_prompt + history(last 8) + user
            │    ├─ Groq completion (structured JSON)
            │    ├─ heuristic.analyze_answer() — AI-likelihood
            │    └─ combined_ai = blend(heuristic, llm)
            ├─ (optional) ElevenLabs TTS → MP3 on disk
            └─ returns { reply, stage, total_turns, is_finished, audio_url? }

browser renders reply
    ├─ typing animation
    ├─ Web Speech API (if USE_SERVER_TTS=0) OR <audio> on audio_url
    ├─ VAD paused while interviewer talks (vad.interviewerSpeaking=true)
    └─ VAD resumes after onspeechend
```

### C. Interview turn (text)

Same as B but skips STT. `POST /api/session/:id/turn` with JSON body
`{ text, time_to_respond_ms, is_voice_input: false }`. `time_to_respond_ms`
feeds the AI detector (pasted text typically has impossibly-fast cadence).

### D. Anti-cheat reporting

The browser batches violations and flushes every 30s (or on interview end)
to `POST /api/session/:id/cheating-report`. The server appends each dict
verbatim onto `InterviewSession.cheating_flags`, which is surfaced in the
`evaluations` endpoint and final results.

---

## Interview stage machine

```
        ┌──────┐     ┌──────────┐     ┌───────────┐     ┌───────────┐     ┌─────────┐     ┌──────────┐
        │INTRO │───▶│BACKGROUND│───▶│ TECHNICAL │───▶│ FOLLOW_UP │───▶│ WRAP_UP │───▶│ FINISHED │
        └──────┘     └──────────┘     └───────────┘     └───────────┘     └─────────┘     └──────────┘
         2 turns       4 turns          9 turns          5 turns          2 turns
```

Each stage has:
- a **turn limit** (`STAGE_TURN_LIMITS` in `backend/interview/engine.py`);
  exceeding it auto-advances the stage.
- a **stage-specific prompt overlay** (`STAGE_PROMPTS`) injected into the
  system prompt. Example: the TECHNICAL overlay tells the LLM to dig deep
  into one or two topics rather than skim broadly, and always follow up
  with "why that choice / what if requirements changed / failure modes".
- **topic-diversity enforcement**: `InterviewSession.asked_topics` grows
  as the LLM tags each question, and the system prompt carries both the
  already-covered list and the pool of approved topic categories. The LLM
  is told to pick a new category and not revisit covered ones.

The LLM itself can also vote to advance the stage early via the
`meta.suggest_advance` field in its structured JSON response.

---

## LLM pipeline

**Entry:** `backend/llm/structured.py::ask_llm_structured(...)`

**Prompt construction:**
1. `STRUCTURED_SYSTEM_PROMPT` — fixed JSON schema the LLM must obey.
2. `SCORING_RUBRIC` + `AI_DETECTION_PROMPT` — appended to the system
   prompt, calibrates 0–10 scoring and AI-answer likelihood.
3. Stage label, resume context, job context.
4. Asked-topics block that lists already-covered areas and forces
   diversity.
5. Last 8 turns from history.
6. Current user utterance.

**Response shape (strict JSON):**

```json
{
  "spoken_text": "1–3 sentence reply the candidate hears",
  "evaluation": {
    "correctness": 0–10 | null,
    "depth": 0–10 | null,
    "communication": 0–10 | null,
    "relevance": 0–10 | null,
    "score": auto-averaged,
    "strengths": ["..."],
    "weaknesses": ["..."],
    "notes": "internal note"
  },
  "meta": { "topic": "…", "difficulty": "easy|medium|hard", "suggest_advance": bool },
  "ai_detection": { "ai_likelihood": 0.0–1.0, "human_indicators": [...], "ai_indicators": [...] }
}
```

**Model selection.** `technical` and `follow_up` stages run on the 70b
model because nuanced scoring benefits from depth. `intro`, `background`,
and `wrap_up` run on the 8b instant model — these stages are conversational
and don't need heavy reasoning, so we save ~1s per turn.

**Dual-path scoring.** Engine computes:

```
combined_ai = 0.5 * heuristic_ai_likelihood + 0.5 * llm_ai_likelihood
              (scaled down 70% if neither signal is strong)
```

and penalizes the candidate's final score when `combined_ai > 0.5`:

```
if combined_ai > 0.7:   adjusted_score = score * 0.70
elif combined_ai > 0.5: adjusted_score = score * 0.85
else:                   adjusted_score = score   (unchanged)
```

Both `score` and `original_score` are stored so reviewers see the raw and
penalized values.

---

## Speech pipeline

### STT — Deepgram

Two integration modes:

- **File-upload mode** (`stt/deepgram_stt.py`): we post the completed
  WebM/Opus blob produced by the browser MediaRecorder. Simplest path; used
  by the `/audio-turn` REST endpoint. Latency dominated by HTTP round-trip
  and Deepgram inference (~300–800 ms).
- **Streaming mode** (`stt/deepgram_streaming.py`): opens a WebSocket to
  Deepgram, streams raw Opus bytes, emits partial + final transcripts.
  Used by `/ws/interview/{id}`; partial transcripts fire
  `ws.send_json({type: "transcript", final: false})` for live caption UI.

### TTS — browser-first, ElevenLabs-optional

Browser path (default, `USE_SERVER_TTS=0`):
- Backend returns `{ audio_url: null }`.
- Frontend uses `window.speechSynthesis.speak(...)` with a synced typing
  animation. Zero added latency, zero API cost.

Server path (`USE_SERVER_TTS=1`):
- Backend runs `elevenlabs.convert(...)`, streams chunks to
  `tests/audio/sessions/<sid>/turn_<n>.mp3`.
- Backend returns `audio_url: "/api/audio/<sid>/turn_<n>.mp3"`.
- Frontend plays the file via a hidden `<audio>` element while the typing
  animation runs.

---

## Always-on microphone + VAD

File: `frontend/app.js` (the `vad` object + `startVAD` / `vadLoop`)

Design: the mic opens once at session start and stays open. The browser's
`AnalyserNode` feeds a 1024-sample buffer every animation frame; we compute
RMS energy per frame. Two thresholds:

| constant              | value     | meaning                                     |
|-----------------------|-----------|---------------------------------------------|
| `VAD_RMS_THRESHOLD`   | `0.022`   | energy above this counts as speech          |
| `VAD_SILENCE_MS`      | `1400`    | silence window that ends an utterance       |
| `VAD_MIN_UTTERANCE_MS`| `700`     | discard blips (coughs, pops) shorter than this |

Flow:

```
IDLE (listening)
  │ rms > 0.022  ─▶ start MediaRecorder, mark speechStartAt
  ▼
SPEAKING
  │ every frame rms > 0.022 ─▶ refresh lastSpeechAt
  │ no speech for VAD_SILENCE_MS ─▶ stop recorder
  ▼
[duration < 700ms]  ─▶ discard blob
[duration >= 700ms] ─▶ POST /audio-turn  (sets vad.processing = true)
                       on response, resume IDLE
```

**Why VAD is blocked during TTS.** When the interviewer's voice plays out
of the speakers the mic would pick it up and re-transcribe it. Before we
render an assistant message we set `vad.interviewerSpeaking = true`;
`onSpeechFinished()` (fired by both the Web Speech API's `onend` and the
`<audio>` `onended` event) clears it.

**Mic button** is now a mute toggle (or spacebar). No push-to-talk.

---

## Anti-cheat subsystem

File: `frontend/anticheat.js` (the `AntiCheatMonitor` class).

All violations are appended to an in-memory list and POSTed to
`/api/session/:id/cheating-report` every 30 seconds (also flushed on stop).

| Watcher                    | How it works                                                              | Violation `type`         |
|----------------------------|---------------------------------------------------------------------------|--------------------------|
| tab-switch                 | `document.visibilitychange`                                               | `tab_switch`, `window_blur` |
| copy / paste               | `document.on('paste')` captures length + first 50 chars                   | `paste_detected`, `copy_detected` |
| devtools                   | outer/inner window size diff > 200px                                      | `devtools_suspected`     |
| AI assistant extensions    | periodic DOM scan for Grammarly / ChatGPT / Copilot selectors             | `extension_detected`     |
| right-click                | `contextmenu` prevented + logged                                          | `right_click`            |
| suspicious keyboard shortcuts | F12, Ctrl+Shift+I/J/C, Ctrl+U                                          | `suspicious_shortcut`    |
| camera turned off (track.ended) | attached listener on each `MediaStreamTrack`                        | `camera_stopped`         |
| camera-off button press during session | `app.js` shows a red banner and refuses the click            | `camera_off_attempt`     |
| motion detection           | 64×48 canvas, per-pixel luminance diff vs previous frame, 3-frame streak at `diff > 0.08` | `excessive_motion` |
| phone / second screen      | bright-pixel fraction 10–55% with concentrated bounding box (a phone screen produces a tight rectangle of near-white pixels); 3-frame streak | `phone_suspected` |
| camera covered / dark      | mean luminance < 18 for 4 consecutive samples                             | `camera_blocked`         |

All image analysis reuses the same ~600ms sampling loop against one
canvas; per-frame cost is <1 ms on commodity hardware.

### Why camera-off is hard-blocked

During an active session the camera button click handler shows a banner
and immediately restarts the camera. This is intentional: the browser
*cannot* prevent the OS from killing the device (e.g. user unplugs USB),
so we pair this with a `track.ended` watchdog that auto-restarts and logs
a `camera_stopped` flag.

---

## AI-generated-answer detection

Two independent sources of evidence, combined in
`interview/engine.py::turn_structured`.

### Source 1 — heuristic (`backend/ai_detection.py`)

Signals (each contributes its own score; we take the **max** so one weak
signal can't inflate the total):

| Signal                          | Trigger                                                 | Weight |
|---------------------------------|---------------------------------------------------------|--------|
| unusually long response         | > 200 words                                              | 0.55   |
| moderate length                 | > 140 words                                              | 0.25   |
| AI structural markers           | ≥ 4 of: "certainly", "let me explain", numbered lists, "moreover", "leverage", "delve" … | 0.75 |
| moderate markers                | ≥ 3 markers                                              | 0.45   |
| impossibly fast typing (text)   | > 80 chars/sec, answer > 40 words                        | 0.85   |
| suspiciously fast typing        | > 40 chars/sec, answer > 40 words                        | 0.50   |
| sophisticated vocab density     | ≥ 4 buzzwords AND ≥ 1 per 25 words                       | 0.40   |
| voice answer with zero disfluency | > 60 words, no "um/uh/like/you know"                  | 0.25   |
| formatted list in speech        | `^1. `, `^- `, `^* ` in a spoken answer                  | 0.35   |

**Crucial guard:** answers shorter than **25 words** return likelihood
`0.0` with `confident=False`. Greetings, acknowledgements, and
one-sentence replies simply don't carry enough signal to judge — this
was the fix for the 21% false-positive issue on short natural replies.

### Source 2 — LLM self-assessment

The system prompt (`AI_DETECTION_PROMPT` in `scoring_rubric.py`) tells
the LLM to:
- output `0.0` when the answer is under 25 words,
- default to `0.05` when evidence is weak (never use 0.2–0.3 as a "just
  in case" value),
- only go above `0.4` with two independent red flags,
- only go above `0.7` with clear LLM fingerprints.

### Blending

```python
if not heuristic.confident:         # short answer
    combined_ai = 0.0
else:
    blended = 0.5 * heuristic + 0.5 * llm
    if heuristic < 0.2 and llm < 0.4:
        blended *= 0.3              # neither signal confident, scale down
    combined_ai = round(blended, 2)
```

---

## Scoring rubric

From `backend/scoring_rubric.py`. Every technical or follow-up answer
scores four dimensions, each 0–10:

1. **Correctness** — is the answer factually right?
2. **Depth** — surface-level vs expert-level with trade-offs?
3. **Communication** — how clearly expressed?
4. **Relevance** — does it actually address the question?

Final score = mean of the four, rounded to 1 decimal. The LLM is told
**not** to inflate: most competent answers live in the 5–7 band; 8+ is
reserved for genuinely exceptional responses.

Stages `intro` and `wrap_up` explicitly return `null` for all four
dimensions — we don't score small-talk.

---

## Resume parser

1. **PDF → text**: `PyMuPDF` extracts raw text per page, joins with
   newlines. Truncated to 4000 chars before the LLM call.
2. **Text → structured JSON**: Groq LLM with `response_format=json_object`
   returns:

   ```json
   {
     "skills": ["Python", "FastAPI", "PostgreSQL", ...],
     "experience_years": 5,
     "domains": ["backend", "distributed systems"],
     "key_projects": ["built a real-time analytics pipeline at X", ...],
     "education": "BSc Computer Science, IIT",
     "experience_summary": "Five years of backend engineering…",
     "suggested_questions": ["Tell me about your sharding strategy…"]
   }
   ```

3. **Persistence**: raw text (first 5000 chars) + JSON go into the
   `resumes` table. At session creation the session loads the JSON back
   and feeds `experience_summary`, `skills`, and `suggested_questions`
   into the interview system prompt.
4. **UI**: the setup screen renders a per-field breakdown so the
   candidate can see which signals will steer the interview — skills
   drive technical questions, domains bias topics, experience years
   calibrates difficulty, projects become drill-targets.

---

## Database schema

All tables live in `data/portal.db` (WAL journal, foreign keys ON).

```
candidates(id, name, email, created_at)
resumes(id, candidate_id, filename, raw_text, skills_json, uploaded_at)
companies(id, name, email, password_hash, auth_token, created_at)
jobs(id, company_id, title, description, required_skills, status, created_at)
applications(id, job_id, candidate_id, resume_id, session_id, status,
             invite_token UNIQUE, created_at)
interview_sessions(id, candidate_id, resume_id, job_id, stage, status,
                    cheating_flags, total_score, created_at, finished_at)
eval_records(id PK autoinc, session_id, turn_number, stage, score,
              correctness, depth, communication, relevance, topic,
              strengths, weaknesses, notes, ai_likelihood, created_at)
email_log(id, to_addr, subject, body, status, sent_at)
```

Password hashing uses a random 16-byte salt with SHA-256 → stored as
`salt$hash`. Auth tokens rotate on every login.

---

## HTTP / WebSocket API

### Public

| Method | Path                                   | Purpose                                      |
|--------|----------------------------------------|----------------------------------------------|
| GET    | `/`                                    | serve `frontend/index.html`                  |
| GET    | `/static/*`                            | serve frontend assets                        |
| GET    | `/api/health`                          | liveness probe                               |
| POST   | `/api/resume/upload`                   | upload + parse resume, returns full breakdown|
| GET    | `/api/jobs`                            | list active jobs                             |
| GET    | `/api/jobs/:id`                        | job detail                                   |
| POST   | `/api/jobs/:id/apply`                  | apply to job (multipart resume)              |
| GET    | `/api/invite/:token`                   | validate invite token                        |
| POST   | `/api/session`                         | create interview session                     |
| GET    | `/api/session/:id`                     | session status                               |
| POST   | `/api/session/:id/turn`                | text turn                                    |
| POST   | `/api/session/:id/audio-turn`          | voice turn (multipart WebM/Opus)             |
| POST   | `/api/session/:id/cheating-report`     | append violations (list of arbitrary dicts)  |
| GET    | `/api/session/:id/evaluations`         | per-turn scores + cheating flags             |
| GET    | `/api/audio/:id/:file`                 | serve ElevenLabs MP3                         |
| WS     | `/ws/interview/:id`                    | streaming STT + structured reply             |

### Company (Bearer auth)

| Method | Path                                         |
|--------|----------------------------------------------|
| POST   | `/api/company`  (register, returns token)    |
| POST   | `/api/company/login`                         |
| POST   | `/api/company/:id/jobs`                      |
| GET    | `/api/company/:id/applications`              |
| POST   | `/api/invite/send`                           |

---

## Streaming, personas, memory, dashboard

This release adds four features that make the system feel like a real-time
conversation rather than a request/response form.

### 1. SSE streaming — spoken reply begins on the first token

Two new endpoints return Server-Sent Events:

```
POST /api/session/:id/turn-stream          (text in → SSE reply)
POST /api/session/:id/audio-turn-stream    (audio in → SSE transcript + reply)
```

Each emits three kinds of events:

```
event: transcript     # audio only: STT result so the UI can render the user line
data: {"text": "..."}

event: token          # one per LLM delta
data: {"text": " how"}

event: done
data: {"stage": "technical", "total_turns": 4, "is_finished": false}
```

The frontend consumer (`consumeSSE` in `app.js`) accumulates tokens into the
assistant bubble and feeds *completed sentences* to the Web Speech API as
they become available. Result: the interviewer starts speaking ~200 ms
after the candidate stops, instead of waiting 1–3 s for the full reply.

Scoring is decoupled. After the SSE response is fully flushed, the server
schedules a background task (`asyncio.create_task`) that runs
`session.score_last_turn()` — a heavier structured-JSON call to the 70b
model. Results land in `session.evaluations` a second or two later and are
picked up by the next `/evaluations` poll.

### 2. Interruption handling (barge-in)

The VAD loop keeps running while the interviewer is talking. If the
candidate produces sustained speech (>350 ms above threshold) during the
interviewer's turn, `interruptInterviewer()` is called:

- aborts the in-flight SSE fetch (`AbortController.abort()`),
- cancels `speechSynthesis` and drops the sentence queue,
- clears `vad.interviewerSpeaking`,
- records an `interruption` entry on the anti-cheat log (not a violation
  — just an observability signal).

The candidate's utterance then becomes the next turn via the normal VAD
path, so "wait, can you repeat that?" works naturally.

### 3. Interviewer personas

Three system-prompt variants, selectable on the setup screen:

| Persona        | Tone / style                                                    |
|----------------|-----------------------------------------------------------------|
| `mentor`       | Warm, patient, positive acknowledgement before deeper follow-ups. Good for juniors. |
| `senior`       | Terse, rigorous, cuts off rambling, pulls back to numbers and p99s. |
| `cto`          | Ties every technical question to business impact and trade-offs. |

Defined in `backend/llm/streaming.py::PERSONAS`. Passed at session
creation via `POST /api/session {"persona": "mentor"}`.

### 4. Cross-turn claim memory

The scoring response includes an `extracted_claims` list — up to three
concrete factual statements the candidate made (e.g. "worked on Kafka
pipeline at Flipkart handling 200k events/sec"). These accumulate on
`InterviewSession.key_claims` and are injected into every subsequent
system prompt:

```
Key claims the candidate has made earlier in this interview
(use these to check consistency and drill into specifics):
- worked on Kafka pipeline at Flipkart handling 200k events/sec
- used Redis as a write-through cache with 1-hour TTL
- led a team of 5 on the migration from MySQL to Postgres
```

This is a lightweight alternative to a full vector DB — it gives the
interviewer persistent memory across the entire session, even past the
8-turn sliding history window. Recorder's note in the *Roadmap* below:
the proper fix at scale is Chroma or Pinecone.

### 5. Adaptive probing on vague answers

The scorer emits a `meta.is_vague` flag; we also auto-flag any answer
whose `depth` score is ≤ 3. When the flag is set on turn N, the system
prompt for turn N+1 contains:

> IMPORTANT: the candidate's last answer was vague or surface-level. DO
> NOT move on. Ask a sharper follow-up on the SAME topic demanding
> specifics — numbers, names, a concrete example, or a failure mode they hit.

So "I used PyTorch for a project" no longer gets a polite move-on; it
gets "which loss function, and why over cross-entropy in that specific
case?".

### 6. Recruiter X-ray dashboard

The end-of-interview results screen renders:

- **Skill radar** — SVG polygon of the four rubric dimensions averaged
  across turns.
- **Score timeline** — per-turn line chart, dot color = AI-likelihood
  flag (red when > 0.5).
- **AI-answer similarity** — horizontal bar showing mean likelihood.
- **Integrity flag histogram** — one bar per violation type
  (`tab_switch`, `phone_suspected`, `face_absent`, …) sized by count.
- **Turn-by-turn detail** — strengths, weaknesses, per-dimension scores.

All charts are hand-rolled inline SVG — no chart-library dependency.

### 7. Face-presence tracking

Added to `anticheat.js`. During the first ~10 samples we calibrate a
baseline center-region luminance variance (faces have edges; empty
frames don't). Sustained drop below 40% of baseline for 4 consecutive
frames → `face_absent` violation + warning banner.

This is intentionally *simpler* than full eye tracking (see Roadmap for
the WebGazer.js upgrade path) — it catches the big case of the
candidate leaving the seat or turning their head toward a second screen
without adding a 4 MB ML dependency.

---

## Performance notes

End-to-end turn latency, voice path, measured on a typical WSL2 dev box:

| Hop                       | Latency    | Notes                                      |
|---------------------------|------------|--------------------------------------------|
| VAD detects end-of-utterance | +1.4 s  | `VAD_SILENCE_MS`; lowering risks cutoffs   |
| Blob upload to `/audio-turn` | 50–200 ms | depends on Opus blob size                |
| Deepgram STT              | 300–800 ms | `nova-2` file mode                         |
| Groq LLM (70b)            | 500–1800 ms| halved on stages running the 8b fast model |
| Server TTS (if enabled)   | 500–1500 ms| ElevenLabs turbo_v2_5                      |
| Browser TTS (default)     | ~0 ms      | Web Speech API, starts immediately         |

Total with `USE_SERVER_TTS=0`: ~2.3–4.2 s from the moment the candidate
stops speaking to the moment the interviewer starts replying.

With the SSE path enabled (default for both text and voice turns),
time-to-first-spoken-word drops to ~200–400 ms after the last byte of
audio/text arrives at the server. The rest of the reply streams behind
it, and scoring happens out-of-band.

Knobs to turn if a turn still feels slow:
- Shrink `VAD_SILENCE_MS` (default 1400 ms) — but watch for the system
  submitting half-finished thoughts.
- Move more stages onto `GROQ_FAST_MODEL` in `structured.py`.
- Keep `USE_SERVER_TTS=0` unless voice quality is required — browser
  Web Speech is zero-latency and speaks sentence-by-sentence during
  streaming.
- Reduce the history window (`structured.py` currently keeps the last 8
  messages). Going below 6 starts to cost continuity.

---

## Roadmap — what's next and why

The items below are intentionally *not* implemented yet — each is a real
engineering project, not a one-session change. Listed here with a
pragmatic estimate so the scope is honest.

### Cognitive upgrades

| Feature | Value | Why not yet |
|---------|-------|-------------|
| **Vector DB memory (Chroma / Pinecone)** | Exact similarity recall across a 1-hour interview, not just the 15-claim scratchpad we ship now. | Needs a running Chroma service + embeddings call per turn (~$0.0001 each). Current claim-memory is 80% of the benefit at 1% of the complexity. Swap-in target: `backend/interview/memory.py` — keep the current claim list as L1, add Chroma as L2. |
| **Multi-model federated scoring** | Cross-check Llama-70b's verdict with DeepSeek-Coder and GPT-4o; disagreement = flag for human review. | 3x the token cost per turn. Better unlocked behind a "senior role" flag so we pay the cost only where it matters. |
| **Agentic evaluation (3-model debate)** | Three scorers argue their grade; the transcript of the debate becomes part of the report. | Same cost concern + ~4 s extra latency. Fits as an end-of-interview batch job, not per-turn. |
| **Head-pose + eye tracking (WebGazer.js)** | Detect candidate's gaze drifting off-screen toward a second monitor. | Adds a 4 MB CDN dep and requires a per-user calibration step. Our brightness-variance tracker catches the gross case (face gone) — gaze-level tracking is a phase-2 upgrade. |
| **Vision-capable LLM (GPT-4o / Gemini 1.5 Pro)** | Actually *watch* the candidate: body language, whispering, a second person in frame. | ~10x cost per turn. Best used as a once-per-minute batch sample, not every frame. |

### Technical assessment

| Feature | Value | Why not yet |
|---------|-------|-------------|
| **Monaco editor + sandbox execution** | Real coding interview with the AI watching the candidate type, flagging O(n²) loops live. | A secure code sandbox is its own subsystem (Firecracker / gVisor). Slotting the editor UI in is easy; making code execution safe is the work. |
| **Real-time whiteboarding** | Candidates draw architectures; CV parses the diagram into a graph the LLM can reason about. | Requires either a dedicated diagram parser or a multimodal LLM call per stroke. Belongs with the vision-LLM item. |
| **Code "execution sentiment"** | Big-O estimate + style lint + voice-over feedback like a pair programmer. | Cheap if we skip execution, just static analysis. Will ship with the Monaco editor. |

### Infra / scale

| Feature | Value | Why not yet |
|---------|-------|-------------|
| **Rust / Go audio layer** | Python's GIL caps us around a few dozen concurrent streams. Rust can take that to thousands at ~40% lower server cost. | Only worth the migration cost once we actually hit the GIL ceiling. The current WebSocket STT design is GIL-friendly enough for now. |
| **On-device VAD (WASM / silero-vad)** | Server stops receiving silence bytes entirely. Saves bandwidth and STT cost. | Our Web-Audio RMS VAD is already on-device; silero would be more accurate in noisy rooms but adds 2 MB of WASM. Worth the upgrade if false-positive barge-ins become an issue. |
| **Salary / seniority prediction** | Cross-reference scores against market data (Bengaluru / SF / remote) to predict band + retention. | Needs a labeled dataset we don't have. Deferred to after real customer usage. |

### What the current build prioritizes

We picked streaming + barge-in + personas + claim-memory + adaptive
probing + face-presence + the recruiter dashboard because they are the
changes that the candidate *feels* inside a single interview. The
infra and multi-model items above are worth the work only once we have
enough load to justify them.

