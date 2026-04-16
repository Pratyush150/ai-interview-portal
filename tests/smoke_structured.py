"""Smoke test — Structured JSON LLM output (Phase 7).

Tests structured responses with evaluation scoring.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.interview.engine import InterviewSession


def main():
    session = InterviewSession(session_id="structured-test", use_structured=True)

    test_inputs = [
        "Hello, I'm ready for the interview.",
        "I'm a software engineer with 3 years of experience in Python and ML.",
        "I built a recommendation engine using collaborative filtering with PyTorch.",
        "We used matrix factorization and handled the cold-start problem with content-based fallback.",
    ]

    for i, text in enumerate(test_inputs):
        print(f"\n{'='*60}")
        print(f"Turn {i + 1} | You: {text}")
        print(f"{'='*60}")

        resp = session.turn_structured(text)

        print(f"Spoken : {resp.spoken_text}")
        print(f"Score  : {resp.score}")
        print(f"Topic  : {resp.topic}")
        print(f"Strengths : {resp.strengths}")
        print(f"Weaknesses: {resp.weaknesses}")
        print(f"Advance?  : {resp.suggest_advance}")

    status = session.get_status()
    print(f"\n{'='*60}")
    print(f"Final Status: {status}")
    print(f"Evaluations: {session.evaluations}")


if __name__ == "__main__":
    main()
