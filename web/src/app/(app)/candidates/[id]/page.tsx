"use client";

import { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Briefcase,
  Mail,
  MapPin,
  Phone,
  Calendar,
  AlertTriangle,
  Check,
  X,
  Download,
  Clock,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ScoreBadge } from "@/components/app/score-badge";
import { StatusPill } from "@/components/app/status-pill";
import { SkillBarChart } from "@/components/app/skill-bar-chart";
import { TranscriptViewer } from "@/components/app/transcript-viewer";
import {
  useCandidate,
  useInterviewSession,
  useRole,
} from "@/lib/mock-api";
import { ist, lakhs, formatDuration, relative } from "@/lib/format";
import { toast } from "sonner";

export default function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: candidate, isLoading } = useCandidate(id);
  const { data: role } = useRole(candidate?.roleId);
  const { data: session } = useInterviewSession("sess_priya_001");

  if (isLoading || !candidate) {
    return <DetailSkeleton />;
  }

  const breakdown = [
    { dimension: "Correctness", score: candidate.scoreBreakdown.correctness },
    { dimension: "Depth", score: candidate.scoreBreakdown.depth },
    {
      dimension: "Communication",
      score: candidate.scoreBreakdown.communication,
    },
    { dimension: "Relevance", score: candidate.scoreBreakdown.relevance },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Button asChild variant="ghost" size="sm" className="-ml-2 px-2">
          <Link href="/candidates">
            <ArrowLeft className="size-3.5" />
            Candidates
          </Link>
        </Button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{candidate.name}</span>
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-medium tabular">
                {candidate.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">
                    {candidate.name}
                  </h1>
                  <StatusPill status={candidate.status} />
                </div>
                <div className="text-sm text-muted-foreground">
                  {candidate.currentTitle} at {candidate.currentCompany} ·{" "}
                  {candidate.experienceYears.toFixed(1)} yrs
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Mail className="size-3" /> {candidate.email}
                  </span>
                  <span className="inline-flex items-center gap-1 tabular">
                    <Phone className="size-3" /> {candidate.phone}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" /> {candidate.city}
                  </span>
                  {role && (
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="size-3" /> {role.title}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.success("Interview scheduled for next round")}
              >
                <Calendar className="size-3.5" />
                Schedule next round
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.error("Candidate rejected")}
              >
                <X className="size-3.5" />
                Reject
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => toast.success("Hire confirmed")}
              >
                <Check className="size-3.5" />
                Hire
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardDescription>Overall score</CardDescription>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold tabular tracking-tight">
                {candidate.overallScore.toFixed(1)}
              </span>
              <span className="text-sm text-muted-foreground tabular">
                / 10
              </span>
            </div>
            <div className="text-xs text-muted-foreground tabular">
              {candidate.percentile}th percentile · AI likelihood{" "}
              {(candidate.aiLikelihood * 100).toFixed(0)}%
            </div>
          </CardHeader>
          <CardContent>
            <SkillBarChart data={breakdown} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-[var(--primary)]" />
              AI summary
            </CardTitle>
            <CardDescription>
              Generated from {session?.transcript.length ?? 0} turns across{" "}
              {formatDuration((session?.durationSec ?? 0) * 1000)} of interview.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              {candidate.highlights.map((h, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--primary)_18%,transparent)] text-[10px] font-medium tabular text-[var(--primary)]">
                    {i + 1}
                  </span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
            <div className="grid gap-3 pt-2 sm:grid-cols-2">
              <div className="rounded-md border border-border p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--success)]">
                  Strengths
                </div>
                <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  {candidate.strengths.map((s, i) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-border p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-[var(--warning)]">
                  Improvements
                </div>
                <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                  {candidate.improvements.map((s, i) => (
                    <li key={i}>· {s}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="video">Video</TabsTrigger>
          <TabsTrigger value="cheat">
            Cheat analysis
            {session && session.cheatFlags.length > 0 && (
              <span className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full bg-[var(--warning)] text-[10px] tabular font-medium text-white">
                {session.cheatFlags.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="resume">Resume</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Resume summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {candidate.resumeSummary}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SummaryRow label="Notice period" value={candidate.noticePeriod} />
                  <SummaryRow
                    label="Expected CTC"
                    value={lakhs(candidate.expectedCtc)}
                  />
                  <SummaryRow
                    label="Languages"
                    value={candidate.languages.join(", ")}
                  />
                  <SummaryRow
                    label="Applied"
                    value={ist(candidate.appliedAt, "d MMM, yyyy")}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Skills</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.skills.map((s) => (
                    <Badge key={s} variant="default">
                      {s}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transcript">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Interview transcript</CardTitle>
                <CardDescription>
                  Click any turn to seek the video.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular">
                <Clock className="size-3.5" />
                {session ? formatDuration(session.durationSec * 1000) : "—"} ·{" "}
                {session?.transcript.length ?? 0} turns
              </div>
            </CardHeader>
            <CardContent>
              {session ? (
                <TranscriptViewer transcript={session.transcript} />
              ) : (
                <Skeleton className="h-[400px] w-full" />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="video">
          <Card>
            <CardContent className="p-0">
              <div className="grid gap-0 md:grid-cols-2">
                <div className="aspect-video bg-[#0A0A0A] flex items-center justify-center text-muted-foreground border-r border-border">
                  <div className="text-center text-xs">
                    <div className="mx-auto mb-2 size-12 rounded-full border border-border" />
                    Video playback
                    <div className="mt-1 tabular text-[11px]">
                      00:00 /{" "}
                      {session
                        ? formatDuration(session.durationSec * 1000)
                        : "—"}
                    </div>
                  </div>
                </div>
                <div className="max-h-[480px] overflow-y-auto p-4">
                  {session && <TranscriptViewer transcript={session.transcript} />}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cheat">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Cheat analysis</CardTitle>
                <CardDescription>
                  Confidence{" "}
                  <span className="tabular text-foreground font-medium">
                    {((session?.cheatScore ?? 0) * 100).toFixed(0)}%
                  </span>{" "}
                  · {session?.cheatFlags.length ?? 0} flagged moments
                </CardDescription>
              </div>
              <Badge
                variant={
                  (session?.cheatScore ?? 0) > 0.5
                    ? "danger"
                    : (session?.cheatScore ?? 0) > 0.2
                      ? "warning"
                      : "success"
                }
              >
                {(session?.cheatScore ?? 0) > 0.5
                  ? "High risk"
                  : (session?.cheatScore ?? 0) > 0.2
                    ? "Review needed"
                    : "Clean"}
              </Badge>
            </CardHeader>
            <CardContent>
              {session?.cheatFlags.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  No suspicious behaviour detected.
                </div>
              ) : (
                <ul className="space-y-2">
                  {session?.cheatFlags.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-md border border-border p-3"
                    >
                      <div className="flex items-center gap-2">
                        <AlertTriangle
                          className={
                            f.severity === "high"
                              ? "size-4 text-[var(--danger)]"
                              : f.severity === "medium"
                                ? "size-4 text-[var(--warning)]"
                                : "size-4 text-muted-foreground"
                          }
                        />
                        <span className="text-sm font-medium capitalize">
                          {f.type.replaceAll("_", " ")}
                        </span>
                        <Badge
                          variant={
                            f.severity === "high"
                              ? "danger"
                              : f.severity === "medium"
                                ? "warning"
                                : "default"
                          }
                          className="ml-auto"
                        >
                          {f.severity}
                        </Badge>
                        <span className="text-xs text-muted-foreground tabular">
                          {formatDuration(f.timestamp * 1000)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {f.description}
                      </p>
                      {f.evidence && (
                        <pre className="mt-2 overflow-x-auto rounded bg-muted px-3 py-2 text-[11px] text-muted-foreground tabular">
                          {f.evidence}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resume">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Resume</CardTitle>
                <CardDescription>
                  Uploaded {relative(candidate.appliedAt)}
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.success("Download started")}
              >
                <Download className="size-3.5" />
                Download
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border bg-muted/30 p-6 text-sm leading-relaxed text-muted-foreground">
                <p className="mb-3 font-medium text-foreground">
                  {candidate.name}
                </p>
                <p className="mb-4 text-xs">
                  {candidate.email} · {candidate.phone} · {candidate.city}
                </p>
                <p className="mb-3 font-medium text-foreground">Summary</p>
                <p className="mb-4">{candidate.resumeSummary}</p>
                <p className="mb-3 font-medium text-foreground">Skills</p>
                <p className="mb-4">{candidate.skills.join(" · ")}</p>
                <p className="mb-3 font-medium text-foreground">Experience</p>
                <p>
                  {candidate.currentTitle} at {candidate.currentCompany} ·{" "}
                  {candidate.experienceYears.toFixed(1)} years
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[260px]" />
        <Skeleton className="h-[260px] lg:col-span-2" />
      </div>
      <Skeleton className="h-9 w-72" />
      <Skeleton className="h-[300px]" />
    </div>
  );
}
