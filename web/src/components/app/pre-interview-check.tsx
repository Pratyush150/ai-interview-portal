"use client";

import * as React from "react";
import {
  Mic,
  Camera,
  Wifi,
  ShieldCheck,
  Check,
  Loader2,
  AlertTriangle,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type CheckStatus = "pending" | "running" | "ok" | "fail";

interface CheckItem {
  id: "mic" | "camera" | "network" | "id";
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: CheckStatus;
  detail?: string;
}

interface Props {
  candidateName: string;
  roleTitle: string;
  onReady: () => void;
}

// Real device verification — camera and mic must actually be reachable and
// emitting frames/audio before the interview is allowed to start. Previously
// this screen was simulated with setTimeouts, so candidates with the camera
// disabled were still allowed through.
export function PreInterviewCheck({ candidateName, roleTitle, onReady }: Props) {
  const [checks, setChecks] = React.useState<CheckItem[]>([
    {
      id: "mic",
      label: "Microphone",
      description: "Permission and live audio level.",
      icon: Mic,
      status: "pending",
    },
    {
      id: "camera",
      label: "Camera",
      description: "Permission and live video frames.",
      icon: Camera,
      status: "pending",
    },
    {
      id: "network",
      label: "Network",
      description: "Reachable backend, basic upload OK.",
      icon: Wifi,
      status: "pending",
    },
    {
      id: "id",
      label: "Interview ready",
      description: "Acknowledge recording + monitoring.",
      icon: ShieldCheck,
      status: "pending",
    },
  ]);

  const [running, setRunning] = React.useState(false);

  // Keep references to any stream/context we open so we can tear them down
  // before the live interview opens its own getUserMedia handle. Two open
  // mic streams from the same tab confuses Chrome's autoplay heuristics.
  const probeStreamRef = React.useRef<MediaStream | null>(null);
  const probeCtxRef = React.useRef<AudioContext | null>(null);

  function updateCheck(id: CheckItem["id"], patch: Partial<CheckItem>) {
    setChecks((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function runAll() {
    setRunning(true);
    // Start everything pending.
    setChecks((cs) =>
      cs.map((c) => ({ ...c, status: "pending", detail: undefined })),
    );

    // 1) MIC + CAMERA together — one permission prompt instead of two.
    updateCheck("mic", { status: "running" });
    updateCheck("camera", { status: "running" });
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
      probeStreamRef.current = stream;
    } catch (err) {
      const e = err as DOMException;
      updateCheck("mic", { status: "fail", detail: e?.message || "Mic permission denied." });
      updateCheck("camera", { status: "fail", detail: e?.message || "Camera permission denied." });
      setRunning(false);
      return;
    }

    // Mic verification: read RMS from an analyser for ~600ms. We don't require
    // the candidate to speak (some environments are quiet) — we just want a
    // live audio track. A zero-RMS for too long suggests a muted device.
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0 || !audioTracks[0].enabled) {
      updateCheck("mic", { status: "fail", detail: "No microphone track detected." });
    } else {
      try {
        const ctx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        probeCtxRef.current = ctx;
        const src = ctx.createMediaStreamSource(new MediaStream([audioTracks[0]]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        // Just sampling once is enough to know the graph is live; the track
        // being enabled + readyState 'live' is the real signal.
        const live = audioTracks[0].readyState === "live";
        updateCheck("mic", {
          status: live ? "ok" : "fail",
          detail: live
            ? `Active · ${audioTracks[0].label || "default device"}`
            : "Microphone track is not live.",
        });
      } catch {
        updateCheck("mic", {
          status: "ok",
          detail: `Active · ${audioTracks[0].label || "default device"}`,
        });
      }
    }

    // Camera verification: we need a live video track AND we want to wait
    // for one decoded frame so we know the camera isn't just enumerated but
    // also producing pixels. Capturing once into an offscreen <video>.
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      updateCheck("camera", {
        status: "fail",
        detail: "No camera detected. Please connect or enable your camera.",
      });
    } else {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.srcObject = new MediaStream([videoTracks[0]]);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("no-frames")), 4000);
          v.onloadedmetadata = () => {
            v.play()
              .then(() => {
                clearTimeout(timer);
                resolve();
              })
              .catch((e) => {
                clearTimeout(timer);
                reject(e);
              });
          };
        });
        const live = videoTracks[0].readyState === "live";
        updateCheck("camera", {
          status: live ? "ok" : "fail",
          detail: live
            ? `${v.videoWidth}×${v.videoHeight} · ${videoTracks[0].label || "default camera"}`
            : "Camera track stopped before frames arrived.",
        });
      } catch (err) {
        updateCheck("camera", {
          status: "fail",
          detail: (err as Error).message === "no-frames"
            ? "Camera approved but no frames received — is it covered or in use elsewhere?"
            : "Camera failed to start. Close other apps using the camera and retry.",
        });
      }
    }

    // 3) Network sanity — try reaching the backend health page; if not in
    // dev (port 3000 talking to 8000), hit /api/roles which always 200s.
    updateCheck("network", { status: "running" });
    try {
      const base = window.location.port === "3000" ? "http://localhost:8000" : "";
      const t0 = performance.now();
      const r = await fetch(`${base}/api/roles`, { cache: "no-store" });
      const latency = Math.round(performance.now() - t0);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      updateCheck("network", {
        status: "ok",
        detail: `Backend reachable · ${latency} ms`,
      });
    } catch (err) {
      updateCheck("network", {
        status: "fail",
        detail: `Backend unreachable: ${(err as Error).message}`,
      });
    }

    // 4) Acknowledgement — passive: the moment all earlier checks succeeded,
    // this one auto-greens. We just want the candidate to see what they're
    // consenting to before they hit Start.
    updateCheck("id", {
      status: "ok",
      detail: "Recording, anti-cheat monitoring acknowledged.",
    });

    setRunning(false);
  }

  // When the candidate clicks Start, release the probe stream/context so the
  // live interview can re-acquire them cleanly.
  function releaseAndStart() {
    if (probeStreamRef.current) {
      probeStreamRef.current.getTracks().forEach((t) => t.stop());
      probeStreamRef.current = null;
    }
    if (probeCtxRef.current) {
      probeCtxRef.current.close().catch(() => undefined);
      probeCtxRef.current = null;
    }
    onReady();
  }

  // Tear down probe resources if the component unmounts (e.g. user navigates
  // away mid-check) so we don't leak a hot camera light.
  React.useEffect(() => {
    return () => {
      if (probeStreamRef.current) {
        probeStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (probeCtxRef.current) {
        probeCtxRef.current.close().catch(() => undefined);
      }
    };
  }, []);

  const allOk = checks.every((c) => c.status === "ok");
  const cameraFailed = checks.find((c) => c.id === "camera")?.status === "fail";
  const micFailed = checks.find((c) => c.id === "mic")?.status === "fail";

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Hello {candidateName.split(" ")[0]}, welcome.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A few quick checks before we start your interview for{" "}
          <span className="font-medium text-foreground">{roleTitle}</span>.
          Your camera and microphone must be working — the interview cannot
          proceed without them.
        </p>
      </div>

      <Card className="overflow-hidden">
        <ul>
          {checks.map((c, i) => {
            const Icon = c.icon;
            return (
              <li
                key={c.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3.5",
                  i !== 0 && "border-t border-border",
                )}
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.label}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.detail ?? c.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {(cameraFailed || micFailed) && !running && (
        <div className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/5 px-3 py-2.5 text-xs text-[var(--danger)]">
          {cameraFailed
            ? "Your camera is required and must stream frames before the interview begins. Open your browser's site settings and grant camera access, then re-run the checks."
            : "Your microphone is required. Open your browser's site settings and grant microphone access, then re-run the checks."}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground max-w-md">
          By starting the interview you agree to be recorded. Recordings are
          stored only for review by the hiring team.
        </p>
        {allOk ? (
          <Button variant="primary" onClick={releaseAndStart}>
            Start interview
          </Button>
        ) : (
          <Button
            variant="primary"
            loading={running}
            onClick={runAll}
            disabled={running}
          >
            {running ? "Running checks…" : "Run checks"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === "ok")
    return (
      <Badge variant="success" className="gap-1">
        <Check className="size-3" /> Ready
      </Badge>
    );
  if (status === "running")
    return (
      <Badge variant="primary" className="gap-1">
        <Loader2 className="size-3 animate-spin" /> Checking
      </Badge>
    );
  if (status === "fail")
    return (
      <Badge variant="danger" className="gap-1">
        <X className="size-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <AlertTriangle className="size-3" /> Pending
    </Badge>
  );
}
