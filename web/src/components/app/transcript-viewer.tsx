"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "./score-badge";
import { formatDuration } from "@/lib/format";
import type { TranscriptTurn } from "@/types";

interface Props {
  transcript: TranscriptTurn[];
  activeTimestamp?: number;
  onSeek?: (timestamp: number) => void;
}

export function TranscriptViewer({ transcript, activeTimestamp, onSeek }: Props) {
  return (
    <div className="space-y-3">
      {transcript.map((turn) => {
        const isInterviewer = turn.speaker === "interviewer";
        const active =
          activeTimestamp !== undefined &&
          activeTimestamp >= turn.timestamp &&
          activeTimestamp <
            (transcript[transcript.indexOf(turn) + 1]?.timestamp ?? Infinity);
        return (
          <button
            key={turn.id}
            type="button"
            onClick={() => onSeek?.(turn.timestamp)}
            className={cn(
              "block w-full rounded-md border border-transparent p-3 text-left transition-colors",
              active
                ? "border-[color-mix(in_oklab,var(--primary)_30%,transparent)] bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]"
                : "hover:border-border hover:bg-accent/40",
            )}
          >
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn(
                  "font-medium tabular",
                  isInterviewer ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {formatDuration(turn.timestamp * 1000)}
              </span>
              <Badge
                variant={isInterviewer ? "outline" : "primary"}
                className="text-[10px]"
              >
                {isInterviewer ? "Interviewer" : "Candidate"}
              </Badge>
              {turn.topic && (
                <span className="text-[11px] text-muted-foreground">
                  · {turn.topic}
                </span>
              )}
              {turn.score !== undefined && (
                <ScoreBadge size="sm" score={turn.score} className="ml-auto" />
              )}
            </div>
            <p
              className={cn(
                "mt-2 text-sm leading-relaxed",
                isInterviewer ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {turn.text}
            </p>
          </button>
        );
      })}
    </div>
  );
}
