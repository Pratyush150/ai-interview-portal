"""Deepgram speech-to-text — file-based (prerecorded). See deepgram_streaming.py for live WebSocket."""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from dotenv import load_dotenv
from deepgram import DeepgramClient, DeepgramClientOptions, PrerecordedOptions, FileSource
import httpx

load_dotenv()

log = logging.getLogger(__name__)


class STTTimeout(Exception):
    """Raised when Deepgram couldn't be reached after all retries."""


# Deepgram defaults push httpx into a very tight write budget (~5s) which is
# not enough for 20-40 second candidate answers over slow/NAT'd networks like
# WSL2. We bump connect/read/write generously. Nova-2's server-side processing
# is usually under 2s, so the main budget we need is upload.
_DG_TIMEOUT = httpx.Timeout(
    connect=30.0,
    read=60.0,
    write=60.0,
    pool=10.0,
)


def _client() -> DeepgramClient:
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPGRAM_API_KEY missing in .env")
    opts = DeepgramClientOptions(verbose=logging.WARNING)
    # The Deepgram SDK accepts a dict of options that is forwarded into
    # httpx.Client kwargs. `timeout` is the one we need to extend.
    opts.options = {"timeout": _DG_TIMEOUT}
    return DeepgramClient(api_key, opts)


def transcribe_file(audio_path: str | Path, *, max_attempts: int = 3) -> str:
    """Transcribe with retry on transient upload / request timeouts.

    Raises STTTimeout after max_attempts, so the API layer can return a
    user-friendly 503 instead of a raw 500 stack trace.
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    # Read bytes once — no need to hit disk on every retry.
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    options = PrerecordedOptions(
        model="nova-2",
        language="en",
        smart_format=True,
        punctuate=True,
    )

    last_exc: Exception | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            client = _client()
            payload: FileSource = {"buffer": audio_bytes}
            response = client.listen.rest.v("1").transcribe_file(payload, options)
            return response.results.channels[0].alternatives[0].transcript.strip()
        except (
            httpx.WriteTimeout, httpx.ReadTimeout, httpx.ConnectTimeout, httpx.PoolTimeout,
        ) as e:
            last_exc = e
            log.warning("Deepgram httpx timeout on attempt %d/%d: %s",
                        attempt, max_attempts, type(e).__name__)
        except Exception as e:
            # Includes DeepgramApiError(408 Request Timeout). Retry those too.
            msg = str(e)
            is_timeout = "408" in msg or "timeout" in msg.lower()
            last_exc = e
            log.warning("Deepgram error on attempt %d/%d (%s): %s",
                        attempt, max_attempts,
                        "retryable" if is_timeout else "non-retryable", e)
            if not is_timeout:
                # Non-retryable — re-raise immediately.
                raise

        # Exponential backoff: 0.5s, 1.5s (skipped after final attempt).
        if attempt < max_attempts:
            time.sleep(0.5 * (2 ** (attempt - 1)))

    raise STTTimeout(
        f"Deepgram unreachable after {max_attempts} attempts: {last_exc}"
    ) from last_exc
