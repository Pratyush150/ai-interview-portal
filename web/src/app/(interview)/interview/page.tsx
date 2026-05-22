"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  PhoneOff,
  Wifi,
  Captions,
  Sparkles,
  Clock,
  AlertTriangle,
  Send,
  VideoOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AudioWaveform,
  type WaveState,
} from "@/components/app/audio-waveform";
import {
  CodeEditor,
  type CodeLanguage,
} from "@/components/app/code-editor";
import { PreInterviewCheck } from "@/components/app/pre-interview-check";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  audioUrl as resolveAudio,
  createSession,
  getSession,
  postAudioTurn,
  postTextTurn,
  type TurnResponse,
} from "@/lib/api";
import { InterviewReport } from "@/components/app/interview-report";

// ───────────────────────────────────────────────────────────────────────────
// Live interview surface
// Reads ?session=<id> from the URL to resume an existing session, or
// auto-creates one via POST /api/session if absent. Wraps the page in Suspense
// because useSearchParams() requires it for static export.
// ───────────────────────────────────────────────────────────────────────────

export default function InterviewPageWrapper() {
  return (
    <Suspense fallback={<FullScreenLoading />}>
      <LiveInterviewPage />
    </Suspense>
  );
}

function FullScreenLoading() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Skeleton className="h-32 w-80" />
    </div>
  );
}

type Phase = "check" | "live" | "ended";
type TalkRole = "interviewer" | "candidate";

interface TurnLine {
  role: TalkRole;
  text: string;
}

const STARTER_CODE: Record<CodeLanguage, string> = {
  python: "# Use this scratch buffer if the interviewer asks for code.\n",
  javascript: "// Use this scratch buffer if the interviewer asks for code.\n",
  typescript: "// Use this scratch buffer if the interviewer asks for code.\n",
  go: "// Use this scratch buffer if the interviewer asks for code.\npackage main\n",
  java: "// Use this scratch buffer if the interviewer asks for code.\n",
  cpp: "// Use this scratch buffer if the interviewer asks for code.\n",
  rust: "// Use this scratch buffer if the interviewer asks for code.\n",
  sql: "-- Use this scratch buffer if the interviewer asks for code.\n",
};

