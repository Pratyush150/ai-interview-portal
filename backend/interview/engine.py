"""Interview engine with stages, memory, structured output, and AI detection.

Manages a multi-stage interview whose stage prompts, turn budget, topic mix,
and depth are all selected from a role-specific profile in role_profiles.py.
That way an MBA consulting case and a staff-level SRE deep-dive are genuinely
different interviews, not cosmetic variants of the same prompt.

Stage order: INTRO -> BACKGROUND -> CORE -> FOLLOW_UP -> WRAP_UP -> FINISHED
"""
from __future__ import annotations

import os
from enum import Enum
from dataclasses import dataclass, field
from dotenv import load_dotenv
from groq import Groq

from backend.llm.structured import ask_llm_structured, InterviewResponse
from backend.ai_detection import analyze_answer
from backend.interview.role_profiles import (
    get_profile,
    get_turn_budget,
    get_depth_instruction,
    get_rubric_weights,
    infer_seniority,
)

load_dotenv()


class Stage(str, Enum):
    INTRO = "intro"
    BACKGROUND = "background"
    # The core technical/functional block. Named "technical" for legacy
    # compatibility with downstream consumers that still read the stage
    # string, but the engine treats it as role-agnostic "core".
    TECHNICAL = "technical"
    FOLLOW_UP = "follow_up"
    WRAP_UP = "wrap_up"
    FINISHED = "finished"


STAGE_ORDER = [Stage.INTRO, Stage.BACKGROUND, Stage.TECHNICAL, Stage.FOLLOW_UP, Stage.WRAP_UP, Stage.FINISHED]

# Turn-budget profile keys -> Stage. The turn-budget dict uses "core" for the
# technical/functional block; the engine's legacy enum uses "technical".
_BUDGET_KEY = {
    Stage.INTRO: "intro",
    Stage.BACKGROUND: "background",
    Stage.TECHNICAL: "core",
    Stage.FOLLOW_UP: "follow_up",
    Stage.WRAP_UP: "wrap_up",
}


BASE_INTERVIEWER_PREFIX = (
    "You are conducting a rigorous, role-specific interview. Core rules that apply to EVERY role:\n"
    "- Ask ONE question at a time. Keep spoken_text to 1-3 sentences. Never lecture.\n"
    "- Reference the candidate's previous answers to build continuity.\n"
    "- Do not accept hand-waving; always dig: why / how / tradeoffs / failure modes.\n"
    "- Stay in English unless the candidate switches first.\n"
    "- Be tough but fair. Assess true depth, not polished delivery.\n"
)


