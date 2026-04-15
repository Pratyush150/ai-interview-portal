"""Smoke test: synthesize speech via ElevenLabs (Rachel voice).
Usage: python tests/smoke_tts.py
Outputs tests/audio/output_tts.mp3 — open in any player."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.tts.elevenlabs_tts import synthesize

out = Path(__file__).parent / "audio" / "output_tts.mp3"
text = "Hello. I am your AI interviewer. Let us begin with a simple question. Can you tell me about yourself?"
path = synthesize(text, out)
print(f"Wrote {path}")
