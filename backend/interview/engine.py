"""Interview engine: stages, memory, structured output, AI detection.

The interview is paced by **clock**, not turn count. A session has a
target duration (default 22 minutes); each stage gets a percentage slice
of that budget from the role profile. The LLM is told how much time is
left in the stage and overall so it can pace itself — and the engine
also forces a stage advance if the slice is exhausted (with a soft floor
of 1 turn so we don't skip a stage entirely).

Drill-target tracking: weaknesses observed in past evaluations are passed
back into the next turn's system prompt as "outstanding probes" so the
LLM can actually cross-question instead of just running through topics.

Stage order: INTRO -> BACKGROUND -> CORE -> FOLLOW_UP -> WRAP_UP -> FINISHED
"""
from __future__ import annotations

import os
import time
from enum import Enum
from dataclasses import dataclass, field
from dotenv import load_dotenv
from groq import Groq

from backend.llm.structured import ask_llm_structured, InterviewResponse
from backend.ai_detection import analyze_answer
from backend.interview.role_profiles import (
    get_profile,
    get_depth_instruction,
    get_rubric_weights,
    get_stage_minutes,
    get_interviewer_name,
    infer_seniority,
    TOTAL_DURATION_MIN_DEFAULT,
)

load_dotenv()


class Stage(str, Enum):
    INTRO = "intro"
    BACKGROUND = "background"
    # Legacy alias on the wire — engine treats it as "core" internally.
    TECHNICAL = "technical"
    FOLLOW_UP = "follow_up"
    WRAP_UP = "wrap_up"
    FINISHED = "finished"


STAGE_ORDER = [Stage.INTRO, Stage.BACKGROUND, Stage.TECHNICAL, Stage.FOLLOW_UP, Stage.WRAP_UP, Stage.FINISHED]

# Stage -> the key used in role_profiles' time allocation table.
_BUDGET_KEY = {
    Stage.INTRO: "intro",
    Stage.BACKGROUND: "background",
    Stage.TECHNICAL: "core",
    Stage.FOLLOW_UP: "follow_up",
    Stage.WRAP_UP: "wrap_up",
}


BASE_INTERVIEWER_PREFIX = (
    "You are conducting a rigorous, role-specific interview. Core rules that apply to EVERY role:\n"
    "- Speak as YOURSELF, the interviewer. You are introduced separately as 'Sara' — use that name when "
    "introducing yourself in the first intro turn ONLY. Do NOT re-introduce yourself afterwards.\n"
    "- Ask ONE question at a time. Keep spoken_text to 1-3 sentences. Never lecture.\n"
    "- Reference the candidate's previous answers and previously stated projects to build continuity.\n"
    "- Acknowledge the candidate's last answer briefly (one short clause) BEFORE asking the next "
    "  question. This makes the interview feel like a conversation, not an interrogation.\n"
    "- Do not accept hand-waving; always dig: why / how / tradeoffs / failure modes.\n"
    "- If the candidate's last answer revealed a weakness or unverified claim listed in DRILL TARGETS "
    "  below, return to it now (in a natural way) instead of jumping to a new topic.\n"
    "- Stay in English unless the candidate switches first.\n"
    "- Be tough but fair. Assess true depth, not polished delivery.\n"
)


