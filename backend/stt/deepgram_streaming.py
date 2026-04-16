"""Phase 8 — Deepgram real-time streaming STT via WebSocket.

Provides an async streaming transcriber that yields partial and final
transcripts as audio chunks arrive. Designed for integration with
FastAPI WebSocket endpoints (Phase 9).
"""
from __future__ import annotations

import os
import asyncio
from dataclasses import dataclass, field
from dotenv import load_dotenv
from deepgram import (
    DeepgramClient,
    LiveOptions,
    LiveTranscriptionEvents,
)

load_dotenv()


@dataclass
class StreamingTranscriber:
    """Wraps Deepgram live transcription with callback-driven results."""
    transcript_parts: list[str] = field(default_factory=list)
    final_transcript: str = ""
    is_done: bool = False
    _connection: object = field(default=None, repr=False)
    _client: object = field(default=None, repr=False)

    # Callbacks — set by caller
    on_partial: object = None   # callable(str) for interim results
    on_final: object = None     # callable(str) for utterance-final results
    on_error: object = None     # callable(Exception)

    def _get_client(self) -> DeepgramClient:
        api_key = os.getenv("DEEPGRAM_API_KEY")
        if not api_key:
            raise RuntimeError("DEEPGRAM_API_KEY missing in .env")
        return DeepgramClient(api_key)

    async def start(self) -> None:
        """Open the WebSocket connection to Deepgram."""
        self._client = self._get_client()
        self._connection = self._client.listen.asyncwebsocket.v("1")

        self._connection.on(LiveTranscriptionEvents.Transcript, self._on_transcript)
        self._connection.on(LiveTranscriptionEvents.Error, self._on_error)

        options = LiveOptions(
            model="nova-2",
            language="en",
            smart_format=True,
            punctuate=True,
            interim_results=True,
            utterance_end_ms="1500",
            vad_events=True,
            encoding="linear16",
            sample_rate=16000,
            channels=1,
        )
        await self._connection.start(options)

    async def send_audio(self, chunk: bytes) -> None:
        """Send a chunk of raw audio bytes to Deepgram."""
        if self._connection:
            await self._connection.send(chunk)

    async def finish(self) -> str:
        """Close the connection and return the full transcript."""
        if self._connection:
            await self._connection.finish()
        self.is_done = True
        self.final_transcript = " ".join(self.transcript_parts).strip()
        return self.final_transcript

    async def _on_transcript(self, _self, result, **kwargs):
        """Handle transcript events from Deepgram."""
        try:
            transcript = result.channel.alternatives[0].transcript
            if not transcript:
                return

            is_final = result.is_final

            if is_final:
                self.transcript_parts.append(transcript)
                if self.on_final:
                    result = self.on_final(transcript)
                    if asyncio.iscoroutine(result):
                        await result
            else:
                if self.on_partial:
                    result = self.on_partial(transcript)
                    if asyncio.iscoroutine(result):
                        await result
        except (IndexError, AttributeError):
            pass

    async def _on_error(self, _self, error, **kwargs):
        """Handle error events from Deepgram."""
        if self.on_error:
            self.on_error(error)


async def transcribe_stream(audio_chunks: list[bytes]) -> str:
    """Convenience function: transcribe a list of audio chunks and return full text.

    Useful for testing the streaming path with pre-chunked audio data.
    """
    transcriber = StreamingTranscriber()
    await transcriber.start()

    for chunk in audio_chunks:
        await transcriber.send_audio(chunk)
        await asyncio.sleep(0.05)  # simulate real-time pacing

    return await transcriber.finish()
