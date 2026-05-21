# AI Interview Portal full

An end-to-end, voice-first AI interviewer that adapts to the **role and
seniority** of the job posting. A candidate uploads a resume, gets matched to
a job, and sits through a staged interview with a role-specific persona — a
staff SRE for a senior infra job, a consulting partner for an MBA case, a
mechanical design lead for a hardware role. Audio in, audio out, a 3D
animated avatar with lip-sync, realtime scoring, AI-answer detection, and a
browser-side anti-cheat layer that watches the camera, the keyboard, and the
tab.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         AI INTERVIEW PORTAL                               │
│                                                                           │
│  Browser (vanilla JS + three.js)                FastAPI backend           │
│  ┌──────────────┐   audio   ┌────────────────┐   ┌───────────────────┐    │
│  │ 3D avatar    │──────────▶│ /audio-turn    │──▶│ Deepgram STT      │    │
│  │ mic + VAD    │           │ /turn          │   │ Groq LLM (struct) │    │
│  │ camera feed  │──violations▶│ /cheating     │   │ ElevenLabs TTS   │    │
│  │ anti-cheat   │◀──reply+url┤ (Turn JSON)   │◀──│ (optional)        │    │
│  │ TTS player   │           └────────────────┘   └───────────────────┘    │
│  └──────────────┘                   │                                     │
│                                     ▼                                     │
│                              SQLite (portal.db)                           │
│                    candidates • resumes • jobs (role_family,              │
│                    seniority) • applications • interview_sessions •       │
│                    eval_records • email_log                               │
│                                                                           │
│  22 role families  ×  6 seniority tiers  →  role-specific stage prompts,  │
│                                              topics, depth, rubric weights│
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Repository layout](#repository-layout)
3. [Running locally](#running-locally)
4. [Environment variables](#environment-variables)
5. [End-to-end data flows](#end-to-end-data-flows)
6. [Role profiles & seniority](#role-profiles--seniority)
7. [Interview stage machine](#interview-stage-machine)
8. [Pre-interview brief (preflight)](#pre-interview-brief-preflight)
9. [LLM pipeline](#llm-pipeline)
10. [Speech pipeline — STT & TTS](#speech-pipeline)
11. [3D avatar interviewer](#3d-avatar-interviewer)
12. [Always-on microphone + click-to-finish](#always-on-microphone--click-to-finish)
13. [Anti-cheat subsystem](#anti-cheat-subsystem)
14. [AI-generated-answer detection](#ai-generated-answer-detection)
15. [Scoring rubric](#scoring-rubric)
16. [Resume parser](#resume-parser)
17. [End-of-interview report](#end-of-interview-report)
18. [Multi-tenant company workspaces](#multi-tenant-company-workspaces)
19. [Next.js web frontend](#nextjs-web-frontend)
20. [Rate limiting](#rate-limiting)
21. [Database schema](#database-schema)
22. [HTTP / WebSocket API](#http--websocket-api)
23. [Performance notes](#performance-notes)

---

## Tech stack

| Layer       | Choice                                        | Why                                                           |
|-------------|-----------------------------------------------|---------------------------------------------------------------|
| STT         | Deepgram `nova-2` (file + streaming)          | sub-second latency, word-level timestamps, good with accents  |
| LLM         | Groq cloud, `llama-3.3-70b-versatile`         | Groq gives ~5–10× tokens/sec over other hosts; 70b for quality|
| LLM (fast)  | `llama-3.1-8b-instant`                        | used for intro / background / wrap-up where scoring isn't critical |
| TTS (default) | Microsoft **Edge TTS** (neural, `en-US-AriaNeural`) | free, no API key, natural female voice — set as primary path |
| TTS (alt)   | ElevenLabs `eleven_turbo_v2_5`                | higher quality; opt-in via `TTS_PROVIDER=elevenlabs`          |
| Backend     | Python 3.10+, FastAPI, SQLite, uvicorn        | zero-ops, one-file DB, async-friendly                         |
| Frontend (legacy) | Vanilla HTML / CSS / JS, Web Audio API  | mounted at `/candidate` for the interview-room flow           |
| Frontend (new) | Next.js 15 + Tailwind + shadcn/ui (static export, `web/`) | marketing site, company dashboard, candidate signup |
| 3D avatar   | three.js 0.160 + GLTFLoader, local GLB        | morph-target lip sync driven by audio amplitude, idle blinks/gaze |
| PDF parse   | PyMuPDF (`fitz`)                              | fastest and most reliable text extractor for resumes          |
| Auth        | Salt + SHA-256 + bearer token                 | company dashboard only; candidates use signed invite tokens   |

---

## Repository layout

```
backend/
  api.py                      REST + WebSocket entry point
  database.py                 SQLite schema, helpers, demo-company seeding, online migrations
  resume_parser.py            PDF → text → LLM-structured resume JSON
  email_service.py            invite-email dispatcher
  ai_detection.py             heuristic AI-answer detector
  scoring_rubric.py           LLM prompt text: rubric + AI-detection guidance
  interview/
    engine.py                 InterviewSession class + time-paced stage machine
    role_profiles.py          22 role families × 6 seniority tiers, time allocations, mock JDs
    preflight.py              pre-interview brief: LLM reads resume vs JD before turn 1
    report.py                 end-of-interview synthesized report (hire reco, strengths, etc.)
  llm/
    groq_client.py            raw chat call
    structured.py             structured-JSON call + role-aware topic rotation
  stt/
    deepgram_stt.py           file-upload transcription with retry + STTTimeout
    deepgram_streaming.py     WebSocket streaming transcriber
  tts/
    edge_tts_provider.py      Microsoft Edge TTS (default, free, no key)
    elevenlabs_tts.py         ElevenLabs synthesize(text, path) → MP3 (opt-in)
  scripts/
    provision_company.py      manual lead → company conversion CLI (setup_token email)
frontend/                     legacy candidate UI (served at /candidate)
  index.html                  all screens in one SPA-ish page
  app.js                      session + VAD + resume render + screens
  avatar.js                   three.js 3D avatar: lip-sync, blinks, gaze
  avatar.glb                  4.7 MB Ready-Player-Me-style mesh, served locally
  anticheat.js                tab, copy, motion, phone, camera-off watchers
  style.css                   dark theme
web/                          Next.js 15 marketing + company dashboard (TS, Tailwind, shadcn)
  src/app/                    routes (landing, /c/[slug] dashboard, onboarding, contact)
  src/components/             reusable UI primitives
  src/lib/                    API client, auth, helpers
  package.json                next, react, @tanstack/react-query, monaco-editor, radix
data/
  portal.db                   auto-created SQLite file (seeds demo company on first run)
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

For the Next.js web app (optional, for the new marketing site + company
dashboard):

```bash
cd web
npm install
npm run dev        # http://localhost:3000  (dev)
# or, for production parity with FastAPI's static-export serving:
npm run build      # writes web/out/, picked up by /static and the SPA routes
```

On first launch the database is created and seeded with a `DemoCorp` company
plus one mock job description per role family (~23 JDs). Login: `hr@democorp.test` /
`demo1234`. Already-seeded JDs are detected by exact title and skipped on
subsequent boots, so seeding is idempotent.

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
| `USE_SERVER_TTS`    | no        | `1`                            | `1` = server TTS (Edge default, ElevenLabs opt-in); `0` = browser Web Speech |
| `TTS_PROVIDER`      | no        | `edge`                         | `edge` (free, no key) or `elevenlabs`   |
| `EDGE_TTS_VOICE`    | no        | `en-US-AriaNeural`             | any Edge neural voice (e.g. `en-IN-NeerjaNeural`) |
| `ELEVENLABS_API_KEY`| only if `TTS_PROVIDER=elevenlabs` | —              | ElevenLabs key                          |
| `ELEVENLABS_VOICE_ID`| no       | `21m00Tcm4TlvDq8ikWAM` (Rachel)| ElevenLabs voice                        |
| `SMTP_*`            | no        | —                              | outbound invite + onboarding + lead-notification emails |

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
                │
                ├──▶ preflight.build_interview_brief(resume, jd, role, seniority)
                │      one Groq call: returns claim_verifications, jd_gaps,
                │      strong_topics, suggested_opening — injected into the
                │      interviewer's system prompt before turn 1
                └──▶ returns session_id, stage='intro'
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

## Role profiles & seniority

File: `backend/interview/role_profiles.py`.

Every interview is parameterised by a `(role_family, seniority)` pair which
selects a `RoleProfile`: a persona, five stage prompt templates, a topic
rotation, default skills, and a rubric weighting. The same engine therefore
runs a meaningfully different interview for an MBA case vs. a staff SRE
deep-dive — not just cosmetic prompt tweaks.

### Role families (22)

| Bucket             | Families                                                                       |
|--------------------|--------------------------------------------------------------------------------|
| Software & data    | software_engineering, data_engineering, data_science, machine_learning         |
| Infra & platform   | devops_sre, security_engineering, qa_testing                                   |
| Hardware           | embedded_systems, mechanical_engineering, electrical_engineering, civil_engineering |
| Mobile             | mobile_engineering                                                             |
| Product & design   | product_management, ux_ui_design                                               |
| Business / MBA     | consulting, investment_banking_finance, marketing, hr_people, operations_management, business_analyst, product_marketing, sales |

### Seniority tiers

`intern → entry → mid → senior → lead → principal`. Each tier carries:

- a **turn budget** scaling from 8 (intern) to 32 (principal) total questions,
  split across stages — see `TURN_BUDGETS` in `role_profiles.py`,
- a **depth instruction** appended to the core-stage prompt (intern = textbook
  level, principal = "challenge every claim, no hand-waving"),
- automatic **detection from the resume**: `infer_seniority(years)` overrides
  the JD's posted level when the candidate is clearly above or below it
  (e.g. a 10-YoE applicant on a "mid" listing gets senior-depth questions).

### Rubric weighting

Each role family declares per-dimension weights that sum to 1.0. Engineering
roles weight correctness/depth; consulting and design lean on communication
and relevance; security and embedded weight correctness highest. Weights
are passed into the LLM's job context so scoring respects the role.

### Mock JDs

`MOCK_JDS` in `role_profiles.py` ships ~23 ready-to-use job descriptions
spanning every role family. These are seeded into `DemoCorp` on first DB
init so the dashboard and apply flow have content out of the box.

---

## Interview stage machine

```
        ┌──────┐     ┌──────────┐     ┌───────────┐     ┌───────────┐     ┌─────────┐     ┌──────────┐
        │INTRO │───▶│BACKGROUND│───▶│   CORE    │───▶│ FOLLOW_UP │───▶│ WRAP_UP │───▶│ FINISHED │
        └──────┘     └──────────┘     └───────────┘     └───────────┘     └─────────┘     └──────────┘
```

The "core" stage is exposed on the wire as the legacy `technical` enum value
for backward compatibility, but the engine treats it role-agnostically — it
can be a system design block, a finance valuation drill, or a consulting
case.

### Time-based pacing (replaces turn budgets)

Sessions are paced by a **clock**, not a turn count.
`TOTAL_DURATION_MIN_DEFAULT = 22` minutes (overridable per session). Each
seniority tier carries a percentage split across stages
(`STAGE_TIME_ALLOCATION` in `role_profiles.py`); senior+ interviews shift
more time into follow-up for deeper drills, intern/entry shift slightly
more into background.

| Stage      | intern | entry | mid | senior | lead | principal |
|------------|--------|-------|-----|--------|------|-----------|
| intro      |  10%   |  9%   | 8%  |  7%    |  7%  |   6%      |
| background |  22%   | 20%   | 18% | 16%    | 15%  |  13%      |
| core       |  48%   | 50%   | 50% | 50%    | 48%  |  48%      |
| follow_up  |  12%   | 14%   | 18% | 22%    | 25%  |  28%      |
| wrap_up    |   8%   |  7%   |  6% |  5%    |  5%  |   5%      |

At 22 minutes default that's ~10–11 minutes of core for everyone, scaling
from 2.6 min of follow-up (intern) up to 6.2 min (principal). The LLM is
told how many seconds remain in the stage and overall, so it can pace
itself; the engine also forces a stage advance when the slice is
exhausted (with a soft floor of 1 turn so we never skip a stage).

The legacy `get_turn_budget()` helper is still derived from the time
allocation — useful for pre-flight UI hints, but no longer authoritative.

Each stage has:
- a **time budget** (in seconds) computed from the seniority allocation.
- a **role-specific stage prompt** pulled from the `RoleProfile`. The core
  prompt has a `{{depth}}` token that's filled with the seniority depth
  instruction at request time.
- **topic-diversity enforcement**: `InterviewSession.asked_topics` grows as
  the LLM tags each question, and the system prompt carries the
  already-covered list plus the role profile's `topic_categories` so the
  LLM rotates through fresh areas.
- **drill-target tracking**: weaknesses surfaced in prior turns are
  collected in `InterviewSession.drill_targets` and re-injected into the
  next system prompt as "outstanding probes". The LLM can then actually
  cross-question those points instead of forgetting them.

The LLM itself can also vote to advance the stage early via the
`meta.suggest_advance` field in its structured JSON response.

---

## Pre-interview brief (preflight)

File: `backend/interview/preflight.py`. Entry: `build_interview_brief(...)`.

Runs **once when a session is created**, after the resume has been parsed
and the JD has been loaded but before the first turn. One Groq call to a
senior-hiring-manager prompt reads the resume *against* the JD and
returns a structured brief:

```json
{
  "claim_verifications": ["candidate claims '3 years of Kubernetes at scale' — verify with a real incident story"],
  "jd_gaps":            ["JD requires gRPC; resume mentions only REST"],
  "strong_topics":      ["distributed transactions", "Postgres tuning"],
  "weak_topics":        ["mobile, frontend"],
  "suggested_opening":  "I see you led the payments migration at X — walk me through the trickiest call you had to make there."
}
```

The brief is injected into the interviewer's system prompt as the first
thing she sees. This is what turns the LLM from "an interviewer with the
candidate's skills as a string" into "an interviewer who has already
read the resume against the JD before walking into the room" — she
knows what to probe, what claims to verify, what JD requirements aren't
backed by the resume, and a good opening question.

The brief is cached on the session in memory; it does not re-run on
every turn.

---

## LLM pipeline

**Entry:** `backend/llm/structured.py::ask_llm_structured(...)`

**Prompt construction:**
1. `STRUCTURED_SYSTEM_PROMPT` — fixed JSON schema the LLM must obey.
2. `SCORING_RUBRIC` + `AI_DETECTION_PROMPT` — appended to the system
   prompt, calibrates 0–10 scoring and AI-answer likelihood.
3. **Role-profile block**: `display_name (seniority)`, `interviewer_persona`,
   the role's `topic_categories`. This is what makes a consulting interview
   sound different from an embedded-firmware interview.
4. Stage label, resume context, job context (which now includes the depth
   instruction and rubric weights for the role).
5. Asked-topics block that lists already-covered areas and forces
   rotation through the *role-specific* topic list.
6. Last 8 turns from history.
7. Current user utterance.

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
  and Deepgram inference (~300–800 ms). The httpx client uses 30s connect /
  60s read+write so 20–40 second answers don't get cut off on slow networks
  (e.g. WSL2). Up to 3 retries with exponential backoff on
  `WriteTimeout` / `ReadTimeout` / `ConnectTimeout` / Deepgram 408s.
  Exhausted retries raise `STTTimeout`, which `/audio-turn` surfaces as
  HTTP 503 `{error: "stt_timeout"}` so the frontend can replay the
  still-cached blob instead of dropping the answer; non-timeout failures
  surface as HTTP 502 `{error: "stt_failed"}`.
- **Streaming mode** (`stt/deepgram_streaming.py`): opens a WebSocket to
  Deepgram, streams raw Opus bytes, emits partial + final transcripts.
  Used by `/ws/interview/{id}`; partial transcripts fire
  `ws.send_json({type: "transcript", final: false})` for live caption UI.

The `/audio-turn` response now also carries the candidate's transcribed
`transcript` field, so the UI renders their actual words instead of a
"[voice input]" placeholder.

### TTS — Edge by default, ElevenLabs opt-in, browser fallback

The server-side TTS path is now **on by default** (`USE_SERVER_TTS=1`)
because the default provider — Microsoft Edge TTS — is free, key-less,
and produces a natural neural voice.

**Edge TTS (default, `TTS_PROVIDER=edge`):**
- `backend/tts/edge_tts_provider.py` calls the public Edge Online TTS
  service via the `edge-tts` Python package. No API key.
- Default voice: `en-US-AriaNeural`. Override with `EDGE_TTS_VOICE`
  (e.g. `en-IN-NeerjaNeural`, `en-GB-SoniaNeural`,
  `en-US-JennyNeural`).
- Writes MP3 to `tests/audio/sessions/<sid>/turn_<n>.mp3`, returns
  `audio_url: "/api/audio/<sid>/turn_<n>.mp3"`.

**ElevenLabs (opt-in, `TTS_PROVIDER=elevenlabs`):**
- Requires `ELEVENLABS_API_KEY`. Calls `elevenlabs.convert(...)`,
  streams chunks to the same path/format as Edge.
- Use this if you need the highest-quality voice and are willing to pay.

**Browser-only (`USE_SERVER_TTS=0`):**
- Backend returns `{ audio_url: null }`.
- Frontend uses `window.speechSynthesis.speak(...)` with a synced typing
  animation. Zero added latency, zero API cost — but voice quality
  depends entirely on the user's OS/browser.

---

## 3D avatar interviewer

File: `frontend/avatar.js`. Mesh: `frontend/avatar.glb` (~4.7 MB,
Ready-Player-Me-style, served from `/static/avatar.glb` so no external DNS
is needed).

three.js 0.160 is loaded via an importmap from a CDN; everything else is
local. `init(container)` builds a scene + perspective camera + GLTFLoader,
and starts a `requestAnimationFrame` loop. The container is the
`#avatar-canvas` tile that lives next to the candidate's webcam feed in
the interview UI; on load failure we fall back to a CSS Siri-orb so the
session keeps working.

**Lip sync.** The audio pipeline already feeds an amplitude signal into
`window.avatar.setAmp(0..1)` — both the Web Speech API path and the
ElevenLabs `<audio>` path tap the same WebAudio analyser. `avatar.js`
smooths it (`currentAmp` chases `targetAmp`) and drives morph targets
named like `viseme_*` or `mouthOpen` if the GLB exposes them.

**Idle behaviour.** Natural blinks at randomised intervals, slight gaze
shifts, and a low-amplitude breathing oscillation on the head bone keep
the avatar from looking dead between turns.

**Teardown.** `teardown()` cancels the RAF, disposes geometries,
materials, and textures, and removes the renderer from the DOM, so
ending and restarting an interview doesn't leak GPU memory.

---

## Always-on microphone + click-to-finish

File: `frontend/app.js` (the `vad` object + `startVAD` / `scheduleAutoListen` /
`startRecordingTurn` / `stopAndSubmitTurn`)

Design: the mic stream is requested once at session start and stays open.
Recording is driven by **explicit turn boundaries**, not silence detection —
silence-based VAD too aggressively cut off candidates mid-thought.

| constant             | value   | meaning                                            |
|----------------------|---------|----------------------------------------------------|
| `AUTO_LISTEN_DELAY_MS` | `800` | gap between interviewer finishing and mic arming   |
| `MIN_UTTERANCE_MS`   | `500`   | discard accidental taps shorter than this          |

Flow:

```
interviewer TTS finishes
  │
  │ wait AUTO_LISTEN_DELAY_MS (800 ms)
  ▼
RECORDING  ─  "Listening — click mic when finished"
  │ (candidate speaks for as long as they need — no silence cutoff)
  │
  │ candidate clicks mic button (or presses Space)
  ▼
[duration < 500 ms or blob < 3 KB] ─▶ discard, show "I didn't hear anything", re-arm
[otherwise]                        ─▶ POST /audio-turn
                                       ├─ 400 "no speech detected" ─▶ show hint, re-arm
                                       └─ 200 ─▶ render reply, TTS, re-arm after
```

**Why recording is blocked during TTS.** When the interviewer's voice
plays out of the speakers the mic would pick it up. Before we render an
assistant message we set `vad.interviewerSpeaking = true`;
`onSpeechFinished()` (fired by the Web Speech API's `onend`, the
`<audio>` `onended` event, or a safety timeout that defeats Chrome's
silent-fail TTS bug) clears it and triggers the auto-arm.

**Mic button behavior:**

| State                          | Click action              |
|--------------------------------|---------------------------|
| Recording (red, pulsing)       | Stop recording + submit   |
| Waiting (interviewer speaking) | Mute toggle               |
| Idle (between turns)           | Mute toggle / unmute+arm  |

Spacebar is bound to the same handler, so the candidate can finish their
answer hands-free.

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

## End-of-interview report

File: `backend/interview/report.py`. Entry: `synthesize_report(session)`.

When the candidate or the recruiter hits `GET /api/session/:id/report`,
one Groq pass synthesizes a recruiter-ready report from everything the
session collected:

- **Hire recommendation** — `strong_hire | hire | lean_hire | lean_no | no_hire`
- **Top strengths and weaknesses** across the whole interview, each with
  a direct quote from a real turn
- **Per-dimension averages** (correctness, depth, communication,
  relevance) and a comparison to the seniority bar
- **Topic coverage map** — which `topic_categories` were actually touched
- **AI-detection summary** with the worst-offending turns
- **One-paragraph human-readable summary**

The synthesized report is cached on the `InterviewSession` and persisted
to `interview_sessions.report_json` so subsequent loads are instant. A
session can only produce a report once it's finished or has at least one
scored turn.

---

## Multi-tenant company workspaces

The legacy company auth (`POST /api/company`, `POST /api/company/login`)
still works. On top of it, every company now has a URL-safe **slug**
(unique, indexed) and a parallel set of `/api/c/:slug/...` routes — so
the Next.js dashboard uses stable, shareable paths like
`/c/acme/jobs/123` instead of opaque UUIDs.

### Onboarding flow

```
prospect submits contact form ─▶ POST /api/leads
        │     leads(kind, company_name, contact_name, email, role_count, use_case, source)
        │     status='new'; SMTP notifies sales (send_lead_notification)
        ▼
operator runs CLI: python -m backend.scripts.provision_company --lead-id <id>
        │     ├─ create companies row + unique slug
        │     ├─ generate setup_token (random 32 hex, 7-day expiry)
        │     ├─ email owner the setup link (send_owner_setup_email)
        │     └─ leads.status='onboarded', leads.converted_company_id=<id>
        ▼
owner clicks link ─▶ GET  /api/c/:slug/onboard/:token   (validate)
                  ─▶ POST /api/c/:slug/onboard          (set password)
        │     consumes the setup_token, returns a bearer auth_token
        ▼
owner lands on /c/:slug dashboard in the Next.js app
```

The CLI is in `backend/scripts/provision_company.py` and supports both
modes:

```bash
# Convert an inbound lead:
python -m backend.scripts.provision_company --lead-id <lead_id>

# Or create a workspace from scratch:
python -m backend.scripts.provision_company \
    --name "Acme Tech" --email owner@acme.com [--contact-name "Priya"]
```

### Auditing

Significant tenant actions (lead in, company provisioned, invite sent,
session started/finished) are logged via `audit()` /
`log_event()` into the `interview_events` table for later analytics.

---

## Next.js web frontend

The `web/` directory is a standalone Next.js 15 app (TypeScript, App
Router, Tailwind, shadcn/ui, React Query, Monaco editor) that ships:

- **Marketing landing page** — what the product does, demo CTA
- **Contact form** — wired to `POST /api/leads`
- **Owner onboarding page** — consumes a setup_token via
  `/api/c/:slug/onboard`
- **Company dashboard** at `/c/:slug` — jobs, applications, candidate
  files, shareable application links, usage panel
- **Candidate signup/login** for the multi-application flow

It is **statically exported** (`next build` → `web/out/`) and served by
FastAPI in production, which is why two small middlewares live in
`backend/api.py`:

- `static_cache_headers` — `_next/static/*` is `immutable`,
  `Cache-Control: max-age=31536000`; HTML pages are `no-cache` so the
  shell never gets stuck pointing at a stale chunk hash after a
  rebuild.
- `rsc_payload_redirect` — Next's static export emits `index.txt` RSC
  payloads next to every `index.html`. If a *browser* (vs. the Next
  router's `fetch`) lands on one directly, redirect to the parent
  directory so the user doesn't see raw JSON.

For local dev, run `npm run dev` in `web/` for HMR; for production
parity run `npm run build` and let FastAPI serve `web/out/`.

---

## Rate limiting

`backend/api.py` ships a small in-process sliding-window limiter
(`rate_limit(request, bucket, max_calls, window_s)`) keyed by
`(bucket, client_ip)`. It honors `X-Forwarded-For` so it works behind
nginx. It's good enough for a single-worker uvicorn deployment and is
applied on public-facing endpoints (resume upload, apply, contact form)
to prevent abuse.

For a multi-worker or multi-host deploy, swap the per-process dict for
a Redis-backed counter — the function signature stays the same. We
deliberately keep the in-process version to avoid adding Redis as a
dependency at this stage.

---

## Database schema

All tables live in `data/portal.db` (WAL journal, foreign keys ON).

```
candidates(id, name, email, password_hash, auth_token, created_at)
resumes(id, candidate_id, filename, raw_text, skills_json, uploaded_at)
companies(id, name, email, password_hash, auth_token, created_at,
          slug UNIQUE, status, plan,
          setup_token, setup_token_expires_at)
jobs(id, company_id, title, description, required_skills,
     role_family, seniority, min_experience_years, max_experience_years,
     department, employment_type, status, created_at)
applications(id, job_id, candidate_id, resume_id, session_id, status,
             invite_token UNIQUE, created_at)
interview_sessions(id, candidate_id, resume_id, job_id, stage, status,
                    cheating_flags, total_score, created_at, finished_at,
                    report_json)
eval_records(id PK autoinc, session_id, turn_number, stage, score,
              correctness, depth, communication, relevance, topic,
              strengths, weaknesses, notes, ai_likelihood, created_at)
email_log(id, to_addr, subject, body, status, sent_at)
leads(id, kind, company_name, contact_name, email, phone, role_count,
      use_case, source, status, notes, created_at, converted_company_id)
interview_events(id PK autoinc, company_id, job_id, application_id,
                  session_id, event, metadata, created_at)
```

Password hashing uses a random 16-byte salt with SHA-256 → stored as
`salt$hash`. Auth tokens rotate on every login.

`init_db()` runs lightweight online migrations: missing columns on
`jobs`, `companies`, and `interview_sessions` are added via `ALTER TABLE`
on boot, and any company without a `slug` gets one back-filled from its
name. Then it seeds `DemoCorp` plus one mock JD per role family from
`MOCK_JDS`, skipping any title that already exists.

---

## HTTP / WebSocket API

### Public

| Method | Path                                   | Purpose                                      |
|--------|----------------------------------------|----------------------------------------------|
| GET    | `/`                                    | serve Next.js landing (or legacy frontend)   |
| GET    | `/candidate`, `/candidate/*`           | serve legacy candidate interview UI          |
| GET    | `/static/*`                            | serve frontend assets                        |
| GET    | `/api/health`                          | liveness probe                               |
| GET    | `/api/roles`                           | list role families + seniority tiers         |
| POST   | `/api/resume/upload`                   | upload + parse resume, returns full breakdown|
| GET    | `/api/jobs`                            | list active jobs                             |
| GET    | `/api/jobs/:id`                        | job detail                                   |
| POST   | `/api/jobs/:id/apply`                  | apply to job (multipart resume)              |
| GET    | `/api/invite/:token`                   | validate invite token                        |
| POST   | `/api/session`                         | create interview session (runs preflight)    |
| GET    | `/api/session/:id`                     | session status                               |
| GET    | `/api/session/:id/report`              | synthesized end-of-interview report (cached) |
| POST   | `/api/session/:id/turn`                | text turn                                    |
| POST   | `/api/session/:id/audio-turn`          | voice turn (multipart WebM/Opus)             |
| POST   | `/api/session/:id/cheating-report`     | append violations (list of arbitrary dicts)  |
| GET    | `/api/session/:id/evaluations`         | per-turn scores + cheating flags             |
| GET    | `/api/audio/:id/:file`                 | serve Edge / ElevenLabs MP3                  |
| POST   | `/api/leads`                           | submit contact-form lead                     |
| WS     | `/ws/interview/:id`                    | streaming STT + structured reply             |

### Candidate (Bearer auth)

| Method | Path                                   | Purpose                                      |
|--------|----------------------------------------|----------------------------------------------|
| POST   | `/api/candidate/signup`                | email + password signup                      |
| POST   | `/api/candidate/login`                 | login → bearer token                         |
| GET    | `/api/candidate/me`                    | profile                                      |
| GET    | `/api/candidate/me/applications`       | this candidate's applications + statuses     |

### Company — legacy id-keyed routes (Bearer auth)

| Method | Path                                         |
|--------|----------------------------------------------|
| POST   | `/api/company`  (register, returns token)    |
| POST   | `/api/company/login`                         |
| POST   | `/api/company/:id/jobs`                      |
| GET    | `/api/company/:id/jobs`                      |
| GET    | `/api/company/:id/applications`              |
| POST   | `/api/invite/send`                           |

### Company — tenant-aware `/c/:slug` routes (Bearer auth)

These mirror the legacy id-keyed routes but key off the URL-safe company
slug, so the Next.js dashboard can use stable paths like `/c/acme/jobs`.

| Method | Path                                            | Purpose                                  |
|--------|-------------------------------------------------|------------------------------------------|
| POST   | `/api/auth/company/login`                       | login by email → returns slug + token    |
| GET    | `/api/c/:slug/me`                               | company profile                          |
| GET    | `/api/c/:slug/dashboard`                        | counters: jobs, applicants, recent activity |
| GET    | `/api/c/:slug/jobs`                             | list jobs                                |
| POST   | `/api/c/:slug/jobs`                             | create job                               |
| GET    | `/api/c/:slug/jobs/:job_id`                     | job detail + applications                |
| GET    | `/api/c/:slug/applications`                     | tenant-wide applications view            |
| GET    | `/api/c/:slug/candidates/:application_id`       | candidate file (resume, sessions, scores)|
| POST   | `/api/c/:slug/jobs/:job_id/links`               | create shareable application link        |
| GET    | `/api/c/:slug/jobs/:job_id/links`               | list shareable links                     |
| DELETE | `/api/c/:slug/links/:token`                     | revoke shareable link                    |
| GET    | `/api/c/:slug/usage`                            | usage / plan limits                      |
| GET    | `/api/c/:slug/onboard/:token`                   | validate setup_token (public)            |
| POST   | `/api/c/:slug/onboard`                          | complete owner onboarding (set password) |

`POST /api/company/:id/jobs` body:

```json
{
  "title": "Senior Software Engineer — Platform",
  "description": "...",
  "required_skills": "Go, Kubernetes, gRPC, ...",
  "role_family": "software_engineering",
  "seniority": "senior",
  "min_experience_years": 5,
  "max_experience_years": 9,
  "department": "Engineering",
  "employment_type": "full_time"
}
```

`role_family` must be one of the 22 keys in `ALL_PROFILES` and `seniority`
one of `intern|entry|mid|senior|lead|principal`; unknown values return
400. The full taxonomy is exposed read-only at runtime via
`backend.interview.role_profiles.list_role_families()`.

---

## Performance notes

End-to-end turn latency, voice path, measured on a typical WSL2 dev box:

| Hop                          | Latency    | Notes                                    |
|------------------------------|------------|------------------------------------------|
| Candidate clicks mic to stop | instant    | explicit turn boundary, no silence wait  |
| Blob upload to `/audio-turn` | 50–200 ms  | depends on Opus blob size                |
| Deepgram STT                 | 300–800 ms | `nova-2` file mode                       |
| Groq LLM (70b)               | 500–1800 ms| halved on stages running the 8b fast model |
| Server TTS (if enabled)      | 500–1500 ms| ElevenLabs turbo_v2_5                    |
| Browser TTS (default)        | ~0 ms      | Web Speech API, starts immediately       |
| Auto-arm after interviewer   | +800 ms    | `AUTO_LISTEN_DELAY_MS`                   |

Total with `USE_SERVER_TTS=0`: ~0.9–2.8 s from the moment the candidate
clicks to stop to the moment the interviewer starts replying.

Knobs to turn if a turn still feels slow:
- Move more stages onto `GROQ_FAST_MODEL` in `structured.py`.
- Keep `USE_SERVER_TTS=0` unless voice quality is required.
- Reduce the history window (`structured.py` currently keeps the last 8
  messages). Going below 6 starts to cost continuity.
- Shrink `AUTO_LISTEN_DELAY_MS` in `app.js` (default 800 ms) — but too
  low can re-arm before the candidate realizes the interviewer finished.
