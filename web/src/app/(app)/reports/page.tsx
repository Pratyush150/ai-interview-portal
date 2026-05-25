"use client";

import * as React from "react";
import { Loader2, FileText, X, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

function apiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

interface SessionRow {
  session_id: string;
  stage: string;
  status: string;
  total_score: number | null;
  created_at: string;
  finished_at: string | null;
  target_duration_min: number | null;
  role_family: string | null;
  seniority: string | null;
  has_report: boolean;
  candidate_name: string | null;
  candidate_email: string | null;
  job_title: string | null;
  job_id: string | null;
  aptitude_score: number | null;
  aptitude_status: string | null;
}

interface EvalRow {
  turn_number: number;
  stage: string;
  score: number | null;
  correctness: number | null;
  depth: number | null;
  communication: number | null;
  relevance: number | null;
  topic: string | null;
  strengths: string | null;
  weaknesses: string | null;
  notes: string | null;
  ai_likelihood: number | null;
  candidate_excerpt: string | null;
}

interface ReportDetail {
  session_id: string;
  candidate_name: string | null;
  candidate_email: string | null;
  job_title: string | null;
  stage: string;
  status: string;
  total_score: number | null;
  created_at: string;
  finished_at: string | null;
  report: Record<string, unknown> | null;
  evaluations: EvalRow[];
  cheating_flags: unknown[];
}

export default function ReportsPage() {
  const slug = useAuth((s) => s.user?.companySlug);
  const token = useAuth((s) => s.user?.authToken);

  const [rows, setRows] = React.useState<SessionRow[] | null>(null);
  const [filter, setFilter] = React.useState("");
  const [active, setActive] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ReportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!slug || !token) return;
    try {
      const r = await fetch(`${apiBase()}/api/c/${slug}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setRows(await r.json());
    } catch (e) {
      toast.error("Couldn't load reports: " + (e as Error).message);
    }
  }, [slug, token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function openReport(sid: string) {
    setActive(sid);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const r = await fetch(
        `${apiBase()}/api/c/${slug}/sessions/${sid}/report`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.detail || `HTTP ${r.status}`);
      }
      setDetail(await r.json());
    } catch (e) {
      toast.error((e as Error).message);
      setActive(null);
    } finally {
      setLoadingDetail(false);
    }
  }

  const filtered = React.useMemo(() => {
    if (!rows) return [];
    const f = filter.trim().toLowerCase();
    if (!f) return rows;
    return rows.filter(
      (r) =>
        (r.candidate_name ?? "").toLowerCase().includes(f) ||
        (r.candidate_email ?? "").toLowerCase().includes(f) ||
        (r.job_title ?? "").toLowerCase().includes(f),
    );
  }, [rows, filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Interview reports</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every interview session in this workspace — across all candidates
            and emails. Click any row to view the synthesized report.
          </p>
        </div>
        <Button onClick={load} variant="outline" size="sm" className="gap-1.5">
          <RefreshCw className="size-3.5" /> Refresh
        </Button>
      </div>

      <Input
        placeholder="Filter by name, email, or role…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-md"
      />

      {rows === null ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No interviews yet."
              : "No interviews match that filter."}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-card/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Candidate</th>
                  <th className="px-4 py-2.5 text-left font-medium">Role</th>
                  <th className="px-4 py-2.5 text-left font-medium">Stage</th>
                  <th className="px-4 py-2.5 text-left font-medium">Apti</th>
                  <th className="px-4 py-2.5 text-right font-medium">Score</th>
                  <th className="px-4 py-2.5 text-left font-medium">When</th>
                  <th className="px-4 py-2.5 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.session_id}
                    className="cursor-pointer border-b border-border last:border-b-0 hover:bg-accent/30"
                    onClick={() => openReport(r.session_id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{r.candidate_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground tabular">
                        {r.candidate_email ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="line-clamp-1">{r.job_title ?? "—"}</div>
                      <div className="text-[11px] text-muted-foreground capitalize">
                        {r.seniority} · {(r.role_family ?? "").replace(/_/g, " ")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {r.stage.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {r.aptitude_status ? (
                        <span
                          className={cn(
                            "tabular",
                            r.aptitude_status === "passed" && "text-[var(--success,#10b981)]",
                            r.aptitude_status === "failed" && "text-[var(--danger)]",
                          )}
                        >
                          {r.aptitude_score !== null ? `${r.aptitude_score}/10` : r.aptitude_status}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular">
                      {r.total_score !== null ? r.total_score.toFixed(1) : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular">
                      {r.created_at?.replace("T", " ").slice(0, 16)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" className="gap-1">
                        <FileText className="size-3.5" />
                        {r.has_report ? "Report" : "View"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Report side panel */}
      {active && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setActive(null)}
        >
          <div
            className="h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-background shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-5 py-3 backdrop-blur-sm">
              <FileText className="size-4" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">
                  {detail?.candidate_name ?? "Loading…"}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {detail?.job_title ?? ""}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setActive(null)}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="p-5">
              {loadingDetail ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Loading report…
                </div>
              ) : detail ? (
                <ReportDetailView detail={detail} />
              ) : (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No data
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportDetailView({ detail }: { detail: ReportDetail }) {
  const report = (detail.report ?? {}) as {
    hire_recommendation?: string;
    summary?: string;
    strengths?: string[];
    weaknesses?: string[];
    dimensions?: Record<string, number>;
    topics_covered?: string[];
    ai_detection_summary?: string;
  };
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Total score" value={detail.total_score?.toFixed(1) ?? "—"} />
        <Stat
          label="Recommendation"
          value={report.hire_recommendation?.replace(/_/g, " ") ?? "—"}
          className="capitalize"
        />
        <Stat label="Stage reached" value={detail.stage.replace(/_/g, " ")} className="capitalize" />
      </div>

      {!detail.report && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No synthesized report was generated for this session. (The interview
            may still be in progress, or the candidate didn't reach the report
            step.) Per-turn evaluations below are still available.
          </CardContent>
        </Card>
      )}

      {report.summary && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Summary
          </h3>
          <p className="text-sm leading-relaxed">{report.summary}</p>
        </section>
      )}

      {(report.strengths?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Strengths
          </h3>
          <ul className="space-y-1 text-sm">
            {report.strengths!.map((s, i) => (
              <li key={i} className="leading-relaxed">
                • {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(report.weaknesses?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Weaknesses
          </h3>
          <ul className="space-y-1 text-sm">
            {report.weaknesses!.map((s, i) => (
              <li key={i} className="leading-relaxed">
                • {s}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.dimensions && Object.keys(report.dimensions).length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Per-dimension averages
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(report.dimensions).map(([k, v]) => (
              <Stat key={k} label={k.replace(/_/g, " ")} value={Number(v).toFixed(1)} className="capitalize" />
            ))}
          </div>
        </section>
      )}

      {detail.evaluations.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Per-turn timeline
          </h3>
          <div className="space-y-2">
            {detail.evaluations.map((e, i) => (
              <Card key={i}>
                <CardContent className="p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        T{e.turn_number}
                      </Badge>
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {e.stage.replace(/_/g, " ")}
                      </Badge>
                      {e.topic && (
                        <span className="text-muted-foreground">· {e.topic}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground tabular">
                      {e.score !== null && <span>Score {e.score.toFixed(1)}</span>}
                      {e.ai_likelihood !== null && (
                        <span
                          className={cn(
                            e.ai_likelihood > 0.5 && "text-[var(--danger)]",
                          )}
                        >
                          AI {(e.ai_likelihood * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                  {e.candidate_excerpt && (
                    <div className="mt-1 text-muted-foreground italic">
                      "{e.candidate_excerpt.slice(0, 200)}"
                    </div>
                  )}
                  {e.notes && (
                    <div className="mt-1.5 text-muted-foreground">{e.notes}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {detail.cheating_flags.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cheating flags ({detail.cheating_flags.length})
          </h3>
          <pre className="overflow-x-auto rounded-md border border-border bg-card/50 p-3 text-[11px] tabular">
            {JSON.stringify(detail.cheating_flags, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-0.5 text-base font-semibold tabular", className)}>
        {value}
      </div>
    </div>
  );
}
