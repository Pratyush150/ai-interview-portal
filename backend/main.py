"""Phase 5 — Audio pipeline echo-bot.

Wires STT → LLM → TTS into a single turn:
    audio_in.wav → transcript → LLM reply → reply.mp3

Usage:
    python -m backend.main tests/audio/sample.wav
    python -m backend.main tests/audio/sample.wav --out tests/audio/reply.mp3
"""
import argparse
import sys
from pathlib import Path

from backend.stt.deepgram_stt import transcribe_file
from backend.llm.groq_client import ask_llm
from backend.tts.elevenlabs_tts import synthesize

DEFAULT_OUT = Path("tests/audio/reply.mp3")


def run_pipeline(audio_in: Path, audio_out: Path, history: list[dict] | None = None) -> dict:
    """Execute one STT → LLM → TTS turn. Returns a dict with all intermediate results."""
    # 1. Speech-to-text
    print(f"[STT] Transcribing {audio_in} ...")
    transcript = transcribe_file(audio_in)
    print(f"[STT] Transcript: {transcript}")

    # 2. LLM
    print("[LLM] Generating reply ...")
    reply = ask_llm(transcript, history=history)
    print(f"[LLM] Reply: {reply}")

    # 3. Text-to-speech
    print(f"[TTS] Synthesizing to {audio_out} ...")
    out_path = synthesize(reply, audio_out)
    print(f"[TTS] Saved: {out_path}")

    return {
        "transcript": transcript,
        "reply": reply,
        "audio_out": str(out_path),
    }


def main():
    parser = argparse.ArgumentParser(description="AI Interview Pipeline — single turn")
    parser.add_argument("audio_in", type=Path, help="Path to input .wav file")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="Output .mp3 path")
    args = parser.parse_args()

    if not args.audio_in.exists():
        print(f"Error: {args.audio_in} not found", file=sys.stderr)
        sys.exit(1)

    result = run_pipeline(args.audio_in, args.out)
    print(f"\nDone. Transcript: {result['transcript'][:80]}...")
    print(f"Reply: {result['reply'][:80]}...")
    print(f"Audio: {result['audio_out']}")


if __name__ == "__main__":
    main()
