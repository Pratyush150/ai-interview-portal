"""Smoke test — Interview engine stages and memory.

Tests the engine with simulated text input (no audio APIs needed).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.interview.engine import InterviewSession, Stage


def main():
    session = InterviewSession(session_id="smoke-test")

    test_inputs = [
        "Hello, I am ready for the interview.",
        "My name is Alex. I have 5 years of experience in software engineering.",
        "I recently worked on a real-time object detection system using YOLOv8.",
        "We used PyTorch for training and ONNX for deployment on edge devices.",
        "The main challenge was reducing latency below 30ms on Jetson Nano.",
        "We used TensorRT optimization and INT8 quantization.",
        "The precision dropped by about 2% but inference was 4x faster.",
    ]

    for i, text in enumerate(test_inputs):
        print(f"\n--- Turn {i + 1} ---")
        print(f"You: {text}")
        reply = session.turn(text)
        status = session.get_status()
        print(f"Interviewer [{status['stage']}]: {reply}")
        print(f"  (stage_turns={status['stage_turn_count']}, total={status['total_turns']})")

    print(f"\n=== Final status ===")
    print(session.get_status())


if __name__ == "__main__":
    main()
