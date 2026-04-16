"""Audio pipeline — single-turn echo-bot (Phase 5) and interview mode (Phase 6).

Single turn:
    python -m backend.main tests/audio/sample.wav

Interview mode (text-based, multi-turn):
    python -m backend.main --interview
"""
import argparse
import sys
from pathlib import Path

from backend.stt.deepgram_stt import transcribe_file
from backend.llm.groq_client import ask_llm
from backend.tts.elevenlabs_tts import synthesize
from backend.interview.engine import InterviewSession

DEFAULT_OUT = Path("tests/audio/reply.mp3")


def run_pipeline(audio_in: Path, audio_out: Path, history: list[dict] | None = None) -> dict:
    """Execute one STT → LLM → TTS turn. Returns a dict with all intermediate results."""
    print(f"[STT] Transcribing {audio_in} ...")
    transcript = transcribe_file(audio_in)
    print(f"[STT] Transcript: {transcript}")

    print("[LLM] Generating reply ...")
    reply = ask_llm(transcript, history=history)
    print(f"[LLM] Reply: {reply}")

    print(f"[TTS] Synthesizing to {audio_out} ...")
    out_path = synthesize(reply, audio_out)
    print(f"[TTS] Saved: {out_path}")

    return {"transcript": transcript, "reply": reply, "audio_out": str(out_path)}


def run_interview_turn(session: InterviewSession, audio_in: Path, audio_out: Path) -> dict:
    """Execute one interview turn: STT → engine → TTS."""
    print(f"[STT] Transcribing {audio_in} ...")
    transcript = transcribe_file(audio_in)
    print(f"[STT] Transcript: {transcript}")

    print(f"[ENGINE] Stage: {session.stage.value} | Turn: {session.total_turns + 1}")
    reply = session.turn(transcript)
    print(f"[ENGINE] Reply: {reply}")

    print(f"[TTS] Synthesizing to {audio_out} ...")
    out_path = synthesize(reply, audio_out)
    print(f"[TTS] Saved: {out_path}")

    return {
        "transcript": transcript,
        "reply": reply,
        "audio_out": str(out_path),
        "status": session.get_status(),
    }


def run_text_interview():
    """Run a full interview using text input (keyboard) for testing."""
    session = InterviewSession()
    print("=== AI Interview (text mode) ===")
    print("Type your answers. Type 'quit' to exit.\n")

    # Opening from interviewer
    opening = session.turn("Hello, I am ready for the interview.")
    print(f"Interviewer [{session.stage.value}]: {opening}\n")

    while not session.is_finished:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nInterview ended by user.")
            break

        if user_input.lower() in ("quit", "exit", "q"):
            print("Interview ended by user.")
            break

        if not user_input:
            continue

        reply = session.turn(user_input)
        print(f"\nInterviewer [{session.stage.value}]: {reply}\n")

    status = session.get_status()
    print(f"\n=== Interview Summary ===")
    print(f"Total turns: {status['total_turns']}")
    print(f"Final stage: {status['stage']}")


def main():
    parser = argparse.ArgumentParser(description="AI Interview Pipeline")
    parser.add_argument("audio_in", nargs="?", type=Path, help="Path to input .wav file")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output .mp3 path")
    parser.add_argument("--interview", action="store_true", help="Run text-based interview mode")
    args = parser.parse_args()

    if args.interview:
        run_text_interview()
        return

    if not args.audio_in:
        parser.error("audio_in is required (or use --interview for text mode)")

    if not args.audio_in.exists():
        print(f"Error: {args.audio_in} not found", file=sys.stderr)
        sys.exit(1)

    result = run_pipeline(args.audio_in, args.out)
    print(f"\nDone. Transcript: {result['transcript'][:80]}...")
    print(f"Reply: {result['reply'][:80]}...")
    print(f"Audio: {result['audio_out']}")


if __name__ == "__main__":
    main()
