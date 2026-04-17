"""Interview engine with stages, memory, structured output, and AI detection.

Manages a multi-stage technical interview:
    INTRO -> BACKGROUND -> TECHNICAL -> FOLLOW_UP -> WRAP_UP
"""
from __future__ import annotations

import os
from enum import Enum
from dataclasses import dataclass, field
from dotenv import load_dotenv
from groq import Groq

from backend.llm.structured import ask_llm_structured, InterviewResponse
from backend.llm.streaming import stream_spoken_reply, score_answer_blocking, DEFAULT_PERSONA, PERSONAS
from backend.ai_detection import analyze_answer

load_dotenv()


class Stage(str, Enum):
    INTRO = "intro"
    BACKGROUND = "background"
    TECHNICAL = "technical"
    FOLLOW_UP = "follow_up"
    WRAP_UP = "wrap_up"
    FINISHED = "finished"


def auto_calibrate(experience_years: float | None, job_title: str, job_description: str) -> dict:
    """Resolve ``persona`` + ``difficulty_level`` from resume experience
    and the job posting. This is the single source of truth used at
    session creation so the candidate cannot self-select an easier
    interview."""
    years = float(experience_years or 0)
    blob = f"{job_title or ''} {job_description or ''}".lower()
    is_lead = any(k in blob for k in (
        "lead", "staff", "principal", "director", "head of", "architect",
        "cto", " chief "
    ))
    is_senior_role = any(k in blob for k in ("senior", "sr.", "sr "))
    is_junior_role = any(k in blob for k in ("junior", "intern", "entry", "fresher"))

    if is_lead or years >= 10:
        return {"persona": "cto", "difficulty_level": "senior"}
    if is_senior_role or years >= 6:
        return {"persona": "senior", "difficulty_level": "senior"}
    if is_junior_role or years < 2:
        return {"persona": "mentor", "difficulty_level": "junior"}
    return {"persona": "senior", "difficulty_level": "mid"}


DIFFICULTY_DIRECTIVES = {
    "junior": (
        "Difficulty calibration: JUNIOR. Ask foundational questions — "
        "language fundamentals, basic data structures, how one specific "
        "system works end-to-end. Keep scenarios small (single service, "
        "one database). Expect the candidate to know WHAT, sometimes WHY, "
        "rarely deep HOW."
    ),
    "mid": (
        "Difficulty calibration: MID-LEVEL. Ask questions that require "
        "design trade-offs on a single component — caching strategy, "
        "schema choice, concurrency primitives. Probe for production "
        "experience: 'have you run this at scale? what broke?'"
    ),
    "senior": (
        "Difficulty calibration: SENIOR. Ask multi-component system "
        "design, distributed-systems trade-offs (CAP, consistency "
        "models, failure modes), cost/latency envelopes with concrete "
        "numbers. Expect the candidate to own the decision framework, "
        "not just name the technology."
    ),
}


STAGE_TURN_LIMITS = {
    Stage.INTRO: 2,
    Stage.BACKGROUND: 4,
    Stage.TECHNICAL: 9,
    Stage.FOLLOW_UP: 5,
    Stage.WRAP_UP: 2,
}

STAGE_ORDER = [Stage.INTRO, Stage.BACKGROUND, Stage.TECHNICAL, Stage.FOLLOW_UP, Stage.WRAP_UP, Stage.FINISHED]

