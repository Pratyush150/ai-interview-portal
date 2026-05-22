"""Microsoft Edge TTS — free, neural female voices, no API key.

Uses the public Edge Online TTS service (the same one that powers Microsoft
Translator and Edge Read-Aloud). The `edge-tts` Python package speaks to it
directly.

**Voice selection (default: en-US-AvaMultilingualNeural).** Microsoft's
"Multilingual" neural voices (Ava, Emma) are the newest generation and
sound noticeably more human and conversational than the older voices
(Aria, Jenny). They also handle non-English names and code-y tokens
("Kubernetes", "PostgreSQL") with much less robotic prosody.

Override at runtime with `EDGE_TTS_VOICE=...`. Good alternatives:
  - en-US-AvaMultilingualNeural   (default — warmest, most natural)
  - en-US-EmmaMultilingualNeural  (slightly brighter / younger sound)
  - en-US-JennyMultilingualNeural (older but still good)
  - en-IN-NeerjaNeural            (Indian English female)
  - en-GB-SoniaNeural             (British English female)

**Pacing.** We synthesize at -5% rate (a hair slower than default) so the
delivery feels conversational rather than newsreader-fast. Override with
`EDGE_TTS_RATE=...` (e.g. `-10%`, `+0%`).
"""

from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

import edge_tts

DEFAULT_VOICE = "en-US-AvaMultilingualNeural"
DEFAULT_RATE = "-5%"

# Tech terms that Edge's neural voices habitually mispronounce. We expand
# acronyms into spaced-out letters or phonetic forms so the synthesizer
# spells them rather than guessing a syllable structure. Keep the keys
# uppercase and use word boundaries in the regex so we don't touch
# substrings inside ordinary words.
_PRONUNCIATION_FIXES: dict[str, str] = {
    "API":     "A P I",
    "APIs":    "A P Is",
    "AWS":     "A W S",
    "GCP":     "G C P",
    "SDK":     "S D K",
    "SQL":     "sequel",
    "MySQL":   "my sequel",
    "PostgreSQL": "Postgres",
    "NoSQL":   "no sequel",
    "JSON":    "Jason",
    "YAML":    "yamel",
    "JWT":     "J W T",
    "OAuth":   "oh-auth",
    "URL":     "U R L",
    "URI":     "U R I",
    "URLs":    "U R Ls",
    "REST":    "REST",  # already fine — keep for documentation
    "gRPC":    "gee R P C",
    "HTTP":    "H T T P",
    "HTTPS":   "H T T P S",
    "TCP":     "T C P",
    "UDP":     "U D P",
    "IDE":     "I D E",
    "CI":      "C I",
    "CD":      "C D",
    "CI/CD":   "C I C D",
    "DB":      "D B",
    "OS":      "O S",
    "I/O":     "I O",
    "GPU":     "G P U",
    "CPU":     "C P U",
    "RAM":     "ram",
    "K8s":     "kubernetes",
    "k8s":     "kubernetes",
    "TS":      "TypeScript",
    "JS":      "JavaScript",
    "PR":      "P R",
    "PRs":     "P Rs",
    "QA":      "Q A",
    "UX":      "U X",
    "UI":      "U I",
    "MLOps":   "M L ops",
    "LLM":     "L L M",
    "LLMs":    "L L Ms",
    "AI":      "A I",
    "ML":      "M L",
}


def _normalize_for_tts(text: str) -> str:
    """Apply pronunciation fixes word-by-word."""

    def _repl(match: re.Match[str]) -> str:
        token = match.group(0)
        return _PRONUNCIATION_FIXES.get(token, token)

    # Match runs of letters/digits/+ (so "C++", "C#" stay intact); we look
    # them up against the dict and replace only on exact hits.
    pattern = re.compile(r"[A-Za-z0-9+#/]+")
    return pattern.sub(_repl, text)


def _voice() -> str:
    return os.getenv("EDGE_TTS_VOICE", DEFAULT_VOICE)


def _rate() -> str:
    return os.getenv("EDGE_TTS_RATE", DEFAULT_RATE)


async def synthesize_async(text: str, output_path: str | Path) -> Path:
    """Render `text` to an MP3 at `output_path`. Returns the path."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    normalized = _normalize_for_tts(text)
    communicate = edge_tts.Communicate(normalized, _voice(), rate=_rate())
    await communicate.save(str(output_path))
    return output_path


def synthesize(text: str, output_path: str | Path) -> Path:
    """Sync wrapper — runs the async generator on a private event loop.

    The api.py audio-turn handler offloads this to `asyncio.to_thread`, so
    we deliberately spin a fresh loop here instead of touching the running
    one.
    """
    return asyncio.run(synthesize_async(text, output_path))
