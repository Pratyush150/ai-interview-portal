"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FunnelChart } from "@/components/app/funnel-chart";
import { TimeTrend } from "@/components/app/time-trend";
import { ScoreDistribution } from "@/components/app/score-distribution";
import {
  useFunnel,
  useScoreDistribution,
  useSkillHeatmap,
  useTimeToHire,
} from "@/lib/mock-api";
import { lakhs, rupees } from "@/lib/format";
import { useAuth } from "@/stores/auth-store";
import { Lock } from "lucide-react";

export default function AnalyticsPage() {
  const user = useAuth((s) => s.user);
  if (user && !user.canViewAnalytics) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6">
          <Lock className="size-4 text-muted-foreground" />
          <div>
            <div className="text-sm font-medium">Analytics is restricted</div>
            <div className="text-xs text-muted-foreground">
              Your role doesn&apos;t have analytics access. Ask an admin to upgrade your seat.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return <AnalyticsView />;
}

function AnalyticsView() {
  const { data: funnel, isLoading: l1 } = useFunnel();
  const { data: trend, isLoading: l2 } = useTimeToHire();
  const { data: dist, isLoading: l3 } = useScoreDistribution();
  const { data: heat, isLoading: l4 } = useSkillHeatmap();

  const [recruiters, setRecruiters] = React.useState(2);
  const [openings, setOpenings] = React.useState(8);
  const [salaryAvg, setSalaryAvg] = React.useState(28_00_000);

  const cph = Math.round(((salaryAvg * 0.18) + (recruiters * 80_000)) / Math.max(1, openings));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Hiring analytics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Across all roles · last 8 weeks · IST
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Hiring funnel</CardTitle>
            <CardDescription>Conversion across pipeline stages.</CardDescription>
          </CardHeader>
          <CardContent>
            {l1 ? <Skeleton className="h-[260px]" /> : <FunnelChart data={funnel ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time-to-hire</CardTitle>
            <CardDescription>Median days from apply → offer.</CardDescription>
          </CardHeader>
          <CardContent>
            {l2 ? <Skeleton className="h-[220px]" /> : <TimeTrend data={trend ?? []} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Score distribution</CardTitle>
            <CardDescription>Across all interviewed candidates.</CardDescription>
          </CardHeader>
          <CardContent>
            {l3 ? <Skeleton className="h-[220px]" /> : <ScoreDistribution data={dist ?? []} />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Skill heatmap</CardTitle>
            <CardDescription>Top skills across candidate score bands.</CardDescription>
          </CardHeader>
          <CardContent>
            {l4 ? (
              <Skeleton className="h-[220px]" />
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Skill</th>
                      <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Low (&lt;5)</th>
                      <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Mid (5–7.5)</th>
                      <th className="px-3 py-2 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">High (7.5+)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {heat?.map((r) => {
                      const total = r.low + r.mid + r.high;
                      return (
                        <tr key={r.skill} className="border-t border-border">
                          <td className="px-3 py-2 font-medium">{r.skill}</td>
                          <td className="px-3 py-2 text-right">
                            <HeatCell value={r.low} total={total} tone="danger" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <HeatCell value={r.mid} total={total} tone="primary" />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <HeatCell value={r.high} total={total} tone="success" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost-per-hire</CardTitle>
            <CardDescription>Quick estimator — adjust the inputs.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Active recruiters</Label>
              <Input
                value={recruiters}
                onChange={(e) => setRecruiters(Number(e.target.value) || 0)}
                className="mt-1 tabular"
              />
            </div>
            <div>
              <Label>Openings (this quarter)</Label>
              <Input
                value={openings}
                onChange={(e) => setOpenings(Number(e.target.value) || 0)}
                className="mt-1 tabular"
              />
            </div>
            <div>
              <Label>Avg salary offered</Label>
              <Input
                value={salaryAvg}
                onChange={(e) => setSalaryAvg(Number(e.target.value) || 0)}
                className="mt-1 tabular"
              />
              <p className="mt-1 text-[11px] text-muted-foreground tabular">
                ≈ {lakhs(salaryAvg)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Estimated cost per hire
              </div>
              <div className="mt-1 text-2xl font-semibold tabular">
                {rupees(cph)}
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Assumes 18% loaded recruiter cost + ₹80K platform overhead.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HeatCell({
  value,
  total,
  tone,
}: {
  value: number;
  total: number;
  tone: "danger" | "primary" | "success";
}) {
  const intensity = total > 0 ? value / total : 0;
  const bg =
    tone === "danger"
      ? `color-mix(in oklab, var(--danger) ${Math.round(intensity * 60)}%, transparent)`
      : tone === "primary"
        ? `color-mix(in oklab, var(--primary) ${Math.round(intensity * 60)}%, transparent)`
        : `color-mix(in oklab, var(--success) ${Math.round(intensity * 60)}%, transparent)`;
  return (
    <span
      className="inline-flex min-w-[44px] justify-center rounded px-2 py-0.5 tabular"
      style={{ background: bg }}
    >
      {value}
    </span>
  );
}