function LiveInterviewPage() {
  const params = useSearchParams();
  const router = useRouter();
  const explicitSession = params.get("session");
  const inviteToken = params.get("invite");
  const candidateName =
    params.get("name") ?? (inviteToken ? "" : "Candidate");

  const [phase, setPhase] = React.useState<Phase>("check");
  const [sessionId, setSessionId] = React.useState<string | null>(
    explicitSession,
  );
  const [stage, setStage] = React.useState<string>("intro");
  const [turnCount, setTurnCount] = React.useState(0);
  const [aiState, setAiState] = React.useState<WaveState>("idle");
  const [transcript, setTranscript] = React.useState<TurnLine[]>([]);
  const [showCaptions, setShowCaptions] = React.useState(true);
  const [muted, setMuted] = React.useState(false);
  const [paused, setPaused] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);
  const [language, setLanguage] = React.useState<CodeLanguage>("python");
  const [code, setCode] = React.useState(STARTER_CODE.python);
  const [amplitude, setAmplitude] = React.useState(0);
  const [recording, setRecording] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  // Full text of the question being asked. The visible-up-to-here index is
  // tracked separately so we can scrub the caption in lock-step with TTS.
  const [currentQuestion, setCurrentQuestion] = React.useState<string>(
    "Loading interview…",
  );
  const [captionVisibleChars, setCaptionVisibleChars] = React.useState(0);
  const [showCodePanel, setShowCodePanel] = React.useState(false);
  const [textFallback, setTextFallback] = React.useState("");
  const [textMode, setTextMode] = React.useState(false);
  const [interviewerName, setInterviewerName] = React.useState<string>("Sara");
  const [targetMinutes, setTargetMinutes] = React.useState<number>(22);
  const [lastScore, setLastScore] = React.useState<number | null>(null);

  // ─── Refs ───
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const ampRafRef = React.useRef<number | null>(null);
  const ttsAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [cameraOn, setCameraOn] = React.useState(false);

  // Callback ref: any time a <video> element mounts (the big right-side
  // panel OR the corner tile when the code editor is showing), attach
  // the captured stream immediately. Survives layout switches because
  // both <video> elements use this same ref callback.
  const setVideoEl = React.useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (!el) return;
    const s = streamRef.current;
    if (s && s.getVideoTracks().length > 0 && el.srcObject !== s) {
      el.srcObject = s;
      const tryPlay = () =>
        el.play().catch((err) => console.warn("video play rejected:", err));
      if (el.readyState >= 1) tryPlay();
      else el.onloadedmetadata = tryPlay;
    }
  }, []);

  // ─── Elapsed timer ───
  React.useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => {
      if (!paused) setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [phase, paused]);

  // ─── Cleanup on unmount ───
  React.useEffect(() => {
    return () => {
      stopMic();
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Bind the camera stream to whatever <video> element is currently
  // mounted (the big right panel OR the corner tile in code-editor mode).
  // The callback ref handles initial mount; this effect catches the case
  // where the stream arrives AFTER the element is already mounted.
  React.useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraOn || !video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    const tryPlay = () => {
      video.play().catch((err) =>
        console.warn("camera play() rejected:", err),
      );
    };
    if (video.readyState >= 1) tryPlay();
    else video.onloadedmetadata = tryPlay;
  }, [cameraOn, phase, showCodePanel]);

  // ─── Begin: pre-flight checks done → create session if needed → ask first Q ───
  async function beginInterview() {
    setPhase("live");
    try {
      let id = sessionId;
      if (!id) {
        const sess = await createSession({
          candidate_name: candidateName || undefined,
          invite_token: inviteToken ?? undefined,
        });
        id = sess.session_id;
        setSessionId(id);
        setStage(sess.stage);
        setInterviewerName(sess.interviewer_name || "Sara");
        if (sess.target_duration_min) setTargetMinutes(sess.target_duration_min);
      } else {
        // Resuming an existing session — pull its metadata.
        try {
          const sess = await getSession(id);
          setStage(sess.stage);
          setInterviewerName(sess.interviewer_name || "Sara");
          if (sess.target_duration_min) setTargetMinutes(sess.target_duration_min);
        } catch {
          /* keep defaults */
        }
      }
      // Open the mic stream early so subsequent record/stop is instant.
      await openMic();
      // Kick off by sending an empty "hello" so the LLM produces the intro Q.
      await ask(id, "Hello, I'm ready to begin.");
    } catch (e) {
      console.error(e);
      toast.error(
        "Couldn't start the interview. Check that the backend is running.",
      );
      setPhase("check");
    }
  }

  // ─── Open microphone (and camera) ───
  //
  // We ask for audio+video in a single prompt — that's also what the
  // pre-interview check told the candidate would happen. If the camera
  // permission is denied or the device has no camera, we gracefully fall
  // back to audio-only so the interview can still proceed.
  //
  // Important: getUserMedia requires a secure context (HTTPS or
  // http://localhost). On a plain-HTTP deploy (e.g. an Oracle VM IP
  // without TLS), the call rejects with NotAllowedError before the
  // permission prompt ever appears. Surface that clearly.
  async function openMic() {
    if (streamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error(
        "Your browser blocks mic/camera on insecure pages. Open the site over HTTPS (or via localhost).",
      );
      throw new Error("getUserMedia unavailable (insecure context)");
    }
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
    } catch (err) {
      console.warn("Camera unavailable, falling back to audio-only", err);
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      toast.warning(
        "Couldn't access your camera. The interview will continue with audio only.",
      );
    }
    streamRef.current = stream;
    // Flip cameraOn based on whether we actually got a video track.
    // The actual srcObject → <video> binding happens in a useEffect below
    // so that React has committed the visible state before play() runs
    // (Chrome silently rejects play() on a display:none video element).
    setCameraOn(stream.getVideoTracks().length > 0);
    // Set up amplitude analyser for the waveform.
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);
    analyserRef.current = analyser;
    ampLoop();
  }

  function ampLoop() {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i]! - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      // Boost lows so the waveform feels reactive
      setAmplitude(Math.min(1, rms * 2.4));
      ampRafRef.current = requestAnimationFrame(tick);
    };
    ampRafRef.current = requestAnimationFrame(tick);
  }

  function stopMic() {
    if (ampRafRef.current) cancelAnimationFrame(ampRafRef.current);
    ampRafRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      try {
        recorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOn(false);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  }

  // ─── Begin recording the candidate's answer ───
  //
  // Now that the captured stream contains BOTH audio and video tracks
  // (since we added the camera feed), we must hand MediaRecorder an
  // audio-only view. Passing the mixed stream while requesting an
  // audio/webm mimeType makes some Chromium builds throw
  // NotSupportedError, which previously fell straight into text-mode
  // fallback — the bug the user reported.
  function startRecording() {
    if (!streamRef.current || muted) return;
    const audioTracks = streamRef.current.getAudioTracks();
    if (audioTracks.length === 0) {
      console.error("No audio tracks on stream");
      toast.error("Microphone isn't available. Falling back to text.");
      setTextMode(true);
      return;
    }
    const audioOnly = new MediaStream(audioTracks);
    // Pick the first supported mimeType. Chrome/Edge/Firefox all support
    // webm/opus; Safari prefers mp4. We pass the chosen type to the Blob
    // too so the backend receives the right Content-Type.
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    const mimeType =
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported
        ? candidates.find((m) => MediaRecorder.isTypeSupported(m))
        : undefined;
    try {
      const rec = mimeType
        ? new MediaRecorder(audioOnly, { mimeType })
        : new MediaRecorder(audioOnly);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || mimeType || "audio/webm",
        });
        if (blob.size < 3000) {
          toast.warning("That was very short — try again.");
          setRecording(false);
          setAiState("listening");
          startRecording();
          return;
        }
        submitAudio(blob);
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setAiState("listening");
    } catch (e) {
      console.error("MediaRecorder failed", e);
      toast.error("Recording failed. Falling back to text.");
      setTextMode(true);
    }
  }

  function stopRecording() {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      setRecording(false);
    }
  }

  async function submitAudio(blob: Blob) {
    if (!sessionId) return;
    setSubmitting(true);
    setAiState("thinking");
    try {
      const turn = await postAudioTurn(sessionId, blob);
      handleTurnResponse(turn);
    } catch (e) {
      const err = e as Error & { status?: number; detail?: unknown };
      if (err.status === 503) {
        toast.error("Speech service timed out. Try again.");
      } else if (err.status === 400) {
        toast.warning("I didn't catch that. Could you repeat?");
      } else {
        toast.error("Couldn't process that turn. Try again.");
      }
      setAiState("listening");
      // Re-arm mic if the candidate wants to retry
      if (!muted) startRecording();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitText() {
    if (!sessionId || !textFallback.trim()) return;
    setSubmitting(true);
    setAiState("thinking");
    const sent = textFallback;
    setTextFallback("");
    try {
      const turn = await postTextTurn(sessionId, sent);
      setTranscript((t) => [...t, { role: "candidate", text: sent }]);
      handleTurnResponse(turn);
    } catch {
      toast.error("Couldn't submit your answer.");
      setAiState("idle");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render and speak the AI's reply ───
  async function handleTurnResponse(turn: TurnResponse) {
    if (turn.transcript) {
      setTranscript((t) => [
        ...t,
        { role: "candidate", text: turn.transcript! },
      ]);
    }
    setStage(turn.stage);
    setTurnCount(turn.total_turns);
    if (turn.last_turn_score != null) setLastScore(turn.last_turn_score);
    // Set the full text up front but reveal 0 chars — the speak() routine
    // advances captionVisibleChars in lock-step with the actual TTS
    // playback (Web Speech onboundary, or audio.currentTime for server TTS).
    setCurrentQuestion(turn.reply);
    setCaptionVisibleChars(0);
    setTranscript((t) => [...t, { role: "interviewer", text: turn.reply }]);

    // Heuristic: surface the code panel for technical/follow-up stages.
    setShowCodePanel(turn.stage === "core" || turn.stage === "follow_up" || turn.stage === "technical");

    if (turn.is_finished) {
      await speak(turn.reply, turn.audio_url);
      // Reveal the rest of the caption as a safety net before transitioning.
      setCaptionVisibleChars(turn.reply.length);
      setPhase("ended");
      return;
    }
    setAiState("speaking");
    await speak(turn.reply, turn.audio_url);
    setCaptionVisibleChars(turn.reply.length);
    setAiState("idle");
    // Auto-arm the mic 800ms after the interviewer stops speaking.
    setTimeout(() => {
      if (!muted && !paused && !textMode) startRecording();
    }, 800);
  }

  /** Plays the reply and SCRUBS the visible caption to match TTS playback.
   *
   * Server-TTS path (<audio>): we estimate per-character timing from the
   * audio's metadata duration once it's known, and tick captionVisibleChars
   * up as audio.currentTime advances — closed loop.
   *
   * Browser-TTS path (Web Speech): SpeechSynthesisUtterance.onboundary fires
   * a 'word' boundary event with charIndex — we feed that straight in. This
   * is the cleanest sync we can get without inventing timestamps. */
  function speak(text: string, audio_url: string | null): Promise<void> {
    return new Promise((resolve) => {
      const total = text.length;
      const url = resolveAudio(audio_url);

      if (url) {
        const audio = new Audio(url);
        ttsAudioRef.current = audio;
        let interval: ReturnType<typeof setInterval> | null = null;
        const cleanup = () => {
          if (interval) {
            clearInterval(interval);
            interval = null;
          }
        };
        audio.onloadedmetadata = () => {
          const dur = isFinite(audio.duration) ? audio.duration : Math.max(1, text.length * 0.06);
          interval = setInterval(() => {
            if (audio.duration > 0) {
              const frac = audio.currentTime / dur;
              const visible = Math.max(0, Math.min(total, Math.floor(frac * total) + 1));
              setCaptionVisibleChars(visible);
            }
          }, 60);
        };
        audio.onended = () => {
          cleanup();
          setCaptionVisibleChars(total);
          resolve();
        };
        audio.onerror = () => {
          cleanup();
          setCaptionVisibleChars(total);
          resolve();
        };
        audio.play().catch(() => {
          cleanup();
          setCaptionVisibleChars(total);
          resolve();
        });
        // Safety timeout: bound by audio's likely length plus a generous margin.
        setTimeout(() => {
          cleanup();
          resolve();
        }, Math.max(12000, text.length * 90));
        return;
      }

      if (typeof window === "undefined" || !window.speechSynthesis) {
        // No TTS available — reveal the caption over an estimated read-time.
        const estMs = Math.min(15000, text.length * 60);
        const start = Date.now();
        const interval = setInterval(() => {
          const f = Math.min(1, (Date.now() - start) / estMs);
          setCaptionVisibleChars(Math.floor(f * total));
          if (f >= 1) clearInterval(interval);
        }, 50);
        setTimeout(() => {
          clearInterval(interval);
          setCaptionVisibleChars(total);
          resolve();
        }, estMs + 200);
        return;
      }

      // Chrome can leave the speech synth in a paused state after a tab
      // switch / autoplay-policy gate. Resuming + cancelling pending utterances
      // is the documented workaround. Without this, speak() silently no-ops.
      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.cancel();
      } catch {}

      // Voices load asynchronously in Chrome. If getVoices() is still empty,
      // wait one tick for `voiceschanged` before speaking — otherwise the
      // utterance fires with no voice attached and produces no audio.
      const startSpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        const enVoice =
          voices.find((v) => /en[-_]US/i.test(v.lang) && /female|samantha|zira|jenny|aria/i.test(v.name)) ||
          voices.find((v) => /en[-_]US/i.test(v.lang)) ||
          voices.find((v) => /^en/i.test(v.lang)) ||
          voices[0];
        speakWith(enVoice);
      };
      if (window.speechSynthesis.getVoices().length === 0) {
        const onVoices = () => {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
          startSpeak();
        };
        window.speechSynthesis.addEventListener("voiceschanged", onVoices);
        // Hard fallback: speak after 600 ms even if voices never arrive.
        setTimeout(() => {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
          startSpeak();
        }, 600);
      } else {
        startSpeak();
      }
      return;

      function speakWith(voice: SpeechSynthesisVoice | undefined) {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      utter.pitch = 1;
      utter.lang = "en-US";
      if (voice) utter.voice = voice;
      // The browser fires onboundary per word with charIndex — scrub the
      // caption to cover up-to-AND-including the current word. Some browsers
      // (Safari) don't fire it; we fall back to a time-based ramp.
      let gotBoundary = false;
      utter.onboundary = (ev) => {
        gotBoundary = true;
        const idx = (ev.charIndex ?? 0) + (ev.charLength ?? 0);
        setCaptionVisibleChars(Math.max(captionVisibleChars, Math.min(total, idx + 1)));
      };
      // Time-based fallback for browsers without onboundary support. We use
      // 165 wpm ≈ 12 chars/sec — close to default Web Speech rate.
      const rampStart = Date.now();
      const fallbackMsTotal = Math.max(800, (total / 12) * 1000);
      const fallback = setInterval(() => {
        if (gotBoundary) return; // boundary takes over
        const f = Math.min(1, (Date.now() - rampStart) / fallbackMsTotal);
        setCaptionVisibleChars(Math.floor(f * total));
      }, 60);
      const finish = () => {
        clearInterval(fallback);
        setCaptionVisibleChars(total);
        resolve();
      };
      utter.onend = finish;
      utter.onerror = (ev) => {
        // Common causes: voice not installed, autoplay policy, or the synth
        // is in a stuck "paused" state. We surface the reason in the console
        // so a recruiter / candidate can see why no audio played.
        console.warn(
          "[TTS] Web Speech utterance error:",
          (ev as SpeechSynthesisErrorEvent).error || "unknown",
          "— check that your browser has at least one English voice installed.",
        );
        finish();
      };
      try {
        window.speechSynthesis.speak(utter);
      } catch (err) {
        console.warn("[TTS] speechSynthesis.speak threw:", err);
        finish();
      }
      // Chrome silent-fail guard.
      setTimeout(() => {
        clearInterval(fallback);
        resolve();
      }, Math.max(10000, text.length * 90));
      }
    });
  }

  // ─── Initial prompt: empty hello to elicit the first interviewer question ───
  async function ask(id: string, hello: string) {
    setAiState("thinking");
    try {
      const turn = await postTextTurn(id, hello);
      handleTurnResponse(turn);
    } catch {
      toast.error("The interviewer didn't respond.");
      setAiState("idle");
    }
  }

  function onMicButton() {
    if (muted) {
      setMuted(false);
      if (!recording) startRecording();
      return;
    }
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function takeAMoment() {
    setPaused(true);
    if (recording) stopRecording();
    if (typeof window !== "undefined") window.speechSynthesis?.pause();
    toast("Take 30 seconds. We'll resume when you're ready.", {
      duration: 30_000,
    });
    setTimeout(() => {
      setPaused(false);
      if (typeof window !== "undefined") window.speechSynthesis?.resume();
    }, 30_000);
  }

  function endInterview() {
    stopRecording();
    stopMic();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setPhase("ended");
    toast.success("Interview ended.");
  }

  // ─── Phases ───

  if (phase === "check") {
    return (
      <PreInterviewCheck
        candidateName={candidateName || "there"}
        roleTitle="Live AI Interview"
        onReady={beginInterview}
      />
    );
  }

  if (phase === "ended") {
    return (
      <InterviewReport
        sessionId={sessionId}
        elapsedSec={elapsed}
        turnCount={turnCount}
        candidateAnswers={transcript.filter((t) => t.role === "candidate").length}
        interviewerName={interviewerName}
        onBackToDashboard={() => router.push("/dashboard/")}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
        <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
          <Sparkles className="size-3.5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">
            {interviewerName} · Vaani Interview
          </div>
          <div className="text-[11px] text-muted-foreground tabular">
            {sessionId ? `Session ${sessionId.slice(0, 8)}` : "Connecting…"} ·{" "}
            <span className="capitalize">{stage.replace("_", " ")}</span>
          </div>
        </div>
        <Badge variant="outline" className="ml-2 hidden gap-1.5 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-[var(--danger)] animate-pulse" />
          Recording
        </Badge>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs">
          <StageProgress stage={stage} />
          <ConnectionIndicator />
          <span className="tabular text-muted-foreground">
            <Clock className="mr-1 inline size-3" />
            {formatDuration(elapsed * 1000)} /{" "}
            {String(targetMinutes).slice(0, 4)}m
          </span>
          <Badge variant="outline" className="tabular">
            Turn {turnCount}
          </Badge>
          {lastScore != null && (
            <Badge variant="primary" className="tabular">
              Last: {lastScore.toFixed(1)}
            </Badge>
          )}
        </div>
      </header>

      {/* Main */}
      <div
        className={cn(
          "grid flex-1 grid-cols-1 overflow-hidden",
          // No code editor: 50/50 — audio on the left, BIG camera on the right.
          // Code editor showing: shrink audio col, give code 1.4fr; camera
          // demotes to a corner tile inside the audio column.
          showCodePanel
            ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
            : "md:grid-cols-2",
        )}
      >
        <div className="relative flex flex-col items-center justify-center gap-6 border-b border-border p-6 md:border-b-0 md:border-r">
          {/* Corner camera tile — ONLY when code editor is showing. Uses
              the same setVideoEl callback ref as the big panel below, so
              the stream attaches whichever element is currently mounted. */}
          {showCodePanel && (
            <div className="absolute right-4 top-4 z-10 h-[140px] w-[200px] overflow-hidden rounded-lg border-2 border-border bg-black shadow-lg md:h-[180px] md:w-[260px]">
              <video
                ref={setVideoEl}
                autoPlay
                playsInline
                muted
                className={cn(
                  "h-full w-full object-cover [transform:scaleX(-1)]",
                  !cameraOn && "invisible",
                )}
              />
              {!cameraOn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center">
                  <VideoOff className="size-5 text-muted-foreground" />
                  <div className="text-[11px] font-medium text-muted-foreground">
                    Camera off
                  </div>
                </div>
              )}
              <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    cameraOn
                      ? "bg-[var(--danger)] animate-pulse"
                      : "bg-muted-foreground",
                  )}
                />
                You
              </div>
            </div>
          )}

          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {labelFor(aiState, recording, paused)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {hintFor(aiState, recording, paused)}
            </div>
          </div>

          <div className="h-[180px] w-full max-w-[480px] rounded-lg border border-border bg-card p-4">
            <AudioWaveform state={aiState} amplitude={amplitude} />
          </div>

          <AnimatePresence mode="wait">
            {showCaptions && (
              <motion.div
                key={currentQuestion}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="max-w-[520px] rounded-md border border-border bg-card/60 px-4 py-3 text-center text-sm leading-relaxed"
              >
                <span>{currentQuestion.slice(0, captionVisibleChars)}</span>
                {captionVisibleChars < currentQuestion.length && (
                  <span className="text-muted-foreground/40">
                    {currentQuestion.slice(captionVisibleChars)}
                  </span>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {textMode && (
            <div className="flex w-full max-w-[520px] items-center gap-2">
              <input
                type="text"
                value={textFallback}
                onChange={(e) => setTextFallback(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitText()}
                placeholder="Type your answer…"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                onClick={submitText}
                disabled={submitting || !textFallback.trim()}
                loading={submitting}
              >
                <Send className="size-4" />
              </Button>
            </div>
          )}
        </div>

        {showCodePanel ? (
          <div className="flex flex-col overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Current question
              </div>
              <div className="mt-1.5 text-sm leading-relaxed">
                {currentQuestion}
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-3">
              <CodeEditor
                value={code}
                onChange={setCode}
                language={language}
                onLanguageChange={(l) => {
                  setLanguage(l);
                  setCode(STARTER_CODE[l]);
                }}
              />
            </div>
          </div>
        ) : (
          /* BIG camera panel — the full right half of the screen when no
             code editor is active. The <video> ref uses the same callback
             as the corner tile, so the stream attaches to whichever element
             is currently mounted. */
          <div className="relative hidden overflow-hidden bg-black md:block">
            <video
              ref={setVideoEl}
              autoPlay
              playsInline
              muted
              className={cn(
                "absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]",
                !cameraOn && "invisible",
              )}
            />
            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="rounded-full bg-card/40 p-5">
                  <VideoOff className="size-10 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Camera unavailable
                </div>
                <div className="max-w-xs text-xs text-muted-foreground/70 leading-relaxed">
                  Allow camera access in the browser permission prompt, or
                  continue in audio-only mode. (Requires HTTPS or localhost.)
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  cameraOn
                    ? "bg-[var(--danger)] animate-pulse"
                    : "bg-muted-foreground",
                )}
              />
              {candidateName || "You"}
            </div>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <footer className="flex h-[72px] items-center gap-3 border-t border-border bg-card px-4 md:px-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Captions className="size-3.5" />
          <span>Captions</span>
          <Switch
            checked={showCaptions}
            onCheckedChange={setShowCaptions}
            aria-label="Toggle captions"
          />
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setTextMode((m) => !m)}
          className="text-xs"
        >
          {textMode ? "Use voice" : "Type instead"}
        </Button>

        <div className="mx-auto flex items-center gap-2">
          <Button
            variant={
              recording ? "danger" : muted ? "danger" : "default"
            }
            size="icon"
            onClick={onMicButton}
            disabled={submitting}
            aria-label={muted ? "Unmute" : recording ? "Stop & submit" : "Mute"}
          >
            {muted ? (
              <MicOff className="size-4" />
            ) : (
              <Mic
                className={cn(
                  "size-4",
                  recording && "animate-pulse",
                )}
              />
            )}
          </Button>
          <Button
            variant="outline"
            onClick={takeAMoment}
            disabled={paused}
            className="gap-1.5"
          >
            {paused ? (
              <>
                <Play className="size-4" />
                Resuming…
              </>
            ) : (
              <>
                <Pause className="size-4" />
                Take a moment (30s)
              </>
            )}
          </Button>
          <Button variant="danger" onClick={endInterview} className="gap-1.5">
            <PhoneOff className="size-4" />
            End interview
          </Button>
        </div>

        <div className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <AlertTriangle className="size-3" />
          Anti-cheat is on
        </div>
      </footer>
    </div>
  );
}

function labelFor(s: WaveState, recording: boolean, paused: boolean) {
  if (paused) return "Paused";
  if (recording) return "Listening";
  return s === "thinking"
    ? "Sara is thinking"
    : s === "speaking"
      ? "Sara is speaking"
      : "Ready";
}

function hintFor(s: WaveState, recording: boolean, paused: boolean) {
  if (paused) return "Take your time. The mic is off.";
  if (recording) return "I'm with you. Click the mic when you're done.";
  if (s === "thinking") return "Sara is reading your answer…";
  if (s === "speaking") return "Listen carefully to the next question.";
  return "Click the mic to start speaking.";
}

const STAGE_ORDER = ["intro", "background", "core", "follow_up", "wrap_up"] as const;
function StageProgress({ stage }: { stage: string }) {
  // Treat the legacy "technical" wire value as core for progress purposes.
  const norm = stage === "technical" ? "core" : stage;
  const idx = STAGE_ORDER.indexOf(norm as typeof STAGE_ORDER[number]);
  return (
    <div className="hidden items-center gap-1 md:flex" aria-label="Interview progress">
      {STAGE_ORDER.map((s, i) => (
        <span
          key={s}
          className={cn(
            "h-1.5 w-6 rounded-full transition-colors",
            i < idx
              ? "bg-[var(--success)]"
              : i === idx
                ? "bg-[var(--primary)] animate-pulse"
                : "bg-border",
          )}
          title={s.replace("_", " ")}
        />
      ))}
    </div>
  );
}

function ConnectionIndicator() {
  const [quality, setQuality] = React.useState<"good" | "ok" | "poor">(
    "good",
  );
  React.useEffect(() => {
    const t = setInterval(() => {
      const r = Math.random();
      setQuality(r > 0.92 ? "poor" : r > 0.7 ? "ok" : "good");
    }, 6000);
    return () => clearInterval(t);
  }, []);
  const color =
    quality === "good"
      ? "text-[var(--success)]"
      : quality === "ok"
        ? "text-[var(--warning)]"
        : "text-[var(--danger)]";
  return (
    <span className={cn("inline-flex items-center gap-1 tabular", color)}>
      <Wifi className="size-3.5" />
      {quality}
    </span>
  );
}