def _now_min() -> float:
    return time.monotonic() / 60.0


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

    role_family: str = "backend_engineering"
    seniority: str = "mid"
    candidate_experience_years: float | None = None

    # Time-based pacing
    target_duration_min: float = float(TOTAL_DURATION_MIN_DEFAULT)
    started_at_min: float = field(default_factory=_now_min)
    stage_started_at_min: float = field(default_factory=_now_min)

    # Pre-interview brief (set by api.py via build_interview_brief).
    interview_brief: dict = field(default_factory=dict)

    # Outstanding cross-question targets accumulated across turns.
    drill_targets: list[str] = field(default_factory=list)

    # Cached synthesized report so /api/session/:id/report can reuse it.
    cached_report: dict | None = None

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
    def interviewer_name(self) -> str:
        return get_interviewer_name(self.role_family)

    # ---- Time budget ------------------------------------------------------

    def _stage_minutes(self) -> dict[str, float]:
        return get_stage_minutes(self.seniority, self.target_duration_min)

    def _stage_budget_min(self) -> float:
        key = _BUDGET_KEY.get(self.stage, "core")
        return self._stage_minutes().get(key, 1.0)

    def elapsed_min(self) -> float:
        return max(0.0, _now_min() - self.started_at_min)

    def remaining_min(self) -> float:
        return max(0.0, self.target_duration_min - self.elapsed_min())

    def stage_elapsed_min(self) -> float:
        return max(0.0, _now_min() - self.stage_started_at_min)

    def stage_remaining_min(self) -> float:
        return max(0.0, self._stage_budget_min() - self.stage_elapsed_min())

    # ---- Prompt construction ---------------------------------------------

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
            f"\nINTERVIEWER NAME: {self.interviewer_name}.",
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
            parts.append(f"Job description (truncated): {self.job_description[:1200]}")

        # Pre-interview brief — the most important context after role/persona.
        if self.interview_brief:
            parts.append("\nPRE-INTERVIEW BRIEF (use this to steer questions):")
            for k in ("gaps_to_probe", "claimed_unverified_skills", "depth_test_topics", "jd_requirements_unmet"):
                items = self.interview_brief.get(k) or []
                if items:
                    parts.append(f"- {k.replace('_', ' ')}: {'; '.join(items[:5])}")

        # Drill targets accumulated from past evaluations
        if self.drill_targets:
            recent = self.drill_targets[-8:]
            parts.append(
                "\nDRILL TARGETS (return to these when natural — they are claims that "
                f"haven't been verified or weaknesses found earlier): {'; '.join(recent)}."
            )

        # Topic diversity guidance
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

        # Time pacing — tell the LLM how much time is left
        parts.append(
            f"\nPACING: Target interview length is {self.target_duration_min:.0f} minutes. "
            f"Elapsed: {self.elapsed_min():.1f} min. Total remaining: {self.remaining_min():.1f} min. "
            f"Time remaining in '{self.stage.value}' stage: {self.stage_remaining_min():.1f} min "
            f"(budgeted {self._stage_budget_min():.1f} min). "
            f"If you have less than 0.5 min left in this stage, set meta.suggest_advance=true."
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
            parts.append(f"Description: {self.job_description[:800]}")
        parts.append(f"Depth bar: {get_depth_instruction(self.seniority)}")
        weights = get_rubric_weights(self.role_family)
        parts.append(
            "Rubric weighting for this role — "
            + ", ".join(f"{k}:{v}" for k, v in weights.items())
            + ". Weight scores accordingly."
        )
        return "\n".join(parts)

    # ---- Stage advancement -----------------------------------------------

    def _should_advance(self) -> bool:
        # Time-based: stage exhausted its slice. Soft floor — at least 1 turn
        # per stage so we don't skip a stage entirely if the candidate types
        # one super-long answer and burns the budget on it.
        if self.stage_turn_count < 1:
            return False
        if self.stage_remaining_min() <= 0.0:
            return True
        # Hard ceiling on overall length: if we've blown 110% of total budget,
        # collapse straight to wrap_up so the candidate isn't trapped.
        if self.elapsed_min() > self.target_duration_min * 1.10:
            return True
        return False

    def _advance_stage(self) -> None:
        idx = STAGE_ORDER.index(self.stage)
        if idx + 1 < len(STAGE_ORDER):
            self.stage = STAGE_ORDER[idx + 1]
            self.stage_turn_count = 0
            self.stage_started_at_min = _now_min()

    # ---- Drill-target management -----------------------------------------

    def _absorb_drill_targets(self, resp: InterviewResponse) -> None:
        """Pull weaknesses from this turn's evaluation into the running
        drill-targets list so the next turn's system prompt can reference
        them. Cap the list so it doesn't grow unboundedly."""
        for w in (resp.weaknesses or [])[:3]:
            w = (w or "").strip()
            if w and w not in self.drill_targets:
                self.drill_targets.append(w)
        # Keep the most recent 12 — older ones probably already got probed.
        if len(self.drill_targets) > 12:
            self.drill_targets = self.drill_targets[-12:]

    # ---- Turn execution ---------------------------------------------------

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
            interviewer_name=self.interviewer_name,
            drill_targets=self.drill_targets,
            time_remaining_min=self.remaining_min(),
            stage_remaining_min=self.stage_remaining_min(),
            interview_brief=self.interview_brief,
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
                "candidate_excerpt": user_text[:280],
            })

        # Feed weaknesses back into the next turn's drill targets.
        self._absorb_drill_targets(resp)

        # Invalidate any cached report — stats have changed.
        self.cached_report = None

        if resp.suggest_advance or self._should_advance():
            self._advance_stage()

        return resp

    def add_cheating_flag(self, violation: dict):
        self.cheating_flags.append(violation)

    def get_status(self) -> dict:
        scores = [e["score"] for e in self.evaluations if e.get("score") is not None]
        ai_scores = [e["ai_likelihood"] for e in self.evaluations if e.get("ai_likelihood") is not None]
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
            "interviewer_name": self.interviewer_name,
            # Time-based pacing surface
            "target_duration_min": round(self.target_duration_min, 1),
            "elapsed_min": round(self.elapsed_min(), 2),
            "remaining_min": round(self.remaining_min(), 2),
            "stage_remaining_min": round(self.stage_remaining_min(), 2),
            "stage_budget_min": round(self._stage_budget_min(), 2),
        }
