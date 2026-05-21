"use client";

import Link from "next/link";
import { MapPin, Clock } from "lucide-react";
import type { Candidate } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreBadge } from "./score-badge";
import { StatusPill } from "./status-pill";
import { relative } from "@/lib/format";

export function CandidateGrid({ data }: { data: Candidate[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.map((c) => (
        <Link key={c.id} href={`/candidates/${c.id}`}>
          <Card className="h-full transition-colors hover:bg-accent/40">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium tabular">
                    {c.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {c.currentTitle} · {c.currentCompany}
                    </div>
                  </div>
                </div>
                <ScoreBadge score={c.overallScore} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1">
                {c.skills.slice(0, 4).map((s) => (
                  <Badge key={s} variant="outline" className="text-[10px]">
                    {s}
                  </Badge>
                ))}
                {c.skills.length > 4 && (
                  <Badge variant="outline" className="text-[10px] tabular">
                    +{c.skills.length - 4}
                  </Badge>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <MapPin className="size-3" />
                  {c.city}
                </span>
                <span className="flex items-center gap-1 tabular">
                  <Clock className="size-3" />
                  {relative(c.lastActivityAt)}
                </span>
                <StatusPill status={c.status} />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
