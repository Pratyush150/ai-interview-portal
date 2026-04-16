"""Phase 7 — Structured JSON output from LLM.

Wraps the Groq client to return typed interview responses with
question text, evaluation scores, and stage transition signals.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

STRUCTURED_SYSTEM_PROMPT = """\
You are a professional technical interviewer. You MUST respond with valid JSON only.
No markdown, no explanation outside the JSON.

Response schema:
{
  "spoken_text": "What you say to the candidate (1-3 sentences)",
  "evaluation": {
    "score": 0-10 or null if not evaluating,
    "strengths": ["list of strengths observed"] or [],
    "weaknesses": ["list of weaknesses observed"] or [],
    "notes": "brief internal evaluation note" or ""
  },
  "meta": {
    "topic": "topic being discussed",
    "difficulty": "easy|medium|hard",
    "suggest_advance": true/false
  }
}

Rules:
- "spoken_text" is what the candidate hears (natural, conversational).
- "evaluation" captures your assessment. Set score to null for non-evaluative turns (intro, wrap-up).
- "suggest_advance" is true when you think the current stage should move forward.
- Always return valid JSON. No trailing commas. No comments."""


@dataclass
class InterviewResponse:
    spoken_text: str
    score: int | None = None
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    eval_notes: str = ""
    topic: str = ""
    difficulty: str = "medium"
    suggest_advance: bool = False
    raw_json: dict | None = None

    @classmethod
    def from_json(cls, data: dict) -> InterviewResponse:
        evaluation = data.get("evaluation", {})
        meta = data.get("meta", {})
        return cls(
            spoken_text=data.get("spoken_text", ""),
            score=evaluation.get("score"),
            strengths=evaluation.get("strengths", []),
            weaknesses=evaluation.get("weaknesses", []),
            eval_notes=evaluation.get("notes", ""),
            topic=meta.get("topic", ""),
            difficulty=meta.get("difficulty", "medium"),
            suggest_advance=meta.get("suggest_advance", False),
            raw_json=data,
        )


def ask_llm_structured(
    user_text: str,
    stage: str = "technical",
    history: list[dict] | None = None,
) -> InterviewResponse:
    """Send a prompt and parse the structured JSON response."""
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    if not api_key or api_key.startswith("PASTE"):
        raise RuntimeError("GROQ_API_KEY missing in .env")

    system_content = (
        f"{STRUCTURED_SYSTEM_PROMPT}\n\nCurrent interview stage: {stage}."
    )

    messages = [{"role": "system", "content": system_content}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_text})

    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.7,
        max_tokens=500,
        response_format={"type": "json_object"},
    )

    raw = completion.choices[0].message.content.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: treat the whole response as spoken text
        return InterviewResponse(spoken_text=raw)

    return InterviewResponse.from_json(data)
