"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type WaveState = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  state: WaveState;
  amplitude?: number; // 0..1, drives bar heights when listening/speaking
  className?: string;
}

/**
 * Hand-rolled canvas waveform. Avoids the wavesurfer dependency and gives us
 * a single component that visualises four discrete AI states.
 */
export function AudioWaveform({ state, amplitude = 0, className }: Props) {
  const ref = React.useRef<HTMLCanvasElement | null>(null);
  const phase = React.useRef(0);
  const targetAmp = React.useRef(amplitude);
  const ampRef = React.useRef(amplitude);

  React.useEffect(() => {
    targetAmp.current = amplitude;
  }, [amplitude]);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      if (!canvas) return;
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const BAR_COUNT = 56;

    function tick() {
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Smooth amplitude towards target
      ampRef.current += (targetAmp.current - ampRef.current) * 0.18;
      phase.current += 0.04;

      const cy = h / 2;
      const colorByState: Record<WaveState, string> = {
        idle: "rgba(100, 116, 139, 0.45)",
        listening: "rgb(79, 70, 229)",
        thinking: "rgb(245, 158, 11)",
        speaking: "rgb(16, 185, 129)",
      };
      ctx.fillStyle = colorByState[state];

      const barWidth = (w / BAR_COUNT) * 0.55;
      const gap = w / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        const x = i * gap + (gap - barWidth) / 2;
        let amp: number;

        if (state === "idle") {
          amp = 0.04 + 0.03 * Math.sin(phase.current * 0.4 + i * 0.18);
        } else if (state === "listening") {
          // Gentle live wave that pulses with mic level
          const baseline = 0.05;
          const live =
            0.55 *
            ampRef.current *
            (0.5 + 0.5 * Math.sin(phase.current * 0.9 + i * 0.5));
          amp = baseline + live;
        } else if (state === "thinking") {
          // Travelling pulse — model is "processing"
          const center = ((Math.sin(phase.current * 0.6) + 1) / 2) * BAR_COUNT;
          const dist = Math.abs(i - center);
          amp = 0.05 + 0.55 * Math.exp(-(dist * dist) / (2 * 6 * 6));
        } else {
          // speaking: layered sines at moderate amplitude
          amp =
            0.18 +
            0.36 *
              Math.abs(
                Math.sin(phase.current * 1.4 + i * 0.32) *
                  Math.cos(phase.current * 0.8 + i * 0.18),
              );
        }

        const barH = Math.max(2 * dpr, amp * h * 0.78);
        const r = barWidth / 2;
        roundedRect(ctx, x, cy - barH / 2, barWidth, barH, r);
      }

      raf = requestAnimationFrame(tick);
    }
    tick();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [state]);

  return (
    <canvas
      ref={ref}
      className={cn("h-full w-full", className)}
      aria-label={`AI ${state}`}
    />
  );
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}
