"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  Clock,
  UserCheck,
  Users,
  ArrowRight,
  Briefcase,
  Loader2,
  Inbox,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/app/stat-card";
import { ScoreBadge } from "@/components/app/score-badge";
import {
  useActivityFeed,
  useDashboardStats,
  useRoles,
} from "@/lib/mock-api";
import { relative } from "@/lib/format";
import { useAuth } from "@/stores/auth-store";
import {
  fetchCompanyApplications,
  fetchCompanyJobs,
  fetchTenantApplications,
  fetchTenantJobs,
  type JobRow,
} from "@/lib/auth-api";

const ACTIVITY_LABEL: Record<string, string> = {
  application: "Applied to",
  interview_completed: "Completed interview for",
  shortlisted: "Shortlisted for",
  rejected: "Rejected for",
  offered: "Received offer for",
  hired: "Hired for",
};

const ACTIVITY_BADGE: Record<string, "default" | "primary" | "success" | "warning" | "danger"> = {
  application: "default",
  interview_completed: "primary",
  shortlisted: "primary",
  rejected: "danger",
  offered: "warning",
  hired: "success",
};

interface ApplicationRow {
  id: string;
  status: string;
  created_at: string;
  name: string;
  email: string;
  title: string;
}

export default function DashboardPage() {
  const { data: stats, isLoading: loadingStats } = useDashboardStats();
  const { data: activity, isLoading: loadingActivity } = useActivityFeed();
  const { data: mockRoles } = useRoles();
  const user = useAuth((s) => s.user);

  const [companyJobs, setCompanyJobs] = React.useState<JobRow[] | null>(null);
  const [applications, setApplications] = React.useState<ApplicationRow[] | null>(null);

  React.useEffect(() => {
    if (!user?.authToken) {
      setCompanyJobs([]);
      setApplications([]);
      return;
    }
    const tok = user.authToken;
    // Prefer the slug-aware tenant endpoints (proper multi-tenant guard).
    // Fall back to legacy /api/company/{id}/* only if the user is logged in
    // via mock and has no slug — keeps the page useful in demo mode.
    const useTenant = !!user.companySlug;
    const jobsPromise = useTenant
      ? fetchTenantJobs(user.companySlug!, tok)
      : user.companyId
      ? fetchCompanyJobs(user.companyId, tok)
      : Promise.resolve([] as JobRow[]);
    const appsPromise = useTenant
      ? fetchTenantApplications(user.companySlug!, tok)
      : user.companyId
      ? fetchCompanyApplications(user.companyId, tok)
      : Promise.resolve([] as Record<string, unknown>[]);
    jobsPromise.then(setCompanyJobs).catch(() => setCompanyJobs([]));
    appsPromise
      .then((rows) =>
        // Normalize: tenant endpoint returns {candidate_name, candidate_email,
        // job_title}; legacy returns {name, email, title}. Map both into the
        // single shape the rendering loop expects.
        setApplications(
          (rows as Record<string, unknown>[]).map((r) => ({
            id: String(r.id ?? ""),
            status: String(r.status ?? ""),
            created_at: String(r.created_at ?? ""),
            name: String(r.candidate_name ?? r.name ?? ""),
            email: String(r.candidate_email ?? r.email ?? ""),
            title: String(r.job_title ?? r.title ?? ""),
          })),
        ),
      )
      .catch(() => setApplications([]));
  }, [user?.companyId, user?.companySlug, user?.authToken]);

  const greetingName = (user?.name || "there").split(" ")[0];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Good morning, {greetingName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s what&apos;s moving in your pipeline today.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/analytics">View analytics</Link>
          </Button>
          <Button variant="primary" asChild>
            <Link href="/roles/new">
              New role
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active interviews"
          value={stats?.active ?? 0}
          delta={{ value: 12, label: "WoW" }}
          hint="In AI-screened or human round"
          icon={<Activity className="size-4" />}
          loading={loadingStats}
        />
        <StatCard
          label="Pending review"
          value={stats?.pendingReview ?? 0}
          delta={{ value: -4, label: "WoW" }}
          hint="Awaiting recruiter decision"
          icon={<Users className="size-4" />}
          loading={loadingStats}
        />
        <StatCard
          label="Avg time-to-shortlist"
          value={`${stats?.avgTimeToShortlistDays ?? "–"}d`}
          delta={{ value: -8, label: "WoW" }}
          hint="Application → shortlisted"
          icon={<Clock className="size-4" />}
          loading={loadingStats}
        />
        <StatCard
          label="Hired this week"
          value={stats?.hiredThisWeek ?? 0}
          delta={{ value: 3, label: "WoW" }}
          hint="Across all open roles"
          icon={<UserCheck className="size-4" />}
          loading={loadingStats}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/candidates">
                View all <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            {loadingActivity ? (
              <ul className="space-y-1">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 px-5 py-2.5">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/5" />
                      <Skeleton className="h-2.5 w-1/4" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul>
                {activity?.map((a) => (
                  <li
                    key={a.id}
                    className="group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-medium tabular">
                      {a.candidateName
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        <Link
                          href={`/candidates/${a.candidateId}`}
                          className="font-medium hover:underline"
                        >
                          {a.candidateName}
                        </Link>{" "}
                        <span className="text-muted-foreground">
                          {ACTIVITY_LABEL[a.type]}
                        </span>{" "}
                        <span className="font-medium">{a.roleTitle}</span>
                      </div>
                      <div className="text-xs text-muted-foreground tabular">
                        {relative(a.at)}
                      </div>
                    </div>
                    <Badge variant={ACTIVITY_BADGE[a.type] ?? "default"}>
                      {a.type.replace("_", " ")}
                    </Badge>
                    {typeof a.meta?.score === "number" && (
                      <ScoreBadge size="sm" score={a.meta.score as number} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My job postings</CardTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/roles/new">
                New <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pb-4">
            {companyJobs == null ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))
            ) : companyJobs.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No postings yet — click <strong>New</strong> to create your first
                role. It&apos;ll appear on the public board immediately.
              </div>
            ) : (
              companyJobs.slice(0, 6).map((j) => (
                <div
                  key={j.id}
                  className="flex items-center gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-accent"
                >
                  <Briefcase className="size-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{j.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      <span className="capitalize">{j.seniority}</span>
                      {" · "}
                      {j.role_family.replace(/_/g, " ")}
                    </div>
                  </div>
                  <Badge variant="outline" className="tabular">
                    {j.application_count ?? 0}
                  </Badge>
                  <Link
                    href={`/links/?job=${encodeURIComponent(j.id)}`}
                    className="text-xs text-[var(--primary)] underline-offset-4 hover:underline"
                  >
                    Manage links
                  </Link>
                </div>
              ))
            )}
            {/* Mock fallback list still useful for users with no real postings */}
            {companyJobs && companyJobs.length === 0 && mockRoles && mockRoles.length > 0 && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Demo roles
                </div>
                {mockRoles.slice(0, 3).map((r) => (
                  <div
                    key={r.id}
                    className="mt-1.5 flex items-center gap-3 rounded-md border border-dashed border-border p-2.5 text-xs"
                  >
                    <Briefcase className="size-3.5 text-muted-foreground" />
                    <div className="min-w-0 flex-1 truncate">{r.title}</div>
                    <Badge variant="outline" className="text-[10px]">
                      mock
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Real applications inbox — what candidates actually submitted */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" />
            Candidate applications
          </CardTitle>
          <Button size="sm" variant="ghost" asChild>
            <Link href="/candidates">
              All candidates <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {applications == null ? (
            <div className="flex items-center gap-2 px-5 py-4 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading applications…
            </div>
          ) : applications.length === 0 ? (
            <div className="px-5 py-4 text-xs text-muted-foreground">
              No applications yet. As candidates apply on your job postings,
              they&apos;ll show up here with their interview status.
            </div>
          ) : (
            <ul>
              {applications.slice(0, 8).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-accent/50"
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-medium tabular">
                    {(a.name || "?")
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <span className="font-medium">{a.name}</span>
                      <span className="text-muted-foreground"> applied to </span>
                      <span className="font-medium">{a.title}</span>
                    </div>
                    <div className="text-xs text-muted-foreground tabular">
                      {a.email} · {relative(a.created_at)}
                    </div>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {a.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
