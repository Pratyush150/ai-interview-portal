# ApertureAI — Strategy-to-Engineering Roadmap

Derived from the AI-interview market brief (late 2025 → mid-2026). The
guiding constraint: **ship the strategy without changing the architecture.**
The stack is FastAPI + SQLite (additive `_ensure_column` migrations) + Groq
LLM scoring + a static-exported Next.js frontend served by FastAPI, with a
turn-based REST/WebSocket interview loop and a frontend-driven anti-cheat
flag pipeline (`/api/session/:id/cheating-report` → `interview_sessions.cheating_flags`).

Everything below is sequenced so that each item is **additive** (new columns,
new tables, new endpoints, prompt extensions, or new gates that reuse the
existing invite-token → aptitude → voice → coding chain). Two items that
genuinely require *new* architecture are called out and deferred.

---

## Positioning (the one-line strategy)

> The defensible niche is **the compliant, fraud-resistant, post-LeetCode
> technical-evaluation portal for the mid-market** — where the existing
> three-round flow (aptitude gate → voice → AI-aware coding round) plus
> anti-cheat already lines up against the problems the market just discovered
> it has.

---

## Workstreams, sequenced

### Gap 1 — Compliance-native interviewing  ✅ feasible, additive  ·  **IN PROGRESS**

> Status: items **1 (AEDT notice + consent)** and **2 (alternative-assessment
> request)** are implemented, tested (23/23), and committed. Items 3–5 pending.
The highest ROI/effort move; a procurement/legal selling point at low cost.

1. ✅ **AEDT candidate notice + consent capture** (NYC Local Law 144 / EU AI Act) — DONE
   - `consents` table (application_id, notice_version, acknowledged, ip, ua, ts)
   - `jobs.aedt_notice_required` flag (default 0 → additive safety, opt-in)
   - `GET/POST /api/consent/:token`; notice surfaced in `/api/invite/:token`
     response (mirrors the existing `aptitude_url` pattern)
   - Versioned notice text in `backend/compliance.py`
   - Candidate-facing `/consent` page in `web/`
   - Consent events written to the existing `audit_log` / `interview_events`
2. ✅ **Alternative-assessment request flow** — DONE
   - `jobs.alt_assessment_enabled` flag + `applications.alt_assessment_status`
   - Surfaced on the consent/notice screen; recruiter sees requests in `/reports`
3. **Bias-audit aggregates** (four-fifths / selection-rate)
   - `GET /api/c/:slug/bias-audit` over `applications` + `interview_sessions.total_score`
   - Optional, opt-in `applications.demographics_json` (self-reported only)
   - Honest scaffold: advance-rate + score quartiles now; protected-class
     four-fifths analysis activates only when demographics are collected
4. **Audit-ready logs** — reuse existing `audit_log` + `interview_events` (no new infra)
5. **Compliance summary in the report** — extend the single `report_json`
   synthesis pass (prompt + schema field)

### Gap 2 — Post-LeetCode, AI-aware coding assessment  ✅ DONE (sandbox deferred)
Builds directly on `coding_problems` (+`boilerplate`) and the scored
`coding_submissions` already in the report.

1. `coding_problems.ai_policy` column (`forbidden | allowed | required`)
2. Capture the *process*: candidate prompts/iterations + time-to-solution
   folded into the existing `coding_submissions` JSON (no migration — it is
   already a JSON blob in `report_json`)
3. New eval rubric dimension — "verification, debugging, prompt quality" — in
   the coding-eval prompt in `backend/interview/engine.py`
4. ⚠️ **Caveat / deferred:** true hidden-test-case *execution* needs a sandbox
   runner (Judge0 / Piston / container). That is a NEW service — the one place
   here beyond "additive." AI-aware *evaluation* without execution ships now.

### Gap 3 — Identity / deepfake verification  ✅ gate DONE (real-time video deferred)
1. ✅ **Front-of-funnel ID + selfie liveness** via 3rd-party API (Stripe
   Identity / Persona / Onfido). New `identity_verifications` table + a gate
   before aptitude — the exact pattern the aptitude gate already uses.
2. ✅ **Client-side liveness challenges** (random head-turn / blink) reported
   through the existing `/cheating-report` → `cheating_flags` rail.
3. ❌ **Real-time server-side deepfake detection** — the server only receives
   audio over WS + turn text; it never sees video frames. Needs a NEW media
   pipeline. **Deferred.**

### Gap 4 — ATS integration ("embed, don't replace")  ✅ Phase 1 DONE (sync deferred)
1. ✅ **Phase 1 — outbound export/webhook:** push finished reports/scores via
   webhook + CSV/email export. New `ats_connections` table; reuse
   `email_service.py` + `interview_events`. Additive.
2. ⚠️ **Phase 2 — bidirectional sync** (Greenhouse / Ashby / Lever): OAuth +
   per-vendor adapters + inbound webhooks + a sync worker. Still additive (new
   module, no rewrite) but genuinely new infrastructure + per-ATS maintenance +
   a background-job mechanism not currently run. Scope last.

---

## Feasibility summary

| Workstream | Architecture change? | Effort | Priority |
|---|---|---|---|
| Compliance-native (notice, consent, alt-assessment, bias-audit scaffold) | No — additive | Low | **1** |
| AI-aware coding rubric (allow-AI, capture process) | No — additive | Low–Med | 2 |
| ID-verification gate (3rd-party, front-of-funnel) | No — additive | Low–Med | 3 |
| Coding execution sandbox (hidden test cases) | **Yes — new service** | Med–High | optional |
| ATS export/webhook (outbound) | No — additive | Med | 4 |
| ATS bidirectional sync | Additive but new infra | High | later |
| Real-time deepfake/video detection | **Yes — new media pipeline** | High | deferred |

~70% of the strategy ships with **zero architectural change**. Only the
execution sandbox and server-side video analysis require new components; both
are safely deferrable.

---

## Conventions for every change here
- Migrations are **additive only** via `_ensure_column`; new flags default OFF
  so existing seeded jobs and old invite links never change behaviour unless
  explicitly opted in (the same safety rule the aptitude gate followed).
- New gates reuse the invite-token resolution + the `aptitude_url`-style
  response hint so the frontend phase machine stays the single source of truth.
- Nothing reads or writes the live DB during development; tests run against a
  throwaway copy.
