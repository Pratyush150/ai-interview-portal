"""Structured JSON output from the LLM with rubric-based scoring + AI detection.

Beyond strict JSON, the system prompt now carries:
  - the interviewer's name (passed in by the engine — currently 'Sara'),
  - drill targets accumulated from past turns' weaknesses,
  - per-turn time budget so the LLM can pace itself,
  - the pre-interview brief (gaps to probe, unverified claims, depth-test topics).

History window has been lifted to 24 messages (~12 turns) so that
follow-up / cross-question prompts at turn 15+ can still see what the
candidate said in background.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from dotenv import load_dotenv
from groq import Groq

from backend.scoring_rubric import SCORING_RUBRIC, AI_DETECTION_PROMPT

load_dotenv()

STRUCTURED_SYSTEM_PROMPT = f"""\
You are a professional technical interviewer. You MUST respond with valid JSON only.
No markdown, no explanation outside the JSON.

Response schema:
{{
  "spoken_text": "What you say to the candidate (1-3 sentences, natural conversational tone). Acknowledge their last point in one short clause, then ask the next question.",
  "evaluation": {{
    "correctness": 0-10 or null if not evaluating,
    "depth": 0-10 or null,
    "communication": 0-10 or null,
    "relevance": 0-10 or null,
    "score": null or the average of the 4 dimensions above (auto-calculate),
    "strengths": ["specific strengths observed in this answer"] or [],
    "weaknesses": ["specific weaknesses to drill into LATER"] or [],
    "notes": "brief internal evaluation note"
  }},
  "meta": {{
    "topic": "topic being discussed",
    "difficulty": "easy|medium|hard",
    "suggest_advance": true/false
  }},
  "ai_detection": {{
    "ai_likelihood": 0.0 to 1.0,
    "human_indicators": ["specific human-like aspects noticed"],
    "ai_indicators": ["specific AI-like aspects noticed"]
  }}
}}

{SCORING_RUBRIC}

{AI_DETECTION_PROMPT}

Rules:
- "spoken_text" is what the candidate hears. Conversational, 1-3 sentences. Always acknowledge
  their previous point in a short clause before asking the next question.
- DIFFICULTY CURVE: open each topic at BASIC level (definitions, idioms). Once the candidate
  demonstrates competence on a topic, escalate within that SAME topic to intermediate, then
  advanced. Never start a topic at advanced. Never drop back to a basic question on a topic
  you have already cleared.
- NO TOPIC HOPPING: stay with ONE topic until you've reached the candidate's ceiling. If their
  last answer was weak, drill DEEPER on the same concept instead of jumping to an unrelated
  subject. Switching topics every turn destroys signal and feels disjointed.
- VOICE-ONLY: the candidate is SPEAKING. Do NOT ask them to write code aloud. Coding is
  reserved for a dedicated round at the end (separate UI). If a problem needs code, ask them
  to describe the APPROACH or PSEUDOCODE in words.
