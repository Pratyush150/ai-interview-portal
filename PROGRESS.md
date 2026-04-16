# AI Interview Portal — Progress Tracker

| Phase | Goal | Status | Tag |
|---|---|---|---|
| 0 | Env + smoke tests | ✅ done | `v0.0-smoke` |
| 1 | Skeleton + .env + .gitignore + README | ✅ done | `v0.1-init` |
| 2 | Deepgram STT module | ✅ done | `v0.2-stt` |
| 3 | ElevenLabs TTS module | ✅ done | `v0.3-tts` |
| 4 | Groq LLM client | ✅ done | `v0.4-llm` |
| 5 | Audio pipeline echo-bot | ✅ done | `v0.5-pipeline` |
| 6 | Interview engine with stages + memory | ✅ done | `v0.6-engine` |
| 7 | Structured JSON LLM output | ✅ done | `v0.7-structured` |
| 8 | Deepgram streaming upgrade | ⚪ not started | `v0.8-streaming` |
| 9 | FastAPI wrap + browser mic | ⚪ not started | `v0.9-api` |
| 10 | Frontend | ⚪ not started | `v1.0-ui` |

## Decisions log
- **LLM:** Groq cloud API (`llama-3.3-70b-versatile`) — local Ollama blocked by 3.7GB RAM / no GPU. Module is provider-agnostic; swap to Ollama later on better hardware.
- **Mic:** deferred to Phase 9 (browser `getUserMedia`). Phases 2–7 use pre-recorded `.wav` files in `tests/audio/`.
- **Voice:** ElevenLabs "Rachel" (`21m00Tcm4TlvDq8ikWAM`).
- **Domain:** Software engineering + AI/ML/Robotics technical interviews, English.
