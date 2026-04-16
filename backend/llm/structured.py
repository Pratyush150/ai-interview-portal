"""Phase 7+ — Structured JSON output from LLM with rubric-based scoring and AI detection."""
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
  "spoken_text": "What you say to the candidate (1-3 sentences, natural conversational tone)",
  "evaluation": {{
    "correctness": 0-10 or null if not evaluating,
    "depth": 0-10 or null,
    "communication": 0-10 or null,
    "relevance": 0-10 or null,
    "score": null or the average of the 4 dimensions above (auto-calculate),
    "strengths": ["list of specific strengths observed"] or [],
    "weaknesses": ["list of specific weaknesses observed"] or [],
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
- "spoken_text" is what the candidate hears (natural, conversational, 1-3 sentences).
- For intro/wrap-up stages, set all evaluation scores to null.
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
        evaluation = data.get("evaluation", {})
        meta = data.get("meta", {})
        ai_det = data.get("ai_detection", {})

        # Calculate score from dimensions if not provided
        dims = [evaluation.get(d) for d in ("correctness", "depth", "communication", "relevance")]
        valid_dims = [d for d in dims if d is not None]
        calculated_score = round(sum(valid_dims) / len(valid_dims), 1) if valid_dims else evaluation.get("score")

        return cls(
            spoken_text=data.get("spoken_text", ""),
            score=calculated_score,
            correctness=evaluation.get("correctness"),
            depth=evaluation.get("depth"),
            communication=evaluation.get("communication"),
            relevance=evaluation.get("relevance"),
            strengths=evaluation.get("strengths", []),
            weaknesses=evaluation.get("weaknesses", []),
            eval_notes=evaluation.get("notes", ""),
            topic=meta.get("topic", ""),
            difficulty=meta.get("difficulty", "medium"),
            suggest_advance=meta.get("suggest_advance", False),
            ai_likelihood=ai_det.get("ai_likelihood", 0.0),
            human_indicators=ai_det.get("human_indicators", []),
            ai_indicators=ai_det.get("ai_indicators", []),
            raw_json=data,
        )


def ask_llm_structured(
    user_text: str,
    stage: str = "technical",
    history: list[dict] | None = None,
    resume_context: str = "",
    job_context: str = "",
) -> InterviewResponse:
    """Send a prompt and parse the structured JSON response."""
    api_key = os.getenv("GROQ_API_KEY")
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    if not api_key or api_key.startswith("PASTE"):
        raise RuntimeError("GROQ_API_KEY missing in .env")

    system_content = f"{STRUCTURED_SYSTEM_PROMPT}\n\nCurrent interview stage: {stage}."
    if resume_context:
        system_content += f"\n\nCandidate resume context:\n{resume_context}"
        system_content += "\nTailor questions to the candidate's specific experience and skills."
    if job_context:
        system_content += f"\n\nJob context:\n{job_context}"
        system_content += "\nFocus technical questions on the required skills for this role."

    messages = [{"role": "system", "content": system_content}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user_text})

    client = Groq(api_key=api_key)
    completion = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.3,  # Lower temp for consistent scoring
        max_tokens=600,
        response_format={"type": "json_object"},
    )

    raw = completion.choices[0].message.content.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return InterviewResponse(spoken_text=raw)

    return InterviewResponse.from_json(data)
