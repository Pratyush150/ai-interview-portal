"""ElevenLabs text-to-speech. Saves MP3 to disk; playback handled by caller."""
import os
from pathlib import Path
from dotenv import load_dotenv
from elevenlabs.client import ElevenLabs

load_dotenv()


def synthesize(text: str, output_path: str | Path) -> Path:
    api_key = os.getenv("ELEVENLABS_API_KEY")
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
    if not api_key:
        raise RuntimeError("ELEVENLABS_API_KEY missing in .env")

    client = ElevenLabs(api_key=api_key)
    audio_stream = client.text_to_speech.convert(
        voice_id=voice_id,
        model_id="eleven_turbo_v2_5",
        output_format="mp3_44100_128",
        text=text,
    )

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        for chunk in audio_stream:
            if chunk:
                f.write(chunk)
    return output_path