STAGE_PROMPTS = {
    Stage.INTRO: (
        "You are starting the interview. Greet the candidate briefly and warmly, "
        "then set expectations: this will be a rigorous, in-depth technical interview. "
        "Ask them to give a concise introduction — who they are, their current role, "
        "and what they are most proud of building. Do not linger here; keep it to "
        "one or two exchanges maximum."
    ),
    Stage.BACKGROUND: (
        "You are in the background stage. Your goal is to separate real, deep experience "
        "from surface-level resume padding. For each project the candidate mentions:\n"
        "- Ask what THEY specifically did versus what the team did.\n"
        "- Ask about the architecture: what components existed, how they communicated, "
        "what databases or message queues were used and WHY those were chosen over alternatives.\n"
        "- Ask about team size, their exact role, and who they reported to.\n"
        "- Ask about a specific technical challenge they hit on that project and how they solved it.\n"
        "- If they mention a technology, ask them to explain how it works under the hood.\n"
        "Do NOT accept vague answers like 'I worked on the backend.' Push for specifics: "
        "'What endpoints did you own? What was the request volume? How did you handle failures?'\n"
        "Ask one question at a time. Reference their previous answers to build continuity."
    ),
    Stage.TECHNICAL: (
        "You are in the technical deep-dive stage. Go DEEP into one or two topics rather than "
        "skimming across many. Choose topics based on the candidate's background and the job requirements.\n\n"
        "Pick from these question types and mix them:\n"
        "- SYSTEM DESIGN: 'Design a system that handles X at scale.' Then probe: database sharding, "
        "caching strategy, failover, consistency vs availability tradeoffs.\n"
        "- ALGORITHM & COMPLEXITY: Ask about time/space complexity. 'Can you do better than O(n^2)?'\n"
        "- DEBUGGING SCENARIOS: 'Your service returns 500 errors for 2%% of requests during peak hours. "
        "Walk me through your debugging process.'\n"
        "- CODE REVIEW: 'If you saw a PR that did X, what concerns would you raise?'\n"
        "- TRADEOFF ANALYSIS: 'Why SQL over NoSQL here? What do you lose?'\n\n"
        "When the candidate answers, ALWAYS follow up: 'Why that choice? What if requirements changed? "
        "What are the failure modes?' Never say 'good answer' and move on. Always dig one level deeper."
    ),
    Stage.FOLLOW_UP: (
        "You are in the follow-up stage. Go back to the candidate's earlier answers and find weak spots.\n"
        "- Pick an answer where the candidate was vague and ask them to be precise.\n"
        "- Ask 'what if' questions: change a constraint and see how their answer adapts.\n"
        "- Ask about failure cases and edge cases they did not mention.\n"
        "- Ask about monitoring, observability, and how they would know the system is healthy.\n"
        "- Challenge directly but professionally: 'You mentioned X, but Y might be simpler for this scale. "
        "Convince me why X is the right call.'\n"
        "Reference specific things the candidate said earlier."
    ),
    Stage.WRAP_UP: (
        "You are wrapping up the interview. Ask these probing closing questions:\n"
        "- 'Tell me about a technical decision you made that turned out to be wrong. What did you learn?'\n"
        "- 'What is the hardest bug you have ever debugged? Walk me through the process.'\n"
        "After their response, give a brief, honest summary of strengths and areas for improvement. "
        "Then thank them for their time."
    ),
}

BASE_SYSTEM_PROMPT = (
    "You are a senior staff engineer at a FAANG company conducting a rigorous technical interview. "
    "Your interview style:\n"
    "- NEVER accept surface-level answers. Always dig deeper with 'why', 'how', 'what tradeoffs'.\n"
    "- Reference the candidate's previous answers when asking follow-ups.\n"
    "- Use scenario-based questions with concrete numbers and constraints.\n"
    "- When a candidate gives a weak or vague answer, challenge it professionally.\n"
    "- Adapt difficulty dynamically based on the candidate's performance.\n"
    "- Ask ONE question at a time. Keep responses concise (2-3 sentences). Do not lecture.\n"
    "- Conduct the interview in English.\n"
    "- Be tough but fair. Assess true depth of knowledge."
)


