"""Streaming LLM path + background scoring.

Split from ``structured.py`` because the UX streaming path wants a
plain-text reply it can start speaking on the first token, while scoring
needs a deterministic JSON response from a stronger model. We run the
two as separate calls so the candidate hears a reply within ~200 ms,
while evaluation lands a second or two later in the background.
"""
from __future__ import annotations

import asyncio
import json
import os
from dataclasses import dataclass, field
from typing import AsyncIterator, Iterator, Optional

from dotenv import load_dotenv
from groq import Groq

from backend.scoring_rubric import SCORING_RUBRIC, AI_DETECTION_PROMPT

load_dotenv()


PERSONAS = {
    "mentor": (
        "Your persona: The Encouraging Mentor. You are warm and patient. "
        "You frame follow-ups as 'let's go one level deeper together' rather "
        "than challenges. Avoid intimidating phrasing. Give a small piece of "
        "positive acknowledgement before pushing on depth. Suitable for "
        "junior candidates."
    ),
    "senior": (
        "Your persona: The Direct Senior Lead. You are terse, rigorous, and "
        "have no patience for hand-waving. You cut off ramblings and pull "
        "candidates back to specifics: 'Give me the number. What was the "
        "QPS? What was the p99?'. Suitable for senior IC candidates."
    ),
    "cto": (
        "Your persona: The Product-Focused CTO. You care about business "
        "impact, trade-offs, and long-term thinking. Every technical question "
        "ties back to a product decision: 'Why does this matter for the "
        "customer? What did this save the business?'. Suitable for lead and "
        "staff-level candidates."
    ),
}

DEFAULT_PERSONA = "senior"


SPOKEN_SYSTEM_PROMPT_BASE = (
    "You are a senior technical interviewer. Speak as a human would in a "
    "live call — no markdown, no bullet points, no JSON. One or two "
    "sentences. Ask ONE question at a time. Probe deeper when answers are "
    "vague: do NOT move on to a new topic if the candidate gave a "
    "surface-level answer. Reference specifics the candidate mentioned "
    "earlier when you can."
)


DIFFICULTY_HINTS = {
    "junior": "Target junior level: fundamentals, single-component questions.",
    "mid": "Target mid level: design trade-offs, production experience.",
    "senior": "Target senior level: distributed systems, CAP, concrete numbers.",
}


def build_spoken_system_prompt(
    stage: str,
    persona: str,
    resume_context: str = "",
    job_context: str = "",
    asked_topics: list[str] | None = None,
    key_claims: list[str] | None = None,
    vague_last_answer: bool = False,
    difficulty_level: str = "mid",
) -> str:
    parts = [SPOKEN_SYSTEM_PROMPT_BASE]
    parts.append(PERSONAS.get(persona, PERSONAS[DEFAULT_PERSONA]))
    parts.append(DIFFICULTY_HINTS.get(difficulty_level, DIFFICULTY_HINTS["mid"]))
    parts.append(f"Current stage: {stage}.")
    if resume_context:
        parts.append(f"Candidate background:\n{resume_context}")
    if job_context:
        parts.append(f"Role context:\n{job_context}")
    if asked_topics:
        parts.append(
            "Topics already covered (DO NOT repeat, switch to a fresh area): "
            + ", ".join(asked_topics)
        )
    if key_claims:
        parts.append(
            "Key claims the candidate has made earlier in this interview "
            "(use these to check consistency and drill into specifics):\n- "
            + "\n- ".join(key_claims[-15:])
        )
    if vague_last_answer:
        parts.append(
            "IMPORTANT: the candidate's last answer was vague or "
            "surface-level. DO NOT move on. Ask a sharper follow-up on the "
            "SAME topic demanding specifics — numbers, names, a concrete "
            "example, or a failure mode they hit."
        )
    return "\n\n".join(parts)


def stream_spoken_reply(
    user_text: str,
    *,
    stage: str,
    persona: str,
    history: list[dict] | None,
    resume_context: str,
    job_context: str,
    asked_topics: list[str] | None,
    key_claims: list[str] | None,
    vague_last_answer: bool,
    difficulty_level: str = "mid",
) -> Iterator[str]:
    """Synchronous generator yielding reply tokens from Groq streaming."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key.startswith("PASTE"):
        raise RuntimeError("GROQ_API_KEY missing")
    # Use the fast model for the conversational reply — 5-10x lower latency
    # than the 70b model and the spoken reply is a short 1-2 sentence
    # utterance, not nuanced scoring.
    model = os.getenv("GROQ_FAST_MODEL", "llama-3.1-8b-instant")
    system_content = build_spoken_system_prompt(
        stage=stage,
        persona=persona,
        resume_context=resume_context,
        job_context=job_context,
        asked_topics=asked_topics,
        key_claims=key_claims,
        vague_last_answer=vague_last_answer,
        difficulty_level=difficulty_level,
    )
    trimmed_history = history[-8:] if history and len(history) > 8 else history
    messages = [{"role": "system", "content": system_content}]
    if trimmed_history:
        messages.extend(trimmed_history)
    messages.append({"role": "user", "content": user_text})

    client = Groq(api_key=api_key)
    stream = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.6,
        max_tokens=220,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            yield delta


# --- Background scoring --------------------------------------------------

SCORE_ONLY_SYSTEM_PROMPT = f"""\
You are a calibrated technical interview evaluator. You observed one
question/answer exchange. Return ONLY valid JSON, no prose.

Schema:
{{
  "evaluation": {{
    "correctness": 0-10 or null,
    "depth": 0-10 or null,
    "communication": 0-10 or null,
    "relevance": 0-10 or null,
    "strengths": [...],
    "weaknesses": [...],
    "notes": "brief"
  }},
  "meta": {{ "topic": "...", "difficulty": "easy|medium|hard", "is_vague": bool }},
  "ai_detection": {{ "ai_likelihood": 0.0-1.0, "ai_indicators": [...], "human_indicators": [...] }},
  "extracted_claims": [
    "up to 3 concrete factual claims the candidate just made that future
     turns should remember, e.g. 'worked on Kafka pipeline at Flipkart handling
     200k events/sec'"
  ]
}}

{SCORING_RUBRIC}

{AI_DETECTION_PROMPT}

Set evaluation fields to null during intro or wrap-up stages."""


def score_answer_blocking(
    user_text: str,
    assistant_reply: str,
    *,
    stage: str,
    resume_context: str = "",
    job_context: str = "",
) -> dict:
    """Run the structured scoring call and return the parsed JSON dict."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key or api_key.startswith("PASTE"):
        return {}
    # Scoring uses the stronger model because we rely on nuanced rubric
    # judgement. The spoken reply has already been sent to the candidate.
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    client = Groq(api_key=api_key)

    prompt_parts = [SCORE_ONLY_SYSTEM_PROMPT]
    if resume_context:
        prompt_parts.append(f"Candidate background:\n{resume_context}")
    if job_context:
        prompt_parts.append(f"Role context:\n{job_context}")
    system_content = "\n\n".join(prompt_parts)

    messages = [
        {"role": "system", "content": system_content},
        {
            "role": "user",
            "content": (
                f"Stage: {stage}\n"
                f"Candidate answered: {user_text}\n"
                f"Interviewer asked next: {assistant_reply}"
            ),
        },
    ]

    try:
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.2,
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        raw = completion.choices[0].message.content.strip()
        return json.loads(raw)
    except Exception:
        return {}
