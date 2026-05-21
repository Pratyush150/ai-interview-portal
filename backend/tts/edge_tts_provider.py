"""Microsoft Edge TTS — free, neural female voices, no API key.

Uses the public Edge Online TTS service (the same one that powers Microsoft
Translator and Edge Read-Aloud). The `edge-tts` Python package speaks to it
directly. We use **Aria Neural** by default — the most natural female voice
available without payment.

Override at runtime with `EDGE_TTS_VOICE=...` (e.g. `en-US-JennyNeural`,
`en-IN-NeerjaNeural`, `en-GB-SoniaNeural`).
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import edge_tts

DEFAULT_VOICE = "en-US-AriaNeural"


def _voice() -> str:
    return os.getenv("EDGE_TTS_VOICE", DEFAULT_VOICE)


async def synthesize_async(text: str, output_path: str | Path) -> Path:
    """Render `text` to an MP3 at `output_path`. Returns the path."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, _voice())
    await communicate.save(str(output_path))
    return output_path


def synthesize(text: str, output_path: str | Path) -> Path:
    """Sync wrapper — runs the async generator on a private event loop.

    The api.py audio-turn handler offloads this to `asyncio.to_thread`, so
    we deliberately spin a fresh loop here instead of touching the running
    one.
    """
    return asyncio.run(synthesize_async(text, output_path))
