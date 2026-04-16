"""Smoke test — full pipeline (STT → LLM → TTS).

Requires tests/audio/sample.wav to exist.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.main import run_pipeline

AUDIO_IN = Path(__file__).resolve().parent / "audio" / "sample.wav"
AUDIO_OUT = Path(__file__).resolve().parent / "audio" / "reply.mp3"


def main():
    if not AUDIO_IN.exists():
        print(f"⚠ Drop a .wav file at {AUDIO_IN} first")
        sys.exit(1)

    result = run_pipeline(AUDIO_IN, AUDIO_OUT)
    print("\n=== Pipeline result ===")
    print(f"Transcript : {result['transcript']}")
    print(f"LLM reply  : {result['reply']}")
    print(f"Audio out  : {result['audio_out']}")


if __name__ == "__main__":
    main()
