"""Smoke test: transcribe tests/audio/sample.wav via Deepgram.
Usage: python tests/smoke_stt.py
Drop any short .wav in tests/audio/sample.wav first."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.stt.deepgram_stt import transcribe_file

audio = Path(__file__).parent / "audio" / "sample.wav"
print(f"Transcribing {audio} ...")
text = transcribe_file(audio)
print(f"Transcript: {text!r}")
