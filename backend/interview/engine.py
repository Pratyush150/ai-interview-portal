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
from backend.ai_detection import analyze_answer

load_dotenv()


class Stage(str, Enum):
    INTRO = "intro"
    BACKGROUND = "background"
    TECHNICAL = "technical"
    FOLLOW_UP = "follow_up"
    WRAP_UP = "wrap_up"
    FINISHED = "finished"


STAGE_TURN_LIMITS = {
    Stage.INTRO: 2,
    Stage.BACKGROUND: 3,
    Stage.TECHNICAL: 6,
    Stage.FOLLOW_UP: 4,
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
        "- SYSTEM DESIGN: 'Imagine you need to design a system that handles 10M daily active users "
        "doing X. Walk me through your architecture.' Then probe: 'What happens when that database "
        "shard fills up? How do you handle a datacenter failover? What is your caching strategy and "
        "what are the invalidation tradeoffs?'\n"
        "- ALGORITHM & COMPLEXITY: Ask about time/space complexity of their proposed solutions. "
        "'Can you do better than O(n^2) here? What data structure would you reach for and why?'\n"
        "- DEBUGGING SCENARIOS: 'Your service is returning 500 errors for 2%% of requests but only "
        "during peak hours. Walk me through your debugging process step by step.'\n"
        "- CODE REVIEW: 'If you saw a pull request that did X, what concerns would you raise?'\n"
        "- TRADEOFF ANALYSIS: 'Why would you choose a SQL database over NoSQL here? What do you lose?'\n\n"
        "When the candidate gives an answer, ALWAYS follow up: 'Why that choice specifically? "
        "What would happen if the requirements changed to Y? What are the failure modes?'\n"
        "Never say 'good answer' and move on. Always dig one level deeper."
    ),
    Stage.FOLLOW_UP: (
        "You are in the follow-up stage. Go back to the candidate's earlier answers and find weak spots.\n"
        "- Pick an answer where the candidate was vague or hand-wavy and ask them to be precise.\n"
        "- Ask 'what if' questions: 'Earlier you said you would use Redis for caching. What if your "
        "dataset is 500GB and does not fit in memory? What changes?'\n"
        "- Ask about failure cases and edge cases they did not mention: 'You described the happy path. "
        "What happens when the downstream service is down? What about race conditions?'\n"
        "- Ask about monitoring and observability: 'How would you know if this system is healthy? "
        "What metrics and alerts would you set up?'\n"
        "- Challenge directly but professionally: 'You mentioned using microservices, but for the scale "
        "you described, a monolith might be simpler. Convince me why microservices are the right call.'\n"
        "Reference specific things the candidate said earlier. Show that you were listening."
    ),
    Stage.WRAP_UP: (
        "You are wrapping up the interview. Ask these probing closing questions:\n"
        "- 'Tell me about a technical decision you made that turned out to be wrong. "
        "What did you learn and what would you do differently?'\n"
        "- 'What is the hardest bug you have ever debugged? Walk me through the process.'\n"
        "- 'If you could go back and re-architect one system you built, which one and why?'\n"
        "After their response, give a brief, honest summary of the strengths and areas for "
        "improvement you observed during the interview. Then thank them for their time."
    ),
}

BASE_SYSTEM_PROMPT = (
    "You are a senior staff engineer at a FAANG company conducting a rigorous technical interview. "
    "Your interview style:\n"
    "- NEVER accept surface-level answers. Always dig deeper with 'why', 'how', 'what tradeoffs "
    "did you consider', 'what would happen if'.\n"
    "- Reference the candidate's previous answers when asking follow-ups to show you are listening "
    "and to test consistency.\n"
    "- Use scenario-based questions: 'Imagine you have 10 million users...', 'Your CEO tells you "
    "this feature must ship in 2 weeks but your estimate is 6 weeks...'\n"
    "- When a candidate gives a weak or vague answer, challenge it directly but professionally: "
    "'That sounds like a textbook answer. Can you give me a concrete example from your own experience?'\n"
    "- Adapt difficulty dynamically: if the candidate is strong, push harder with edge cases and "
    "failure modes; if they are struggling, simplify slightly but do not lower the bar.\n"
    "- Ask ONE question at a time. Keep your responses concise (2-4 sentences). Do not lecture.\n"
    "- Conduct the interview in English.\n"
    "- Your goal is to accurately assess the candidate's true depth of knowledge, not to trick them "
    "or make them feel bad. Be tough but fair."
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

    @property
    def is_finished(self) -> bool:
        return self.stage == Stage.FINISHED

    def _system_prompt(self) -> str:
        stage_overlay = STAGE_PROMPTS.get(self.stage, "")
        parts = [BASE_SYSTEM_PROMPT, f"\n\nCurrent stage: {self.stage.value}.", stage_overlay]
        if self.candidate_name:
            parts.append(f"\nCandidate name: {self.candidate_name}.")
        if self.resume_context:
            parts.append(f"\nCandidate resume context: {self.resume_context}")
            parts.append("Tailor your questions to the candidate's specific experience and skills.")
        if self.job_title:
            parts.append(f"\nThis interview is for the position: {self.job_title}.")
        if self.job_skills:
            parts.append(f"Required skills: {', '.join(self.job_skills)}.")
            parts.append("Focus technical questions on these specific skills.")
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

        resp = ask_llm_structured(
            user_text,
            stage=self.stage.value,
            history=self.history,
            resume_context=self.resume_context,
            job_context=self._job_context(),
        )

        # Run heuristic AI detection
        heuristic = analyze_answer(user_text, time_to_respond_ms, is_voice_input)

        # Combine LLM + heuristic AI detection (40% heuristic, 60% LLM)
        combined_ai = round(0.4 * heuristic.likelihood + 0.6 * resp.ai_likelihood, 2)

        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": resp.spoken_text})
        self.stage_turn_count += 1
        self.total_turns += 1

        if resp.score is not None:
            # Apply AI penalty if high likelihood
            adjusted_score = resp.score
            if combined_ai > 0.7:
                adjusted_score = round(resp.score * 0.7, 1)  # 30% penalty
            elif combined_ai > 0.5:
                adjusted_score = round(resp.score * 0.85, 1)  # 15% penalty

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
        """Record a cheating violation."""
        self.cheating_flags.append(violation)

    def get_status(self) -> dict:
        """Return current session state summary."""
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
        }
