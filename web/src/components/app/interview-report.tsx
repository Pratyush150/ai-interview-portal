"use client";

import * as React from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  ArrowRight,
  Loader2,
  Download,
  Code2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getReport, type ReportEnvelope, type CodingSubmission } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  sessionId: string | null;
  elapsedSec: number;
  turnCount: number;
  candidateAnswers: number;
  interviewerName: string;
  onBackToDashboard: () => void;
}

const REC_LABEL: Record<string, string> = {
  strong_hire: "Strong Hire",
  hire: "Hire",
  lean_hire: "Lean Hire",
  lean_no: "Lean No-Hire",
  no_hire: "No Hire",
};

const REC_COLOR: Record<string, string> = {
  strong_hire: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  hire: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  lean_hire: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  lean_no: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  no_hire: "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

const BAR_LABEL: Record<string, string> = {
  below: "Below the bar",
  at: "At the bar",
  above: "Above the bar",
};

export function InterviewReport({
  sessionId,
  elapsedSec,
  turnCount,
  candidateAnswers,
  interviewerName,
  onBackToDashboard,
}: Props) {
  const [data, setData] = React.useState<ReportEnvelope | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setLoading(false);
      setError("No session reference available.");
      return;
    }
    (async () => {
      try {
        const r = await getReport(sessionId);
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled)
          setError((e as Error).message || "Couldn't load the report.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
        <Loader2 className="size-8 animate-spin text-[var(--primary)]" />
        <h1 className="text-lg font-semibold">
          {interviewerName} is finalising your report…
        </h1>
        <p className="text-sm text-muted-foreground">
          Synthesizing strengths, weaknesses, and a recommendation. This
          typically takes 5–15 seconds.
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <Sparkles className="mb-4 size-7 text-[var(--primary)]" />
        <h1 className="text-xl font-semibold">Thanks for your time.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your interview has been submitted. We couldn&apos;t fetch the live
          report ({error ?? "unknown"}); the hiring team will still receive
          it.
        </p>
        <div className="mt-6 rounded-md border border-border px-4 py-3 text-xs tabular text-muted-foreground">
          Duration: {formatDuration(elapsedSec * 1000)} · {turnCount} turns ·{" "}
          {candidateAnswers} answers
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onBackToDashboard}
        >
          Back to dashboard
        </Button>
      </div>
    );
  }

  const r = data.report;
  const dims = r.dimension_averages;
  const recommendationKey = r.recommendation;
  const recColor = REC_COLOR[recommendationKey] ?? REC_COLOR.lean_hire;
  const recLabel = REC_LABEL[recommendationKey] ?? "Pending";
  const score = data.avg_score ?? 0;
  const codingSubmissions = data.coding_submissions ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Badge variant="outline" className="mb-2">
            Interview complete
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            Thanks{data.candidate_name ? `, ${data.candidate_name}` : ""}.
            Here&apos;s how it went.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.job_title ? `${data.job_title} · ` : ""}
            {data.role_family.replace(/_/g, " ")} · {data.seniority}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onBackToDashboard}>
          <ArrowRight className="size-3.5" />
          Dashboard
        </Button>
      </div>

      {/* Hero row: recommendation + score */}
      <Card>
        <CardContent className="grid gap-6 p-6 md:grid-cols-3">
          <div className={cn("rounded-lg border p-4", recColor)}>
            <div className="text-xs font-medium uppercase tracking-wider opacity-80">
              Recommendation
            </div>
            <div className="mt-1 text-2xl font-semibold">{recLabel}</div>
            <p className="mt-2 text-sm leading-relaxed">
              {r.recommendation_reason}
            </p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Overall score
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular tracking-tight">
                {score.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground tabular">
                / 10
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {BAR_LABEL[r.vs_seniority_bar] ?? "Pending"} ·{" "}
              {data.evaluations_count} evaluated turns
            </div>
          </div>
          <div className="rounded-lg border border-border p-4">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Session
            </div>
            <div className="mt-1 text-sm tabular">
              {formatDuration(elapsedSec * 1000)} of{" "}
              {String(data.target_duration_min).slice(0, 4)} min
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular">
              {turnCount} turns · {candidateAnswers} candidate answers
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3" />
              {r.ai_integrity_note}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary paragraph */}
      <Card className="mt-4">
        <CardContent className="p-6">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
            Summary from {data.interviewer_name}
          </div>
          <p className="mt-2 text-sm leading-relaxed">{r.summary_paragraph}</p>
        </CardContent>
      </Card>

      {/* Dimension bars */}
      <Card className="mt-4">
        <CardContent className="p-6">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Dimension breakdown
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <DimensionBar label="Correctness" value={dims.correctness} />
            <DimensionBar label="Depth" value={dims.depth} />
            <DimensionBar label="Communication" value={dims.communication} />
            <DimensionBar label="Relevance" value={dims.relevance} />
          </div>
        </CardContent>
      </Card>

      {/* Strengths + weaknesses */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <EvidenceCard
          title="Top strengths"
          tone="positive"
          icon={<CheckCircle2 className="size-4" />}
          items={r.top_strengths}
          empty="No standout strengths surfaced in this session."
        />
        <EvidenceCard
          title="Areas to develop"
          tone="caution"
          icon={<AlertTriangle className="size-4" />}
          items={r.top_weaknesses}
          empty="No major weaknesses surfaced — well done."
        />
      </div>

      {/* Topic coverage */}
      {r.topic_coverage.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-6">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Topic coverage
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {r.topic_coverage.map((t, i) => (
                <div
                  key={`${t.topic}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/40 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1 truncate">{t.topic}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge
                      variant="outline"
                      className={cn(
                        "tabular",
                        t.depth === "strong" &&
                          "border-emerald-500/30 text-emerald-600",
                        t.depth === "shallow" &&
                          "border-rose-500/30 text-rose-600",
                      )}
                    >
                      {t.depth}
                    </Badge>
                    <span className="tabular text-muted-foreground">
                      {t.score.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coding round — problem, full submission, and per-problem score */}
      {codingSubmissions.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-6">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
              <Code2 className="size-3.5" />
              Coding round
            </div>
            <div className="mt-3 space-y-4">
              {codingSubmissions.map((c, i) => (
                <CodingSubmissionBlock key={i} sub={c} index={i} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next-round focus */}
      {r.next_round_focus.length > 0 && (
        <Card className="mt-4">
          <CardContent className="p-6">
            <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              What the next round should focus on
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {r.next_round_focus.map((n, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-[10px] font-medium tabular text-[var(--primary)]">
                    {i + 1}
                  </span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          A copy of this report has been sent to the hiring team. They&apos;ll
          typically respond within a few business days.
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `interview-${data.session_id}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="size-3.5" />
          Download JSON
        </Button>
      </div>
    </div>
  );
}

function CodingSubmissionBlock({
  sub,
  index,
}: {
  sub: CodingSubmission;
  index: number;
}) {
  const strengths = sub.strengths ?? [];
  const weaknesses = sub.weaknesses ?? [];
  return (
    <div className="rounded-md border border-border bg-card/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {index + 1}. {sub.title}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Language: {sub.language}
          </div>
        </div>
        {sub.score != null && (
          <Badge variant="outline" className="tabular shrink-0">
            {sub.score.toFixed(1)} / 10
          </Badge>
        )}
      </div>
      <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs leading-relaxed">
        <code>{sub.code || "(no submission captured)"}</code>
      </pre>
      {(strengths.length > 0 || weaknesses.length > 0 || sub.notes) && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {strengths.length > 0 && (
            <div>
              <div className="text-xs font-medium text-emerald-600">
                Strengths
              </div>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {strengths.map((x, j) => (
                  <li key={j}>• {x}</li>
                ))}
              </ul>
            </div>
          )}
          {weaknesses.length > 0 && (
            <div>
              <div className="text-xs font-medium text-amber-600">
                Weaknesses
              </div>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {weaknesses.map((x, j) => (
                  <li key={j}>• {x}</li>
                ))}
              </ul>
            </div>
          )}
          {sub.notes && (
            <div className="md:col-span-2">
              <div className="text-xs font-medium text-muted-foreground">
                Verdict
              </div>
              <p className="mt-1 text-xs italic text-muted-foreground">
                {sub.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, (value / 10) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="tabular text-muted-foreground">
          {value.toFixed(1)} / 10
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-[var(--primary)] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function EvidenceCard({
  title,
  tone,
  icon,
  items,
  empty,
}: {
  title: string;
  tone: "positive" | "caution";
  icon: React.ReactNode;
  items: { point: string; evidence: string }[];
  empty: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider",
            tone === "positive" ? "text-emerald-600" : "text-amber-600",
          )}
        >
          {icon}
          {title}
        </div>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="mt-3 space-y-3 text-sm">
            {items.map((it, i) => (
              <li key={i}>
                <div className="font-medium">{it.point}</div>
                {it.evidence && (
                  <div className="mt-0.5 text-xs italic text-muted-foreground">
                    “{it.evidence}”
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
