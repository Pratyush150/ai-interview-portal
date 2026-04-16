"""Phase 6 — Interview engine with stages and conversation memory.

Manages a multi-stage technical interview:
    INTRO → BACKGROUND → TECHNICAL → FOLLOW_UP → WRAP_UP

Each stage has its own system prompt overlay and transition logic.
"""
from __future__ import annotations

import os
from enum import Enum
from dataclasses import dataclass, field
from dotenv import load_dotenv
from groq import Groq

load_dotenv()


class Stage(str, Enum):
    INTRO = "intro"
    BACKGROUND = "background"
    TECHNICAL = "technical"
    FOLLOW_UP = "follow_up"
    WRAP_UP = "wrap_up"
    FINISHED = "finished"


# How many user turns before auto-advancing to next stage
STAGE_TURN_LIMITS = {
    Stage.INTRO: 2,
    Stage.BACKGROUND: 3,
    Stage.TECHNICAL: 6,
    Stage.FOLLOW_UP: 4,
    Stage.WRAP_UP: 2,
}

# Next stage in the sequence
STAGE_ORDER = [Stage.INTRO, Stage.BACKGROUND, Stage.TECHNICAL, Stage.FOLLOW_UP, Stage.WRAP_UP, Stage.FINISHED]

STAGE_PROMPTS = {
    Stage.INTRO: (
        "You are starting the interview. Greet the candidate warmly. "
        "Introduce yourself as an AI technical interviewer. Ask the candidate "
        "to briefly introduce themselves. Keep it friendly and concise."
    ),
    Stage.BACKGROUND: (
        "You are in the background stage. Ask about the candidate's experience, "
        "recent projects, and technical interests. Ask one question at a time. "
        "Listen carefully and ask follow-up questions based on their answers."
    ),
    Stage.TECHNICAL: (
        "You are in the technical stage. Ask challenging but fair technical questions "
        "related to software engineering, AI/ML, or robotics based on the candidate's "
        "background. Probe deeper when answers are vague or incomplete. "
        "Ask one question at a time. Evaluate the depth of understanding."
    ),
    Stage.FOLLOW_UP: (
        "You are in the follow-up stage. Ask deeper follow-up questions based on "
        "the candidate's earlier answers. Test practical knowledge and problem-solving "
        "ability. Challenge assumptions constructively."
    ),
    Stage.WRAP_UP: (
        "You are wrapping up the interview. Summarize key strengths you observed. "
        "Ask the candidate if they have any questions. Thank them for their time. "
        "Be warm and professional."
    ),
}

BASE_SYSTEM_PROMPT = (
    "You are a professional technical interviewer specializing in software "
    "engineering, AI/ML, and robotics. Conduct interviews in English. Ask one "
    "question at a time. Keep responses concise (1-3 sentences). Be warm but "
    "rigorous."
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

    @property
    def is_finished(self) -> bool:
        return self.stage == Stage.FINISHED

    def _system_prompt(self) -> str:
        stage_overlay = STAGE_PROMPTS.get(self.stage, "")
        parts = [BASE_SYSTEM_PROMPT, f"\n\nCurrent stage: {self.stage.value}.", stage_overlay]
        if self.candidate_name:
            parts.append(f"\nCandidate name: {self.candidate_name}.")
        parts.append(
            f"\nThis is turn {self.stage_turn_count + 1} of the {self.stage.value} stage. "
            f"Total interview turns so far: {self.total_turns}."
        )
        return " ".join(parts)

    def _should_advance(self) -> bool:
        limit = STAGE_TURN_LIMITS.get(self.stage, 3)
        return self.stage_turn_count >= limit

    def _advance_stage(self) -> None:
        idx = STAGE_ORDER.index(self.stage)
        if idx + 1 < len(STAGE_ORDER):
            self.stage = STAGE_ORDER[idx + 1]
            self.stage_turn_count = 0

    def turn(self, user_text: str) -> str:
        """Process one candidate utterance and return the interviewer response."""
        if self.is_finished:
            return "The interview has concluded. Thank you for participating!"

        api_key = os.getenv("GROQ_API_KEY")
        model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        if not api_key or api_key.startswith("PASTE"):
            raise RuntimeError("GROQ_API_KEY missing in .env")

        # Build messages with full history
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

        # Update history and counters
        self.history.append({"role": "user", "content": user_text})
        self.history.append({"role": "assistant", "content": reply})
        self.stage_turn_count += 1
        self.total_turns += 1

        # Check for stage transition
        if self._should_advance():
            self._advance_stage()

        return reply

    def get_status(self) -> dict:
        """Return current session state summary."""
        return {
            "session_id": self.session_id,
            "stage": self.stage.value,
            "stage_turn_count": self.stage_turn_count,
            "total_turns": self.total_turns,
            "is_finished": self.is_finished,
            "history_length": len(self.history),
        }
