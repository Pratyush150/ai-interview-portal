"""Detailed interview report synthesis.

Runs ONE LLM pass over all per-turn evaluations + cheating flags +
session metadata to produce a recruiter-ready report:

  - hire recommendation (strong_hire / hire / lean_hire / lean_no / no_hire)
  - top strengths and weaknesses across the whole interview, with quotes
  - per-dimension averages and a vs-seniority-bar comparison
  - topic coverage map
  - AI-detection summary
  - one-paragraph human-readable summary

Cached on the session object (and persisted to interview_sessions.report_json
on demand) so /api/session/:id/report is fast on the second call.
"""
from __future__ import annotations

import json
import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()


REPORT_PROMPT = """\
You are a senior hiring panel writing a final report for a 22-minute structured interview.
You are given:
  - the role and seniority,
  - the candidate's per-turn evaluations (4 dimensions, strengths, weaknesses, AI likelihood, an excerpt),
  - the topics that were covered,
  - the cheating-flag count,
  - the pre-interview brief that was used to steer the questions.

Output STRICT JSON, no markdown, no commentary. Schema:

{
  "recommendation": "strong_hire | hire | lean_hire | lean_no | no_hire",
  "recommendation_reason": "1-2 sentences justifying the call against the seniority bar",
  "summary_paragraph": "3-5 sentence narrative for the recruiter — what stood out, what didn't, what to verify in the next round",
  "top_strengths": [
    {"point": "specific strength", "evidence": "quote or paraphrase from a turn"}
  ],
  "top_weaknesses": [
    {"point": "specific weakness", "evidence": "quote or paraphrase from a turn"}
  ],
  "topic_coverage": [
    {"topic": "e.g. system design", "depth": "shallow | adequate | strong", "score": 0-10}
  ],
  "dimension_averages": {
    "correctness": 0-10, "depth": 0-10, "communication": 0-10, "relevance": 0-10
  },
  "vs_seniority_bar": "below | at | above",
  "ai_integrity_note": "1 sentence on AI / cheating signals (or 'no concerns')",
  "next_round_focus": ["1-3 specific things the next round should verify"]
}

Rules:
- Be honest, NOT inflationary. If average score is 5.5, do NOT recommend strong_hire.
- Recommendation guidance:
   strong_hire: avg >= 8.0 AND no AI/cheating concerns AND consistent depth
   hire:       avg 7.0-7.9 AND clear strengths
   lean_hire:  avg 6.0-6.9 OR mixed signal but reachable bar
   lean_no:    avg 5.0-5.9 OR depth gap vs seniority
   no_hire:    avg < 5.0 OR multiple AI/integrity flags OR critical knowledge gap
- top_strengths / top_weaknesses: at most 4 each, ordered by importance.
- Use the candidate_excerpt fields as the source for evidence quotes.
- If there are < 3 evaluated turns, say so in summary_paragraph and lower confidence accordingly.
"""


def synthesize_report(session) -> dict:
    """Synthesize a detailed report for an InterviewSession. Returns a dict
    matching the schema above. Falls back to a minimal stub on LLM failure
    so the endpoint never errors."""
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

    # Build the input payload.
    evals = []
    for e in session.evaluations[:60]:  # cap at 60 to control prompt size
        evals.append({
            "turn": e.get("turn"),
            "stage": e.get("stage"),
            "score": e.get("score"),
            "correctness": e.get("correctness"),
            "depth": e.get("depth"),
            "communication": e.get("communication"),
            "relevance": e.get("relevance"),
            "topic": e.get("topic"),
            "strengths": (e.get("strengths") or [])[:3],
            "weaknesses": (e.get("weaknesses") or [])[:3],
            "ai_likelihood": e.get("ai_likelihood"),
            "candidate_excerpt": (e.get("candidate_excerpt") or "")[:240],
        })

    payload = {
        "role_family": session.role_family,
        "seniority": session.seniority,
        "interviewer": session.interviewer_name,
        "target_duration_min": session.target_duration_min,
        "elapsed_min": round(session.elapsed_min(), 1),
        "topics_covered": session.asked_topics,
        "cheating_flags_count": len(session.cheating_flags),
        "interview_brief": session.interview_brief or {},
        "evaluations": evals,
    }

    fallback = _stub_report(session)

    if not api_key or api_key.startswith("PASTE"):
        return fallback

    try:
        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": REPORT_PROMPT},
                {"role": "user", "content": json.dumps(payload, indent=2)},
            ],
            temperature=0.2,
            max_tokens=1400,
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content.strip()
        data = json.loads(raw)
        return _sanitize_report(data, fallback)
    except Exception:
        return fallback


