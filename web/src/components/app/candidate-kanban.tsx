"use client";

import * as React from "react";
import Link from "next/link";
import type { Candidate, CandidateStatus } from "@/types";
import { ScoreBadge } from "./score-badge";
import { Badge } from "@/components/ui/badge";
import { relative } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLUMNS: { id: CandidateStatus; label: string; tint: string }[] = [
  { id: "applied", label: "Applied", tint: "bg-secondary" },
  { id: "ai_screened", label: "AI Screened", tint: "bg-[color-mix(in_oklab,var(--primary)_8%,transparent)]" },
  { id: "shortlisted", label: "Shortlisted", tint: "bg-[color-mix(in_oklab,var(--chart-5)_8%,transparent)]" },
  { id: "human_round", label: "Human Round", tint: "bg-[color-mix(in_oklab,var(--chart-6)_8%,transparent)]" },
  { id: "offered", label: "Offered", tint: "bg-[color-mix(in_oklab,var(--warning)_8%,transparent)]" },
  { id: "hired", label: "Hired", tint: "bg-[color-mix(in_oklab,var(--success)_8%,transparent)]" },
];

export function CandidateKanban({ data }: { data: Candidate[] }) {
  const grouped = React.useMemo(() => {
    const m = new Map<CandidateStatus, Candidate[]>();
    for (const c of COLUMNS) m.set(c.id, []);
    m.set("rejected", []);
    for (const c of data) {
      m.get(c.status)?.push(c);
    }
    return m;
  }, [data]);

  return (
    <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-3">
      {COLUMNS.map((col) => {
        const items = grouped.get(col.id) ?? [];
        return (
          <div
            key={col.id}
            className="flex w-[280px] shrink-0 flex-col rounded-lg border border-border bg-card"
          >
            <div
              className={cn(
                "flex items-center justify-between border-b border-border px-3 py-2 rounded-t-lg",
                col.tint,
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wider">
                  {col.label}
                </span>
                <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-[11px] tabular text-muted-foreground">
                  {items.length}
                </span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 max-h-[calc(100vh-280px)]">
              {items.length === 0 && (
                <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                  No candidates
                </div>
              )}
              {items.map((c) => (
                <Link
                  key={c.id}
                  href={`/candidates/${c.id}`}
                  className="group rounded-md border border-border bg-background p-3 transition-colors hover:bg-accent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium group-hover:underline">
                        {c.name}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.currentTitle}
                      </div>
                    </div>
                    <ScoreBadge size="sm" score={c.overallScore} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.skills.slice(0, 3).map((s) => (
                      <Badge
                        key={s}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {s}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground tabular">
                    {relative(c.lastActivityAt)}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