- For intro/wrap-up stages, set all evaluation scores to null.
- For 'weaknesses', prefer specific, probe-able items ("could not explain why they chose Postgres
  over Cassandra", "vague on retry semantics") so a future turn can return to them.
- "suggest_advance" is true when the current stage should move forward.
- IMPORTANT: Be a FAIR evaluator. Do not inflate scores. Most answers score 5-7.
- Always return valid JSON. No trailing commas. No comments."""


@dataclass
class InterviewResponse:
    spoken_text: str
    score: float | None = None
    correctness: float | None = None
    depth: float | None = None
    communication: float | None = None
    relevance: float | None = None
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    eval_notes: str = ""
    topic: str = ""
    difficulty: str = "medium"
    suggest_advance: bool = False
    ai_likelihood: float = 0.0
    human_indicators: list[str] = field(default_factory=list)
    ai_indicators: list[str] = field(default_factory=list)
    raw_json: dict | None = None

    @classmethod
    def from_json(cls, data: dict) -> InterviewResponse:
        # The LLM is allowed to emit `evaluation: null` on the intro turn
        # (no candidate answer yet to score). `data.get(k, {})` only falls
        # back to the default if the KEY is absent — an explicit JSON null
        # returns None and crashes downstream .get() calls. Coerce here.
        evaluation = data.get("evaluation") or {}
        meta = data.get("meta") or {}
        ai_det = data.get("ai_detection") or {}

        dims = [evaluation.get(d) for d in ("correctness", "depth", "communication", "relevance")]
        valid_dims = [d for d in dims if d is not None]
        calculated_score = round(sum(valid_dims) / len(valid_dims), 1) if valid_dims else evaluation.get("score")

        # Lists can also come back as null when the LLM has nothing to add
        # for an intro turn. Normalize so callers can iterate safely.
        strengths = evaluation.get("strengths") or []
        weaknesses = evaluation.get("weaknesses") or []
        human_indicators = ai_det.get("human_indicators") or []
        ai_indicators = ai_det.get("ai_indicators") or []

        return cls(
            spoken_text=data.get("spoken_text", ""),
            score=calculated_score,
            correctness=evaluation.get("correctness"),
            depth=evaluation.get("depth"),
            communication=evaluation.get("communication"),
            relevance=evaluation.get("relevance"),
            strengths=strengths,
            weaknesses=weaknesses,
            eval_notes=evaluation.get("notes") or "",
            topic=meta.get("topic") or "",
            difficulty=meta.get("difficulty") or "medium",
            suggest_advance=bool(meta.get("suggest_advance", False)),
            ai_likelihood=float(ai_det.get("ai_likelihood") or 0.0),
            human_indicators=human_indicators,
            ai_indicators=ai_indicators,
            raw_json=data,
        )


# History window — number of (user, assistant) message slots to keep in
# context. 24 ≈ 12 turns of back-and-forth, enough that a follow-up at turn
# 15 still sees what the candidate claimed during background.
HISTORY_WINDOW = 24


def ask_llm_structured(
    user_text: str,
    stage: str = "technical",
    history: list[dict] | None = None,
    resume_context: str = "",
    job_context: str = "",
    asked_topics: list[str] | None = None,
    role_profile=None,
    seniority: str | None = None,
    interviewer_name: str = "Sara",
    drill_targets: list[str] | None = None,
    time_remaining_min: float | None = None,
    stage_remaining_min: float | None = None,
    interview_brief: dict | None = None,
) -> InterviewResponse:
    """Send a prompt and parse the structured JSON response."""
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    if not api_key or api_key.startswith("PASTE"):
        raise RuntimeError("GROQ_API_KEY missing in .env")

    system_content = (
        f"{STRUCTURED_SYSTEM_PROMPT}\n\n"
        f"Current interview stage: {stage}.\n"
        f"You are '{interviewer_name}', a senior interviewer. In the FIRST intro turn only, "
        f"introduce yourself by this name. Do not re-introduce yourself afterwards."
    )

    if role_profile is not None:
        system_content += (
            f"\n\nROLE FAMILY: {role_profile.display_name} ({seniority or 'mid'}).\n"
            f"{role_profile.interviewer_persona}\n"
            f"Topic rotation set for this role: {', '.join(role_profile.topic_categories)}."
        )

    if interview_brief:
        brief_lines = []
        for k in ("gaps_to_probe", "claimed_unverified_skills", "depth_test_topics", "jd_requirements_unmet"):
            items = (interview_brief.get(k) or [])[:5]
            if items:
                brief_lines.append(f"- {k.replace('_', ' ')}: {'; '.join(items)}")
        if brief_lines:
            system_content += "\n\nPRE-INTERVIEW BRIEF (drives what to probe):\n" + "\n".join(brief_lines)

    if drill_targets:
        recent = drill_targets[-8:]
        system_content += (
            "\n\nOUTSTANDING DRILL TARGETS (return to these when natural — they are claims "
            f"that haven't been verified or weaknesses found earlier):\n- {chr(10).join('- ' + t for t in recent).lstrip('- ')}"
        )

    if resume_context:
        system_content += f"\n\nCandidate resume context:\n{resume_context}"
        system_content += "\nTailor questions to the candidate's specific experience and skills, but VARY the topics."

    if job_context:
        system_content += f"\n\nJob context:\n{job_context}"
        system_content += "\nFocus core-stage questions on the required skills and role competencies above."

    if asked_topics:
        rotation = (
            ", ".join(role_profile.topic_categories)
            if role_profile is not None
            else "system design, algorithms, databases, APIs, testing, DevOps, security, code quality"
        )
        system_content += (
            f"\n\nCRITICAL — TOPIC DIVERSITY: These topics have already been covered: "
            f"{', '.join(asked_topics)}. "
            f"You MUST ask about a DIFFERENT topic now (unless drilling into a target above). Rotate through: {rotation}."
        )

    if time_remaining_min is not None and stage_remaining_min is not None:
        system_content += (
            f"\n\nPACING: ~{time_remaining_min:.1f} min remaining overall, "
            f"~{stage_remaining_min:.1f} min remaining in the '{stage}' stage. "
            "If under 0.5 min remains in stage, set meta.suggest_advance=true."
        )

    trimmed_history = history[-HISTORY_WINDOW:] if history and len(history) > HISTORY_WINDOW else history

    messages = [{"role": "system", "content": system_content}]
    if trimmed_history:
        messages.extend(trimmed_history)
    messages.append({"role": "user", "content": user_text})

    # Use the faster model only for very lightweight stages. We DELIBERATELY
    # keep `background` on the 70b model because that's where projects are
    # established and follow-up cross-questions later depend on having
    # parsed those project descriptions properly. Intro and wrap-up are
    # truly conversational and OK on the small model.
    use_model = model
    temperature = 0.5
    if stage in ("intro", "wrap_up"):
        use_model = os.getenv("GROQ_FAST_MODEL", "llama-3.1-8b-instant")
        temperature = 0.7

    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=use_model,
        messages=messages,
        temperature=temperature,
        max_tokens=600,
        response_format={"type": "json_object"},
    )

    raw = completion.choices[0].message.content.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return InterviewResponse(spoken_text=raw)

    return InterviewResponse.from_json(data)