# ---------------------------------------------------------------------------

_VALID_REC = {"strong_hire", "hire", "lean_hire", "lean_no", "no_hire"}
_VALID_DEPTH = {"shallow", "adequate", "strong"}
_VALID_BAR = {"below", "at", "above"}


def _sanitize_report(data: dict, fallback: dict) -> dict:
    """Best-effort schema cleanup so the frontend can render without
    defensive checks at every level."""
    rec = str(data.get("recommendation", "")).lower().strip()
    if rec not in _VALID_REC:
        rec = fallback["recommendation"]

    bar = str(data.get("vs_seniority_bar", "")).lower().strip()
    if bar not in _VALID_BAR:
        bar = fallback["vs_seniority_bar"]

    def _ev_list(items, max_n=4):
        out = []
        for it in (items or [])[:max_n]:
            if isinstance(it, dict):
                out.append({
                    "point": str(it.get("point", ""))[:240],
                    "evidence": str(it.get("evidence", ""))[:300],
                })
            elif isinstance(it, str):
                out.append({"point": it[:240], "evidence": ""})
        return out

    coverage = []
    for c in (data.get("topic_coverage") or [])[:14]:
        if not isinstance(c, dict):
            continue
        depth = str(c.get("depth", "")).lower()
        if depth not in _VALID_DEPTH:
            depth = "adequate"
        try:
            score = float(c.get("score", 0))
        except (TypeError, ValueError):
            score = 0.0
        coverage.append({
            "topic": str(c.get("topic", ""))[:80],
            "depth": depth,
            "score": round(score, 1),
        })

    dims_raw = data.get("dimension_averages") or {}
    def _f(v, default):
        try:
            return round(float(v), 1)
        except (TypeError, ValueError):
            return default
    dims = {
        "correctness":   _f(dims_raw.get("correctness"),   fallback["dimension_averages"]["correctness"]),
        "depth":         _f(dims_raw.get("depth"),         fallback["dimension_averages"]["depth"]),
        "communication": _f(dims_raw.get("communication"), fallback["dimension_averages"]["communication"]),
        "relevance":     _f(dims_raw.get("relevance"),     fallback["dimension_averages"]["relevance"]),
    }

    return {
        "recommendation": rec,
        "recommendation_reason": str(data.get("recommendation_reason", ""))[:400],
        "summary_paragraph": str(data.get("summary_paragraph", ""))[:1200],
        "top_strengths": _ev_list(data.get("top_strengths"), 4),
        "top_weaknesses": _ev_list(data.get("top_weaknesses"), 4),
        "topic_coverage": coverage,
        "dimension_averages": dims,
        "vs_seniority_bar": bar,
        "ai_integrity_note": str(data.get("ai_integrity_note", "")) [:300],
        "next_round_focus": [str(x)[:200] for x in (data.get("next_round_focus") or [])][:3],
    }


def _stub_report(session) -> dict:
    """Deterministic best-effort report when the LLM call is unavailable.
    Pulls dimension averages from in-memory evaluations."""
    def avg(key):
        vals = [e.get(key) for e in session.evaluations if e.get(key) is not None]
        return round(sum(vals) / len(vals), 1) if vals else 0.0

    score_avg = avg("score")
    if score_avg >= 8.0:    rec = "strong_hire"
    elif score_avg >= 7.0:  rec = "hire"
    elif score_avg >= 6.0:  rec = "lean_hire"
    elif score_avg >= 5.0:  rec = "lean_no"
    else:                   rec = "no_hire"

    bar = "at"
    if score_avg >= 8.0: bar = "above"
    elif score_avg < 5.5: bar = "below"

    return {
        "recommendation": rec,
        "recommendation_reason": (
            f"Average overall score {score_avg}/10 across {len(session.evaluations)} evaluated turns."
        ),
        "summary_paragraph": (
            "Auto-generated summary (LLM synthesis unavailable). Average score "
            f"{score_avg}/10 over {len(session.evaluations)} evaluated turns. "
            "Review the per-turn breakdown for detail."
        ),
        "top_strengths": [],
        "top_weaknesses": [],
        "topic_coverage": [
            {"topic": t, "depth": "adequate", "score": score_avg}
            for t in (session.asked_topics or [])[:8]
        ],
        "dimension_averages": {
            "correctness":   avg("correctness"),
            "depth":         avg("depth"),
            "communication": avg("communication"),
            "relevance":     avg("relevance"),
        },
        "vs_seniority_bar": bar,
        "ai_integrity_note": (
            f"{len(session.cheating_flags)} integrity flag(s) recorded."
            if session.cheating_flags else "No cheating flags recorded."
        ),
        "next_round_focus": [],
    }
