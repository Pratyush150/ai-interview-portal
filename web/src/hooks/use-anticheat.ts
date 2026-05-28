"use client";

import * as React from "react";

/**
 * Anti-cheat monitor for the live interview surface.
 *
 * Watches the candidate for: tab/window blurs, paste events, suspicious
 * keyboard shortcuts (devtools/view-source), excessive head motion, a
 * dark/covered camera, and the camera track being killed mid-interview.
 *
 * Three warnings (any combination of the above triggers) automatically
 * raises a hard `flagged` state — the caller is expected to surface this
 * to the candidate and end the interview, mirroring the original vanilla
 * portal's behaviour.
 *
 * Violations are also batched + POSTed to `/api/session/{id}/cheating-report`
 * so the recruiter dashboard's cheat-analysis tab gets the full evidence
 * trail. Reusing the existing backend route — no schema change needed.
 */

const MAX_WARNINGS_BEFORE_FLAG = 3;

type ViolationType =
  | "tab_switch"
  | "window_blur"
  | "paste_detected"
  | "suspicious_shortcut"
  | "right_click"
  | "extension_detected"
  | "excessive_motion"
  | "camera_blocked"
  | "camera_stopped"
  | "devtools_suspected";

interface Violation {
  type: ViolationType;
  timestamp: number;
  [k: string]: unknown;
}

interface UseAnticheatArgs {
  sessionId: string | null;
  videoEl: HTMLVideoElement | null;
  stream: MediaStream | null;
  apiBase: string;
  active: boolean;
  // Called when warnings reach MAX_WARNINGS_BEFORE_FLAG so the page can
  // freeze the interview / show a terminal banner.
  onFlagged?: () => void;
  // Called when the camera track ends mid-interview (closed lid, denied
  // mid-session) so the page can request reacquisition.
  onCameraLost?: () => void;
}

interface AnticheatState {
  warnings: number;
  flagged: boolean;
  latestMessage: string | null;
}

