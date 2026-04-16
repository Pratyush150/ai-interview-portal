"""Smoke test — Deepgram streaming STT (Phase 8).

Reads a .wav file, chunks it, and sends through the streaming transcriber.
Requires tests/audio/sample.wav to exist.
"""
import sys
import asyncio
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.stt.deepgram_streaming import StreamingTranscriber

AUDIO_IN = Path(__file__).resolve().parent / "audio" / "sample.wav"
CHUNK_SIZE = 4096  # bytes per chunk


def partials_printer(text: str):
    print(f"  [partial] {text}")


def finals_printer(text: str):
    print(f"  [FINAL]   {text}")


async def main():
    if not AUDIO_IN.exists():
        print(f"Drop a .wav file at {AUDIO_IN} first")
        sys.exit(1)

    print(f"Streaming {AUDIO_IN} to Deepgram ...")

    transcriber = StreamingTranscriber(
        on_partial=partials_printer,
        on_final=finals_printer,
    )
    await transcriber.start()

    with open(AUDIO_IN, "rb") as f:
        # Skip WAV header (44 bytes)
        f.read(44)
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            await transcriber.send_audio(chunk)
            await asyncio.sleep(0.05)

    transcript = await transcriber.finish()
    print(f"\nFull transcript: {transcript}")


if __name__ == "__main__":
    asyncio.run(main())
