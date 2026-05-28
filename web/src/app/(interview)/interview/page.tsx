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
  ShieldAlert,
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
import { BRAND_NAME } from "@/lib/brand";
import { toast } from "sonner";
import {
  audioUrl as resolveAudio,
  createSession,
  getApiBase,
  getSession,
  postAudioTurn,
  postTextTurn,
  type TurnResponse,
} from "@/lib/api";
import { InterviewReport } from "@/components/app/interview-report";
import { useAnticheat, ANTICHEAT_MAX_WARNINGS } from "@/hooks/use-anticheat";
import {
  getCodingProblem,
  type CodingProblem,
} from "@/lib/coding-problems";

// ───────────────────────────────────────────────────────────────────────────
// Live interview surface
// Flow: pre-flight check → voice Q&A (intro → background → core → follow_up
// → wrap_up) → coding round (pseudocode, 1 problem) → report.
// The IDE never appears during the voice rounds; we used to flip it on
// mid-interview, which broke the flow and confused candidates.
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

type Phase = "check" | "live" | "coding" | "ended" | "flagged";
type TalkRole = "interviewer" | "candidate";

interface TurnLine {
  role: TalkRole;
  text: string;
}

// Starter buffers per language. C/C++ get their own — the editor language
// "c" is a separate Monaco mode from "cpp" so a candidate familiar with
// pure C can pick it without mentally translating from a C++ template.
const STARTER_CODE: Record<CodeLanguage, string> = {
  python: "# Write PSEUDOCODE here — focus on the algorithm.\n",
  javascript: "// Write PSEUDOCODE here — focus on the algorithm.\n",
  typescript: "// Write PSEUDOCODE here — focus on the algorithm.\n",
  go: "// Write PSEUDOCODE here — focus on the algorithm.\n",
  java: "// Write PSEUDOCODE here — focus on the algorithm.\n",
  c: "// Write PSEUDOCODE here — focus on the algorithm.\n",
  cpp: "// Write PSEUDOCODE here — focus on the algorithm.\n",
  rust: "// Write PSEUDOCODE here — focus on the algorithm.\n",
  sql: "-- Write PSEUDOCODE here — focus on the algorithm.\n",
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
  const [textFallback, setTextFallback] = React.useState("");
  const [textMode, setTextMode] = React.useState(false);
  const [interviewerName, setInterviewerName] = React.useState<string>("Sara");
  const [roleFamily, setRoleFamily] = React.useState<string>("backend_engineering");
  // True for engineering roles; false for PM/Sales/HR/etc. When false we
  // skip the coding phase entirely and go straight to the report.
  const [hasCodingRound, setHasCodingRound] = React.useState<boolean>(true);
  // Coding problems for the IDE round. The backend returns a list (usually
  // 2 per engineering role). We walk through them sequentially — submit
  // problem 1, then problem 2, then finish the interview. The static TS
  // bank is the fallback used while the API call is still in flight.
  const [codingProblems, setCodingProblems] = React.useState<CodingProblem[] | null>(null);
  const [codingIdx, setCodingIdx] = React.useState(0);
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

  // Anti-cheat: hook needs the live stream + the mounted <video> to read
  // motion / dark-frame heuristics. We keep a state copy of the stream so
  // the hook re-runs when it changes (the ref alone wouldn't trigger).
  const [streamForAnticheat, setStreamForAnticheat] = React.useState<MediaStream | null>(null);
  const [videoForAnticheat, setVideoForAnticheat] = React.useState<HTMLVideoElement | null>(null);

  const setVideoEl = React.useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoForAnticheat(el);
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

  const anticheat = useAnticheat({
    sessionId,
    videoEl: videoForAnticheat,
    stream: streamForAnticheat,
    apiBase: getApiBase(),
    active: phase === "live" || phase === "coding",
    onFlagged: () => {
      // Three strikes — end the interview and surface the terminal banner.
      stopRecording();
      stopMic();
      silenceTTS();
      // Fire-and-forget /report POST so the backend writes total_score,
      // status='finished', cheating_flags, and finished_at even though
      // the candidate is on the flagged screen (which does NOT mount
      // <InterviewReport> and would otherwise never trigger the persist).
      if (sessionId) {
        fetch(`${getApiBase()}/api/session/${sessionId}/report`).catch(() => undefined);
      }
      setPhase("flagged");
    },
    onCameraLost: () => {
      toast.error(
        "Your camera was turned off. Re-enable it from your browser settings — the interview is being flagged.",
      );
    },
  });

  // Surface each new anti-cheat warning as a toast. Mirrors the legacy
  // vanilla portal's behaviour so the candidate knows exactly which
  // behaviour was flagged.
  React.useEffect(() => {
    if (anticheat.latestMessage) {
      toast.warning(
        `${anticheat.latestMessage} (${anticheat.warnings}/${ANTICHEAT_MAX_WARNINGS})`,
      );
    }
  }, [anticheat.latestMessage, anticheat.warnings]);

  // ─── Voice-interview timer (live phase only) ───
  //
  // The 22-minute budget covers ONLY the voice rounds. When the
  // candidate transitions to the coding phase the ticker stops — the
  // coding round gets its own separate 30-minute budget tracked by
  // `codingElapsedSec` below. This keeps the time pressure of each
  // round visible to the candidate without one bleeding into the other.
  React.useEffect(() => {
    if (phase !== "live") return;
    const t = setInterval(() => {
      if (!paused) setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [phase, paused]);

  // ─── Coding-round timer (coding phase only, 30 min budget) ───
  //
  // Fresh counter, fresh budget. Auto-submits whatever's in the editor
  // when the timer hits 0 so the candidate can't silently overrun.
  const CODING_BUDGET_MIN = 30;
  const [codingElapsedSec, setCodingElapsedSec] = React.useState(0);
  const codingExpiredRef = React.useRef(false);
  React.useEffect(() => {
    if (phase !== "coding") {
      // Reset whenever we leave (defensive — would only matter if the
      // candidate somehow re-enters the coding phase from a flagged
      // state, which currently isn't possible).
      if (phase !== "ended" && phase !== "flagged") {
        setCodingElapsedSec(0);
        codingExpiredRef.current = false;
      }
      return;
    }
    const t = setInterval(() => {
      setCodingElapsedSec((s) => s + 1);
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Auto-submit when the coding budget is hit. We submit whatever the
  // candidate has currently typed — even an empty buffer — so the
  // session ends cleanly and the report can be generated. We do NOT
  // require all problems to be solved; the engine evaluates each
  // submission as it lands and the unsubmitted ones simply don't count.
  React.useEffect(() => {
    if (phase !== "coding") return;
    if (codingExpiredRef.current) return;
    if (codingElapsedSec < CODING_BUDGET_MIN * 60) return;
    codingExpiredRef.current = true;
    toast.warning("Coding round time's up — submitting and wrapping up.");
    // Submit current code (if any) then end the interview. Wrapped in a
    // microtask so React state settles first.
    queueMicrotask(() => {
      void submitCode().finally(() => {
        stopMic();
        silenceTTS();
        if (sessionId) {
          fetch(`${getApiBase()}/api/session/${sessionId}/report`).catch(() => undefined);
        }
        setPhase("ended");
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codingElapsedSec, phase]);

  // ─── Fully silence any TTS audio source ───
  //
  // `audio.pause()` alone is unreliable on Chrome — paused audio can
  // resume on its own under certain autoplay-policy conditions, and on
  // Safari a pending play() promise can override a pause. The robust
  // shutdown is: pause + detach src + reload. Web Speech needs
  // cancel() + pause() back-to-back because Chrome's speech queue
  // survives a single cancel() call after a long-running utterance.
  const destroyedRef = React.useRef(false);
  const silenceTTS = React.useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.speechSynthesis?.cancel();
      window.speechSynthesis?.pause();
      // Then resume to flush; a paused queue can outlive a cancel call.
      setTimeout(() => {
        try { window.speechSynthesis?.cancel(); } catch {}
      }, 50);
    } catch {}
    const a = ttsAudioRef.current;
    if (a) {
      try {
        a.pause();
        a.removeAttribute("src");
        a.load();
      } catch {}
      ttsAudioRef.current = null;
    }
  }, []);

  // ─── Cleanup on unmount + tab hide + browser back/forward ───
  React.useEffect(() => {
    function onVisibility() {
      if (document.hidden) silenceTTS();
    }
    function onPageHide() {
      // Fires on real navigation (back/forward, tab close). Stops audio
      // even if React doesn't unmount fast enough.
      destroyedRef.current = true;
      silenceTTS();
      stopMic();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      destroyedRef.current = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      silenceTTS();
      stopMic();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [silenceTTS]);

  // ─── Bind the camera stream to whatever <video> element is currently
  // mounted (the big right panel OR the corner tile in coding mode).
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
  }, [cameraOn, phase]);

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
        setRoleFamily(sess.role_family || "backend_engineering");
        setHasCodingRound(sess.has_coding_round !== false);
        if (sess.target_duration_min) setTargetMinutes(sess.target_duration_min);
      } else {
        try {
          const sess = await getSession(id);
          setStage(sess.stage);
          setInterviewerName(sess.interviewer_name || "Sara");
          setRoleFamily(sess.role_family || "backend_engineering");
          setHasCodingRound(sess.has_coding_round !== false);
          if (sess.target_duration_min) setTargetMinutes(sess.target_duration_min);
        } catch {
          /* keep defaults */
        }
      }
      await openMic();
      await ask(id, "Hello, I'm ready to begin.");
    } catch (e) {
      console.error(e);
      const err = e as { status?: number; detail?: { error?: string; aptitude_url?: string; message?: string } };
      const detail = err?.detail;
      if (err?.status === 403 && detail?.error === "aptitude_required" && inviteToken) {
        toast.message("Please clear the aptitude round first.");
        router.replace(`/aptitude/?invite=${encodeURIComponent(inviteToken)}`);
        return;
      }
      if (err?.status === 403 && detail?.error === "aptitude_failed") {
        toast.error(detail.message || "You did not clear the aptitude round. This application is closed.");
        router.replace("/jobs");
        return;
      }
      toast.error(
        "Couldn't start the interview. Check that the backend is running.",
      );
      setPhase("check");
    }
  }

  // ─── Open microphone (and camera) ───
  // We require BOTH at this stage — the pre-flight gate already enforced
  // camera presence, so a failure here is an unrecoverable state and we
  // abort back to the check screen rather than silently dropping to
  // audio-only (which previously let candidates proceed without a camera).
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
      console.warn("Camera/mic unavailable", err);
      toast.error(
        "Camera or microphone access was denied. Both are required — please grant them and reload.",
      );
      setPhase("check");
      throw err;
    }
    streamRef.current = stream;
    setStreamForAnticheat(stream);
    setCameraOn(stream.getVideoTracks().length > 0);
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
    setStreamForAnticheat(null);
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
  }

  // ─── Recording ───
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

  // ─── Coding-round submission ───
  // The candidate's pseudocode is shipped to the engine as a text turn so the
  // existing evaluator scores it like any other answer. The candidate
  // walks through 2 problems (more if the recruiter added them). After
  // the last one we end the interview and surface the report.
  async function submitCode() {
    if (!sessionId) return;
    if (code.replace(/[\s\W]/g, "").length < 8) {
      toast.warning("Add a bit more detail before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      const problemList = codingProblems ?? [getCodingProblem(roleFamily)];
      const currentIdx = Math.min(codingIdx, problemList.length - 1);
      const currentProblem = problemList[currentIdx];
      const payload =
        `[Coding round — pseudocode submission ${currentIdx + 1}/${problemList.length}, ${language}]\n` +
        `Problem: ${currentProblem.title}\n\n` +
        code;
      const turn = await postTextTurn(sessionId, payload);
      setTranscript((t) => [...t, { role: "candidate", text: payload }]);
      handleTurnResponse(turn);
      // Advance to next problem OR end the interview.
      if (currentIdx + 1 < problemList.length) {
        setCodingIdx(currentIdx + 1);
        // Reset the editor buffer to the language's starter so the
        // candidate isn't tempted to copy-paste their previous solution.
        setCode(STARTER_CODE[language]);
        toast.success(
          `Submitted ${currentIdx + 1}/${problemList.length}. On to the next.`,
        );
      } else {
        setPhase("ended");
      }
    } catch {
      toast.error("Couldn't submit your code.");
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
    setCurrentQuestion(turn.reply);
    setCaptionVisibleChars(0);
    setTranscript((t) => [...t, { role: "interviewer", text: turn.reply }]);

    // The voice interview is OVER when the engine sets `is_finished` —
    // that's the canonical "second round complete" signal. Only then do
    // we hand off to the coding round (engineering roles) or jump to the
    // report (non-engineering roles). This way the candidate experiences
    // the full intro→background→core→follow_up→wrap_up arc with no IDE
    // interruption mid-flight.
    if (turn.is_finished) {
      setAiState("speaking");
      await speak(turn.reply, turn.audio_url);
      setCaptionVisibleChars(turn.reply.length);
      setAiState("idle");
      stopRecording();
      if (hasCodingRound) {
        // Pre-fetch the role-curated coding problems before mounting the
        // IDE. The CodingRound component falls back to the static TS
        // bank if this is still in flight, so the panel never blanks.
        if (sessionId) {
          fetch(`${getApiBase()}/api/session/${sessionId}/coding-problem`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data: { problems?: CodingProblem[] } | null) => {
              const list = (data?.problems ?? []).filter(
                (p) => p && p.title && p.prompt,
              );
              if (list.length > 0) {
                setCodingProblems(list);
                setCodingIdx(0);
              }
            })
            .catch(() => undefined);
        }
        // KEEP the camera + mic stream alive — anti-cheat (motion + dark
        // frame + camera-kill detection) runs throughout the coding round
        // too. We only silence the TTS playback and stop the recorder.
        silenceTTS();
        setPhase("coding");
      } else {
        // Non-engineering — no coding round. Persist the report and end.
        stopMic();
        silenceTTS();
        if (sessionId) {
          fetch(`${getApiBase()}/api/session/${sessionId}/report`).catch(() => undefined);
        }
        setPhase("ended");
      }
      return;
    }

    setAiState("speaking");
    await speak(turn.reply, turn.audio_url);
    setCaptionVisibleChars(turn.reply.length);
    setAiState("idle");
    setTimeout(() => {
      if (!muted && !paused && !textMode && phase === "live") startRecording();
    }, 800);
  }

  function speak(text: string, audio_url: string | null): Promise<void> {
    return new Promise((resolve) => {
      // If the component already unmounted (back button, tab close)
      // between handleTurnResponse and now, do not start any new audio.
      if (destroyedRef.current) {
        resolve();
        return;
      }
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
        setTimeout(() => {
          cleanup();
          resolve();
        }, Math.max(12000, text.length * 90));
        return;
      }

      if (typeof window === "undefined" || !window.speechSynthesis) {
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

      try {
        window.speechSynthesis.resume();
        window.speechSynthesis.cancel();
      } catch {}

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
        let gotBoundary = false;
        utter.onboundary = (ev) => {
          gotBoundary = true;
          const idx = (ev.charIndex ?? 0) + (ev.charLength ?? 0);
          setCaptionVisibleChars(Math.max(captionVisibleChars, Math.min(total, idx + 1)));
        };
        const rampStart = Date.now();
        const fallbackMsTotal = Math.max(800, (total / 12) * 1000);
        const fallback = setInterval(() => {
          if (gotBoundary) return;
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
          console.warn(
            "[TTS] Web Speech utterance error:",
            (ev as SpeechSynthesisErrorEvent).error || "unknown",
          );
          finish();
        };
        try {
          window.speechSynthesis.speak(utter);
        } catch (err) {
          console.warn("[TTS] speechSynthesis.speak threw:", err);
          finish();
        }
        setTimeout(() => {
          clearInterval(fallback);
          resolve();
        }, Math.max(10000, text.length * 90));
      }
    });
  }

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
    silenceTTS();
    setPhase("ended");
    toast.success("Interview ended.");
  }

  // Manual "advance" — candidate-controlled escape hatch. Bypasses the
  // strict "wait for is_finished" rule when the candidate is satisfied
  // with the voice round or a tester wants to verify the IDE phase
  // without waiting out the engine's full stage budget. Camera stays on
  // for anti-cheat; only the mic recorder + TTS stop.
  async function endVoiceRoundAndProceed() {
    stopRecording();
    silenceTTS();
    if (hasCodingRound) {
      if (sessionId) {
        fetch(`${getApiBase()}/api/session/${sessionId}/coding-problem`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data: { problems?: CodingProblem[] } | null) => {
            const list = (data?.problems ?? []).filter((p) => p && p.title && p.prompt);
            if (list.length > 0) {
              setCodingProblems(list);
              setCodingIdx(0);
            }
          })
          .catch(() => undefined);
      }
      setPhase("coding");
      toast.message("Moving to the coding round.");
    } else {
      stopMic();
      if (sessionId) {
        fetch(`${getApiBase()}/api/session/${sessionId}/report`).catch(() => undefined);
      }
      setPhase("ended");
      toast.message("Voice round complete.");
    }
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

  if (phase === "flagged") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <ShieldAlert className="size-12 text-[var(--danger)]" />
        <h1 className="text-xl font-semibold">Interview flagged</h1>
        <p className="text-sm text-muted-foreground">
          We detected {ANTICHEAT_MAX_WARNINGS} or more potential integrity
          violations during your session (tab switches, pasting, camera off,
          or excessive movement). The interview has ended and the hiring
          team will receive the recording for review.
        </p>
        <Button variant="outline" onClick={() => router.push("/jobs")}>
          Back to jobs
        </Button>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <InterviewReport
        sessionId={sessionId}
        // Report card shows TOTAL time across both rounds so a recruiter
        // can see end-to-end duration. Voice and coding budgets are
        // tracked independently mid-session but combined for reporting.
        elapsedSec={elapsed + codingElapsedSec}
        turnCount={turnCount}
        candidateAnswers={transcript.filter((t) => t.role === "candidate").length}
        interviewerName={interviewerName}
        onBackToDashboard={() => router.push("/jobs")}
      />
    );
  }

  if (phase === "coding") {
    return (
      <CodingRound
        problem={
          (codingProblems ?? [getCodingProblem(roleFamily)])[
            Math.min(codingIdx, (codingProblems ?? [1]).length - 1)
          ] ?? getCodingProblem(roleFamily)
        }
        problemIndex={codingIdx}
        problemTotal={(codingProblems ?? []).length || 1}
        code={code}
        onCodeChange={setCode}
        language={language}
        onLanguageChange={(l) => {
          setLanguage(l);
          // Only overwrite if the candidate hasn't touched it.
          if (code === STARTER_CODE[language]) setCode(STARTER_CODE[l]);
        }}
        onSubmit={submitCode}
        submitting={submitting}
        videoRefCallback={setVideoEl}
        cameraOn={cameraOn}
        candidateName={candidateName}
        anticheatWarnings={anticheat.warnings}
        // Coding round uses ITS OWN timer, completely separate from the
        // 22-min voice budget. Candidate gets 30 min for the IDE round.
        elapsed={codingElapsedSec}
        targetMinutes={CODING_BUDGET_MIN}
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
            {interviewerName} · {BRAND_NAME} Interview
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
          {anticheat.warnings > 0 && (
            <Badge
              variant={anticheat.warnings >= 2 ? "danger" : "warning"}
              className="tabular"
            >
              <ShieldAlert className="mr-1 size-3" />
              {anticheat.warnings}/{ANTICHEAT_MAX_WARNINGS}
            </Badge>
          )}
          {lastScore != null && (
            <Badge variant="primary" className="tabular">
              Last: {lastScore.toFixed(1)}
            </Badge>
          )}
        </div>
      </header>

      {/* Main: 50/50 — audio on the left, big camera on the right. No IDE
          interruption mid-interview anymore. */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-2">
        <div className="relative flex flex-col items-center justify-center gap-6 border-b border-border p-6 md:border-b-0 md:border-r">
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {labelFor(aiState, recording, paused, interviewerName)}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {hintFor(aiState, recording, paused, interviewerName)}
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
                Allow camera access in the browser permission prompt.
                (Requires HTTPS or localhost.)
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
            variant={recording ? "danger" : muted ? "danger" : "default"}
            size="icon"
            onClick={onMicButton}
            disabled={submitting}
            aria-label={muted ? "Unmute" : recording ? "Stop & submit" : "Mute"}
          >
            {muted ? (
              <MicOff className="size-4" />
            ) : (
              <Mic className={cn("size-4", recording && "animate-pulse")} />
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
          <Button
            variant="outline"
            onClick={endVoiceRoundAndProceed}
            className="gap-1.5"
            // Available only after the candidate has had at least a couple
            // of turns — otherwise it's trivially gameable to skip the
            // voice round entirely.
            disabled={turnCount < 2}
            title={
              turnCount < 2
                ? "Answer a couple of questions first"
                : hasCodingRound
                  ? "Move to the coding round"
                  : "Finish the voice interview"
            }
          >
            {hasCodingRound ? "Move to coding →" : "Finish interview →"}
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

// ───────────────────────────────────────────────────────────────────────────
// Coding round screen — shown ONCE after the voice rounds finish. The
// candidate sees one role-matched problem and a Monaco editor with a Submit
// button. We don't grade compilation; the engine evaluates the pseudocode
// the same way it would evaluate a spoken answer.
// ───────────────────────────────────────────────────────────────────────────

interface CodingRoundProps {
  problem: ReturnType<typeof getCodingProblem>;
  code: string;
  onCodeChange: (v: string) => void;
  language: CodeLanguage;
  onLanguageChange: (l: CodeLanguage) => void;
  onSubmit: () => void;
  submitting: boolean;
  videoRefCallback: (el: HTMLVideoElement | null) => void;
  cameraOn: boolean;
  candidateName: string;
  anticheatWarnings: number;
  elapsed: number;
  targetMinutes: number;
  problemIndex: number;
  problemTotal: number;
}

function CodingRound({
  problem,
  code,
  onCodeChange,
  language,
  onLanguageChange,
  onSubmit,
  submitting,
  videoRefCallback,
  cameraOn,
  candidateName,
  anticheatWarnings,
  elapsed,
  targetMinutes,
  problemIndex,
  problemTotal,
}: CodingRoundProps) {
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-[60px] shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
        <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
          <Sparkles className="size-3.5" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">
            Coding round · {BRAND_NAME}
          </div>
          <div className="text-[11px] text-muted-foreground tabular">
            {problemTotal > 1
              ? `Pseudocode · ${problemTotal} problems · ${language}`
              : `Pseudocode submission · ${language}`}
            <span className="ml-2 rounded bg-[var(--primary)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--primary)]">
              separate {targetMinutes}-min budget
            </span>
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-3 text-xs">
          <span
            className={cn(
              "tabular",
              // Last 5 min: warn. Last 1 min: red + pulse.
              elapsed >= targetMinutes * 60 - 60
                ? "text-[var(--danger)] animate-pulse"
                : elapsed >= targetMinutes * 60 - 300
                  ? "text-[var(--warning)]"
                  : "text-muted-foreground",
            )}
          >
            <Clock className="mr-1 inline size-3" />
            {formatDuration(elapsed * 1000)} / {targetMinutes}m
          </span>
          {anticheatWarnings > 0 && (
            <Badge
              variant={anticheatWarnings >= 2 ? "danger" : "warning"}
              className="tabular"
            >
              <ShieldAlert className="mr-1 size-3" />
              {anticheatWarnings}/{ANTICHEAT_MAX_WARNINGS}
            </Badge>
          )}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="overflow-y-auto border-b border-border p-5 md:border-b-0 md:border-r">
          <Card>
            <div className="space-y-3 p-5">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="w-fit">
                  Final round · Coding
                </Badge>
                {problemTotal > 1 && (
                  <Badge variant="primary" className="w-fit tabular">
                    Problem {problemIndex + 1} of {problemTotal}
                  </Badge>
                )}
              </div>
              <h2 className="text-lg font-semibold tracking-tight">
                {problem.title}
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {problem.prompt}
              </p>
              {problem.examples && problem.examples.length > 0 && (
                <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Example test cases
                  </div>
                  {problem.examples.map((ex, i) => (
                    <div key={i} className="leading-relaxed tabular">
                      <span className="text-muted-foreground">Input:</span>{" "}
                      {ex.input}
                      <br />
                      <span className="text-muted-foreground">Output:</span>{" "}
                      {ex.output}
                    </div>
                  ))}
                </div>
              )}
              {problem.hint && (
                <div className="text-[11px] italic text-muted-foreground">
                  Hint: {problem.hint}
                </div>
              )}
              <div className="rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3 py-2 text-[11px] text-foreground">
                Write PSEUDOCODE — focus on the algorithm, data structures, and
                edge cases. We don&apos;t compile your submission. Aim for ~15
                lines.
                {problemTotal > 1 && (
                  <>
                    {" "}You&apos;ll get {problemTotal} problems total — submit
                    each one, then the report is generated.
                  </>
                )}
              </div>
            </div>
          </Card>

          <div className="mt-4 overflow-hidden rounded-md border border-border bg-black">
            <div className="relative aspect-video">
              <video
                ref={videoRefCallback}
                autoPlay
                playsInline
                muted
                className={cn(
                  "absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]",
                  !cameraOn && "invisible",
                )}
              />
              {!cameraOn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center">
                  <VideoOff className="size-6 text-muted-foreground" />
                  <div className="text-xs font-medium text-muted-foreground">
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
                {candidateName || "You"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col overflow-hidden p-3">
          <CodeEditor
            value={code}
            onChange={onCodeChange}
            language={language}
            onLanguageChange={onLanguageChange}
            onSubmit={onSubmit}
            submitting={submitting}
          />
        </div>
      </div>
    </div>
  );
}

function labelFor(s: WaveState, recording: boolean, paused: boolean, name: string) {
  if (paused) return "Paused";
  if (recording) return "Listening";
  return s === "thinking"
    ? `${name} is thinking`
    : s === "speaking"
      ? `${name} is speaking`
      : "Ready";
}

function hintFor(s: WaveState, recording: boolean, paused: boolean, name: string) {
  if (paused) return "Take your time. The mic is off.";
  if (recording) return "I'm with you. Click the mic when you're done.";
  if (s === "thinking") return `${name} is reading your answer…`;
  if (s === "speaking") return "Listen carefully to the next question.";
  return "Click the mic to start speaking.";
}

const STAGE_ORDER = ["intro", "background", "core", "follow_up", "wrap_up"] as const;
function StageProgress({ stage }: { stage: string }) {
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
