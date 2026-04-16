"""Deepgram speech-to-text — file-based (prerecorded). See deepgram_streaming.py for live WebSocket."""
import os
from pathlib import Path
from dotenv import load_dotenv
from deepgram import DeepgramClient, PrerecordedOptions, FileSource

load_dotenv()


def transcribe_file(audio_path: str | Path) -> str:
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPGRAM_API_KEY missing in .env")

    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    client = DeepgramClient(api_key)
    with open(audio_path, "rb") as f:
        payload: FileSource = {"buffer": f.read()}

    options = PrerecordedOptions(
        model="nova-2",
        language="en",
        smart_format=True,
        punctuate=True,
    )
    response = client.listen.rest.v("1").transcribe_file(payload, options)
    return response.results.channels[0].alternatives[0].transcript.strip()