# Topic categories the interviewer should cycle through
TOPIC_CATEGORIES = [
    "system design & architecture",
    "data structures & algorithms",
    "databases & storage",
    "APIs & distributed systems",
    "testing & debugging",
    "deployment & DevOps",
    "security & performance",
    "code quality & best practices",
]


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
    asked_topics: list[str] = field(default_factory=list)  # track covered topics
    # Long-term memory: claims the candidate has made in earlier turns.
    # Injected into every subsequent system prompt so the interviewer can
    # reference specifics and check consistency far beyond the 8-turn
    # sliding history window.
    key_claims: list[str] = field(default_factory=list)
    # Persona drives the interviewer's tone (mentor / senior / cto).
    persona: str = DEFAULT_PERSONA
    # Difficulty calibration, resolved from resume years + job title:
    # "junior" | "mid" | "senior". Injected into the system prompt so
    # the LLM targets the right question depth. The candidate cannot
    # pick this — preventing self-selection into an easier interview.
    difficulty_level: str = "mid"
    experience_years: float | None = None
    # True when the last answer was judged vague; next turn will drill
    # deeper rather than moving on.
    last_answer_was_vague: bool = False

    @property
    def is_finished(self) -> bool:
        return self.stage == Stage.FINISHED

    def _system_prompt(self) -> str:
        stage_overlay = STAGE_PROMPTS.get(self.stage, "")
        parts = [BASE_SYSTEM_PROMPT, f"\n\nCurrent stage: {self.stage.value}.", stage_overlay]
        diff_directive = DIFFICULTY_DIRECTIVES.get(self.difficulty_level)
        if diff_directive:
            parts.append(diff_directive)
        if self.candidate_name:
            parts.append(f"\nCandidate name: {self.candidate_name}.")
        if self.resume_context:
            parts.append(f"\nCandidate resume context: {self.resume_context}")
            parts.append("Tailor questions to the candidate's specific experience and skills.")
        if self.job_title:
            parts.append(f"\nThis interview is for the position: {self.job_title}.")
        if self.job_skills:
            parts.append(f"Required skills: {', '.join(self.job_skills)}.")

        # Topic diversity instruction
        if self.asked_topics:
            parts.append(
                f"\n\nIMPORTANT — TOPIC DIVERSITY: You have already asked about these topics: "
                f"{', '.join(self.asked_topics)}. "
                f"Do NOT ask another question about the same topic area. "
                f"Switch to a DIFFERENT topic. Choose from areas you have NOT covered yet. "
                f"Vary between: {', '.join(TOPIC_CATEGORIES)}."
            )

        parts.append(
            f"\nThis is turn {self.stage_turn_count + 1} of the {self.stage.value} stage. "
            f"Total interview turns so far: {self.total_turns}."
        )
        return " ".join(parts)

    def _job_context(self) -> str:
        if not self.job_title:
            return ""
        parts = [f"Position: {self.job_title}"]
        if self.job_skills:
            parts.append(f"Required skills: {', '.join(self.job_skills)}")
        if self.job_description:
            parts.append(f"Description: {self.job_description[:500]}")
        return "\n".join(parts)

    def _should_advance(self) -> bool:
        limit = STAGE_TURN_LIMITS.get(self.stage, 3)
        return self.stage_turn_count >= limit

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

        # Pass asked_topics so the LLM knows what to avoid
        resp = ask_llm_structured(
            user_text,
            stage=self.stage.value,
            history=self.history,
            resume_context=self.resume_context,
            job_context=self._job_context(),
            asked_topics=self.asked_topics,
        )

        # Run heuristic AI detection. For short answers (< MIN_WORDS_FOR_DETECTION)
        # the heuristic is not confident — in that case we also discount the
        # LLM's guess, since the LLM tends to default to 0.2-0.3 on short
        # ambiguous inputs which produces noisy false positives.
        heuristic = analyze_answer(user_text, time_to_respond_ms, is_voice_input)
        if not heuristic.confident:
            combined_ai = 0.0
        else:
            # Weighted blend, but require at least one signal to exceed 0.2
            # before we report anything above 0.1 overall.
            blended = 0.5 * heuristic.likelihood + 0.5 * resp.ai_likelihood
            if heuristic.likelihood < 0.2 and resp.ai_likelihood < 0.4:
                blended *= 0.3
            combined_ai = round(blended, 2)

        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": resp.spoken_text})
        self.stage_turn_count += 1
        self.total_turns += 1

        # Track the topic to prevent repetition
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

    # ------------------------------------------------------------------
    # Streaming path: fast spoken reply + background scoring.
    # ------------------------------------------------------------------

    def turn_stream(self, user_text: str):
        """Yield tokens of the spoken reply. The scoring call must be
        scheduled separately by the caller once the reply is complete
        (see ``score_last_turn``).
        """
        if self.is_finished:
            yield "The interview has concluded. Thank you for participating!"
            return

        token_buffer: list[str] = []
        for tok in stream_spoken_reply(
            user_text,
            stage=self.stage.value,
            persona=self.persona,
            history=self.history,
            resume_context=self.resume_context,
            job_context=self._job_context(),
            asked_topics=self.asked_topics,
            key_claims=self.key_claims,
            vague_last_answer=self.last_answer_was_vague,
            difficulty_level=self.difficulty_level,
        ):
            token_buffer.append(tok)
            yield tok

        reply = "".join(token_buffer).strip()
        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": reply})
        self.stage_turn_count += 1
        self.total_turns += 1
        # Stash the pending pair so the scoring task can read it after
        # the SSE response has been fully sent.
        self._pending_scoring = {"user_text": user_text, "reply": reply}
        if self._should_advance():
            self._advance_stage()

    def score_last_turn(self, time_to_respond_ms: int = 0, is_voice_input: bool = False):
        """Runs the heavier structured evaluation call on the turn most
        recently produced by ``turn_stream``. Safe to call in a
        background thread/task — mutates ``self.evaluations`` and
        ``self.key_claims`` when done.
        """
        pending = getattr(self, "_pending_scoring", None)
        if not pending:
            return
        self._pending_scoring = None

        user_text = pending["user_text"]
        reply = pending["reply"]

        data = score_answer_blocking(
            user_text,
            reply,
            stage=self.stage.value,
            resume_context=self.resume_context,
            job_context=self._job_context(),
        )
        if not data:
            return

        evaluation = data.get("evaluation", {}) or {}
        meta = data.get("meta", {}) or {}
        ai_det = data.get("ai_detection", {}) or {}
        claims = data.get("extracted_claims", []) or []

        # Heuristic AI detection (same guard as turn_structured).
        heuristic = analyze_answer(user_text, time_to_respond_ms, is_voice_input)
        llm_ai = float(ai_det.get("ai_likelihood", 0.0) or 0.0)
        if not heuristic.confident:
            combined_ai = 0.0
        else:
            blended = 0.5 * heuristic.likelihood + 0.5 * llm_ai
            if heuristic.likelihood < 0.2 and llm_ai < 0.4:
                blended *= 0.3
            combined_ai = round(blended, 2)

        # Compute final score from dimensions.
        dims = [evaluation.get(d) for d in ("correctness", "depth", "communication", "relevance")]
        valid_dims = [d for d in dims if d is not None]
        score = round(sum(valid_dims) / len(valid_dims), 1) if valid_dims else None

        if score is not None:
            adjusted = score
            if combined_ai > 0.7:
                adjusted = round(score * 0.7, 1)
            elif combined_ai > 0.5:
                adjusted = round(score * 0.85, 1)

            self.evaluations.append({
                "turn": self.total_turns,
                "stage": self.stage.value,
                "score": adjusted,
                "original_score": score,
                "correctness": evaluation.get("correctness"),
                "depth": evaluation.get("depth"),
                "communication": evaluation.get("communication"),
                "relevance": evaluation.get("relevance"),
                "topic": meta.get("topic", ""),
                "strengths": evaluation.get("strengths", []),
                "weaknesses": evaluation.get("weaknesses", []),
                "notes": evaluation.get("notes", ""),
                "ai_likelihood": combined_ai,
                "ai_signals": heuristic.signals,
            })

        topic = meta.get("topic", "")
        if topic and topic not in self.asked_topics:
            self.asked_topics.append(topic)

        # Claim memory: LLM-extracted facts the candidate stated. Used to
        # inject long-term context into future system prompts so the
        # interviewer can reference specifics even after the sliding
        # history window drops them.
        for c in claims[:3]:
            c = str(c).strip()
            if c and c not in self.key_claims:
                self.key_claims.append(c)

        # Adaptive probing: was the last answer vague / surface-level?
        # Trigger when the LLM says so OR when depth / communication are
        # very low. Next turn's system prompt will force a drill-down.
        is_vague = bool(meta.get("is_vague"))
        if score is not None:
            depth = evaluation.get("depth") or 0
            if depth and depth <= 3:
                is_vague = True
        self.last_answer_was_vague = is_vague

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
            "persona": self.persona,
            "difficulty_level": self.difficulty_level,
            "experience_years": self.experience_years,
            "key_claims_count": len(self.key_claims),
        }

    def set_persona(self, persona: str) -> None:
        if persona in PERSONAS:
            self.persona = persona