@dataclass
class InterviewSession:
    """Holds all state for one interview session."""
    session_id: str = "default"
    stage: Stage = Stage.INTRO
    history: list[dict] = field(default_factory=list)
    stage_turn_count: int = 0
    total_turns: int = 0
    candidate_name: str | None = None
    evaluations: list[dict] = field(default_factory=list)
    use_structured: bool = False
    resume_context: str = ""
    job_title: str = ""
    job_skills: list[str] = field(default_factory=list)
    job_description: str = ""
    cheating_flags: list[dict] = field(default_factory=list)
    asked_topics: list[str] = field(default_factory=list)
    # Role / seniority metadata (drives stage prompts + turn budget).
    role_family: str = "software_engineering"
    seniority: str = "mid"
    candidate_experience_years: float | None = None

    def __post_init__(self):
        # Auto-detect seniority from candidate YOE if not explicitly set.
        if self.seniority == "mid" and self.candidate_experience_years is not None:
            self.seniority = infer_seniority(self.candidate_experience_years)

    @property
    def is_finished(self) -> bool:
        return self.stage == Stage.FINISHED

    @property
    def _profile(self):
        return get_profile(self.role_family)

    @property
    def _turn_budget(self):
        return get_turn_budget(self.seniority)

    def _stage_prompt(self) -> str:
        p = self._profile
        depth = get_depth_instruction(self.seniority)
        template = {
            Stage.INTRO: p.intro_prompt,
            Stage.BACKGROUND: p.background_prompt,
            Stage.TECHNICAL: p.core_prompt,
            Stage.FOLLOW_UP: p.follow_up_prompt,
            Stage.WRAP_UP: p.wrap_up_prompt,
        }.get(self.stage, "")
        return template.replace("{{depth}}", depth)

    def _system_prompt(self) -> str:
        p = self._profile
        parts = [
            BASE_INTERVIEWER_PREFIX,
            p.interviewer_persona,
            f"\nRole being interviewed for: {p.display_name} ({self.seniority}).",
            f"Current stage: {self.stage.value}.",
            self._stage_prompt(),
        ]
        if self.candidate_name:
            parts.append(f"\nCandidate name: {self.candidate_name}.")
        if self.candidate_experience_years is not None:
            parts.append(f"Candidate reports ~{self.candidate_experience_years:.1f} years of experience.")
        if self.resume_context:
            parts.append(f"\nCandidate resume context:\n{self.resume_context}")
            parts.append("Tailor questions to the candidate's specific experience. Probe their actual claims.")
        if self.job_title:
            parts.append(f"\nJob title: {self.job_title}.")
        if self.job_skills:
            parts.append(f"Required skills: {', '.join(self.job_skills)}.")
        if self.job_description:
            parts.append(f"Job description (truncated): {self.job_description[:600]}")

        # Topic diversity guidance — rotate through the role-specific topic mix.
        if self.asked_topics:
            parts.append(
                "\nTOPIC DIVERSITY: You have already covered these topics: "
                f"{', '.join(self.asked_topics)}. "
                f"Do NOT repeat them. Pick from the remaining areas for this role: "
                f"{', '.join(p.topic_categories)}."
            )
        else:
            parts.append(
                f"\nRotate questions across these topic areas: {', '.join(p.topic_categories)}."
            )

        parts.append(
            f"\nThis is turn {self.stage_turn_count + 1} of the {self.stage.value} stage. "
            f"Total turns so far: {self.total_turns}."
        )
        return " ".join(parts)

    def _job_context(self) -> str:
        p = self._profile
        parts = [f"Role family: {p.display_name} ({self.seniority})"]
        if self.job_title:
            parts.append(f"Position: {self.job_title}")
        if self.candidate_experience_years is not None:
            parts.append(f"Candidate YoE: ~{self.candidate_experience_years:.1f}")
        if self.job_skills:
            parts.append(f"Required skills: {', '.join(self.job_skills)}")
        if self.job_description:
            parts.append(f"Description: {self.job_description[:500]}")
        # Hand the LLM the depth instruction and rubric weights for this role.
        parts.append(f"Depth bar: {get_depth_instruction(self.seniority)}")
        weights = get_rubric_weights(self.role_family)
        parts.append(
            "Rubric weighting for this role — "
            + ", ".join(f"{k}:{v}" for k, v in weights.items())
            + ". Weight scores accordingly."
        )
        return "\n".join(parts)

    def _turn_limit(self) -> int:
        key = _BUDGET_KEY.get(self.stage, "core")
        return int(self._turn_budget.get(key, 3))

    def _should_advance(self) -> bool:
        return self.stage_turn_count >= self._turn_limit()

    def _advance_stage(self) -> None:
        idx = STAGE_ORDER.index(self.stage)
        if idx + 1 < len(STAGE_ORDER):
            self.stage = STAGE_ORDER[idx + 1]
            self.stage_turn_count = 0

    def turn(self, user_text: str, time_to_respond_ms: int = 0, is_voice_input: bool = False) -> str:
        """Process one candidate utterance and return the interviewer response."""
        if self.use_structured:
            resp = self.turn_structured(user_text, time_to_respond_ms, is_voice_input)
            return resp.spoken_text

        if self.is_finished:
            return "The interview has concluded. Thank you for participating!"

        api_key = os.getenv("GROQ_API_KEY")
        model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        if not api_key or api_key.startswith("PASTE"):
            raise RuntimeError("GROQ_API_KEY missing in .env")

        messages = [{"role": "system", "content": self._system_prompt()}]
        messages.extend(self.history)
        messages.append({"role": "user", "content": user_text})

        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=0.7,
            max_tokens=300,
        )
        reply = completion.choices[0].message.content.strip()

        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": reply})
        self.stage_turn_count += 1
        self.total_turns += 1

        if self._should_advance():
            self._advance_stage()

        return reply

    def turn_structured(self, user_text: str, time_to_respond_ms: int = 0, is_voice_input: bool = False) -> InterviewResponse:
        """Process one turn with structured evaluation and AI detection."""
        if self.is_finished:
            return InterviewResponse(spoken_text="The interview has concluded. Thank you for participating!")

        resp = ask_llm_structured(
            user_text,
            stage=self.stage.value,
            history=self.history,
            resume_context=self.resume_context,
            job_context=self._job_context(),
            asked_topics=self.asked_topics,
            role_profile=self._profile,
            seniority=self.seniority,
        )

        heuristic = analyze_answer(user_text, time_to_respond_ms, is_voice_input)
        if not heuristic.confident:
            combined_ai = 0.0
        else:
            blended = 0.5 * heuristic.likelihood + 0.5 * resp.ai_likelihood
            if heuristic.likelihood < 0.2 and resp.ai_likelihood < 0.4:
                blended *= 0.3
            combined_ai = round(blended, 2)

        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": resp.spoken_text})
        self.stage_turn_count += 1
        self.total_turns += 1

        if resp.topic and resp.topic not in self.asked_topics:
            self.asked_topics.append(resp.topic)

        if resp.score is not None:
            adjusted_score = resp.score
            if combined_ai > 0.7:
                adjusted_score = round(resp.score * 0.7, 1)
            elif combined_ai > 0.5:
                adjusted_score = round(resp.score * 0.85, 1)

            self.evaluations.append({
                "turn": self.total_turns,
                "stage": self.stage.value,
                "score": adjusted_score,
                "original_score": resp.score,
                "correctness": resp.correctness,
                "depth": resp.depth,
                "communication": resp.communication,
                "relevance": resp.relevance,
                "topic": resp.topic,
                "strengths": resp.strengths,
                "weaknesses": resp.weaknesses,
                "notes": resp.eval_notes,
                "ai_likelihood": combined_ai,
                "ai_signals": heuristic.signals,
            })

        if resp.suggest_advance or self._should_advance():
            self._advance_stage()

        return resp

    def add_cheating_flag(self, violation: dict):
        self.cheating_flags.append(violation)

    def get_status(self) -> dict:
        scores = [e["score"] for e in self.evaluations if e.get("score") is not None]
        ai_scores = [e["ai_likelihood"] for e in self.evaluations if e.get("ai_likelihood") is not None]
        total_budget = sum(self._turn_budget.values())
        return {
            "session_id": self.session_id,
            "stage": self.stage.value,
            "stage_turn_count": self.stage_turn_count,
            "total_turns": self.total_turns,
            "is_finished": self.is_finished,
            "history_length": len(self.history),
            "evaluations_count": len(self.evaluations),
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "avg_ai_likelihood": round(sum(ai_scores) / len(ai_scores), 2) if ai_scores else None,
            "cheating_flags_count": len(self.cheating_flags),
            "topics_covered": self.asked_topics,
            "role_family": self.role_family,
            "seniority": self.seniority,
            "expected_total_turns": total_budget,
        }