export function useAnticheat({
  sessionId,
  videoEl,
  stream,
  apiBase,
  active,
  onFlagged,
  onCameraLost,
}: UseAnticheatArgs): AnticheatState {
  const [warnings, setWarnings] = React.useState(0);
  const [latestMessage, setLatestMessage] = React.useState<string | null>(null);
  const flaggedRef = React.useRef(false);
  const [flagged, setFlagged] = React.useState(false);

  // Buffered violations awaiting the next 30-second flush to backend.
  const queueRef = React.useRef<Violation[]>([]);
  // Rate-limit each kind of banner so we don't spam the candidate.
  const lastBannerAtRef = React.useRef<Record<string, number>>({});

  // Maintain a stable warn() so the various effects below can share it.
  const warn = React.useCallback(
    (type: ViolationType, msg: string, data: Record<string, unknown> = {}) => {
      if (flaggedRef.current) return;
      const now = Date.now();
      const lastAt = lastBannerAtRef.current[type] ?? 0;
      // 4-second debounce per violation type — paste-spam shouldn't burn
      // through all three warnings in a single keystroke.
      if (now - lastAt < 4000) {
        queueRef.current.push({ type, timestamp: now, ...data });
        return;
      }
      lastBannerAtRef.current[type] = now;
      queueRef.current.push({ type, timestamp: now, ...data });
      setLatestMessage(msg);
      setWarnings((w) => {
        const next = w + 1;
        if (next >= MAX_WARNINGS_BEFORE_FLAG && !flaggedRef.current) {
          flaggedRef.current = true;
          setFlagged(true);
          // Defer to next tick so React state updates settle before the
          // host page calls End interview.
          setTimeout(() => onFlagged?.(), 0);
        }
        return next;
      });
    },
    [onFlagged],
  );

  // Periodic flush to backend. Reusing the legacy endpoint so the recruiter
  // dashboard's cheat-analysis tab populates without backend changes.
  React.useEffect(() => {
    if (!active || !sessionId) return;
    const id = setInterval(async () => {
      if (queueRef.current.length === 0) return;
      const batch = queueRef.current.slice();
      queueRef.current = [];
      try {
        await fetch(`${apiBase}/api/session/${sessionId}/cheating-report`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ violations: batch }),
        });
      } catch {
        // Re-buffer if the network blipped — best-effort delivery.
        queueRef.current = batch.concat(queueRef.current);
      }
    }, 15000);
    return () => clearInterval(id);
  }, [active, sessionId, apiBase]);

  // Tab / window switches.
  React.useEffect(() => {
    if (!active) return;
    const onVisibility = () => {
      if (document.hidden)
        warn("tab_switch", "Tab switching is monitored. Stay on this tab.");
    };
    const onBlur = () =>
      warn("window_blur", "Window blur detected. Keep the interview in focus.");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [active, warn]);

  // Paste + right-click + dev-tools shortcuts.
  React.useEffect(() => {
    if (!active) return;
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      warn("paste_detected", "Pasting is monitored and lowers your score.", {
        length: text.length,
        preview: text.slice(0, 80),
      });
    };
    const onContextMenu = (e: MouseEvent) => {
      warn("right_click", "Right-click is disabled during the interview.");
      e.preventDefault();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const blocked =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (e.ctrlKey && e.key.toLowerCase() === "u");
      if (blocked) {
        warn("suspicious_shortcut", "DevTools shortcuts are disabled.", {
          key: e.key,
          ctrl: e.ctrlKey,
          shift: e.shiftKey,
        });
        e.preventDefault();
      }
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, warn]);

  // Camera watchdog — if the only video track ends, warn and notify the page.
  React.useEffect(() => {
    if (!active || !stream) return;
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) return;
    const handler = () => {
      warn(
        "camera_stopped",
        "Your camera was turned off. The interview requires the camera to stay on.",
      );
      onCameraLost?.();
    };
    tracks.forEach((t) => t.addEventListener("ended", handler));
    return () => {
      tracks.forEach((t) => t.removeEventListener("ended", handler));
    };
  }, [active, stream, warn, onCameraLost]);

  // Vision heuristics — motion + dark frame. Sampled at ~2 Hz on a 64×48
  // canvas; cheap enough to run continuously and accurate enough to catch
  // "covered camera" and "looking sideways for an extended period".
  React.useEffect(() => {
    if (!active || !videoEl) return;
    const W = 64;
    const H = 48;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let prev: Uint8ClampedArray | null = null;
    let motionStreak = 0;
    let darkStreak = 0;
    const id = setInterval(() => {
      if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) return;
      try {
        ctx.drawImage(videoEl, 0, 0, W, H);
        const frame = ctx.getImageData(0, 0, W, H).data;
        // Mean luminance for the dark-frame heuristic.
        let sumLum = 0;
        for (let i = 0; i < frame.length; i += 16) {
          sumLum += 0.299 * frame[i] + 0.587 * frame[i + 1] + 0.114 * frame[i + 2];
        }
        const avgLum = sumLum / (frame.length / 16);
        if (avgLum < 18) {
          darkStreak++;
          if (darkStreak >= 4) {
            warn("camera_blocked", "Your camera looks dark or covered.", {
              avg_brightness: Number(avgLum.toFixed(1)),
            });
            darkStreak = 0;
          }
        } else darkStreak = Math.max(0, darkStreak - 1);
        // Frame-diff motion.
        if (prev) {
          let sumDiff = 0;
          let n = 0;
          for (let i = 0; i < prev.length; i += 16) {
            const la = 0.299 * prev[i] + 0.587 * prev[i + 1] + 0.114 * prev[i + 2];
            const lb = 0.299 * frame[i] + 0.587 * frame[i + 1] + 0.114 * frame[i + 2];
            sumDiff += Math.abs(la - lb);
            n++;
          }
          const diff = sumDiff / n / 255;
          if (diff > 0.08) {
            motionStreak++;
            if (motionStreak >= 3) {
              warn(
                "excessive_motion",
                "Please stay still and keep your face in view.",
                { diff: Number(diff.toFixed(3)) },
              );
              motionStreak = 0;
            }
          } else motionStreak = Math.max(0, motionStreak - 1);
        }
        prev = frame;
      } catch {
        // Hidden tab can throw on drawImage — safe to ignore.
      }
    }, 600);
    return () => {
      clearInterval(id);
      prev = null;
    };
  }, [active, videoEl, warn]);

  return { warnings, flagged, latestMessage };
}

export const ANTICHEAT_MAX_WARNINGS = MAX_WARNINGS_BEFORE_FLAG;
