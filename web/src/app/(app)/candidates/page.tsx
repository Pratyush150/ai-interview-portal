"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3, Columns, Inbox } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CandidateTable } from "@/components/app/candidate-table";
import { CandidateKanban } from "@/components/app/candidate-kanban";
import { CandidateGrid } from "@/components/app/candidate-grid";
import {
  EmptyState,
  CandidatesEmptyIllustration,
} from "@/components/app/empty-state";
import { ScoreBadge } from "@/components/app/score-badge";
import { useCandidates, useRoles } from "@/lib/mock-api";
import { cn } from "@/lib/utils";
import type { CandidateStatus } from "@/types";
import { useAuth } from "@/stores/auth-store";
import { fetchTenantApplications } from "@/lib/auth-api";
import { relative } from "@/lib/format";

type View = "table" | "kanban" | "grid";

export default function CandidatesPageWrapper() {
  return (
    <Suspense fallback={<div className="space-y-2"><Skeleton className="h-9 w-44" /><Skeleton className="h-12 w-full" /></div>}>
      <CandidatesPage />
    </Suspense>
  );
}

interface LiveApplication {
  id: string;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  role_family: string;
  status: string;
  session_score: number | null;
  session_status: string | null;
  session_stage: string | null;
  created_at: string;
}

function useLiveApplications(): {
  rows: LiveApplication[] | null;
  loading: boolean;
} {
  const user = useAuth((s) => s.user);
  const [rows, setRows] = React.useState<LiveApplication[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    if (!user?.authToken || !user.companySlug) {
      setRows([]);
      setLoading(false);
      return;
    }
    fetchTenantApplications(user.companySlug, user.authToken)
      .then((raw) => {
        const mapped: LiveApplication[] = raw.map((r) => ({
          id: String(r.id ?? ""),
          candidate_name: String(r.candidate_name ?? ""),
          candidate_email: String(r.candidate_email ?? ""),
          job_title: String(r.job_title ?? ""),
          role_family: String(r.role_family ?? ""),
          status: String(r.status ?? ""),
          session_score:
            typeof r.session_score === "number" ? (r.session_score as number) : null,
          session_status:
            r.session_status != null ? String(r.session_status) : null,
          session_stage:
            r.session_stage != null ? String(r.session_stage) : null,
          created_at: String(r.created_at ?? ""),
        }));
        setRows(mapped);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [user?.authToken, user?.companySlug]);
  return { rows, loading };
}

function CandidatesPage() {
  const params = useSearchParams();
  const initialRole = params.get("role") ?? "all";

  const { data: candidates, isLoading } = useCandidates();
  const { data: roles } = useRoles();
  const { rows: liveApps, loading: liveLoading } = useLiveApplications();

  // Translate a mock-role id (e.g. "role_ml_senior") to its role_family
  // ("ml_engineering") so the live-applications filter and the mock-table
  // filter operate on a consistent concept. When "all" is selected this
  // resolves to null and we don't filter live apps.
  const roleFamilyFilter = React.useMemo<string | null>(() => {
    if (initialRole === "all") return null;
    const m = (roles ?? []).find((r) => r.id === initialRole);
    return m?.family ?? null;
  }, [initialRole, roles]);

  // Apply the role filter to the live applications too — without this the
  // sidebar's "Active roles" selection only narrowed mock data and a
  // recruiter clicking 'Backend Engineer' still saw every live application.
  const liveAppsFiltered = React.useMemo(() => {
    if (!liveApps) return liveApps;
    if (!roleFamilyFilter) return liveApps;
    return liveApps.filter((a) => a.role_family === roleFamilyFilter);
  }, [liveApps, roleFamilyFilter]);

  const [view, setView] = React.useState<View>("table");
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState(initialRole);
  const [scoreFilter, setScoreFilter] = React.useState<"all" | "high" | "mid" | "low">("all");
  const [statusFilter, setStatusFilter] = React.useState<CandidateStatus | "all">("all");

  React.useEffect(() => setRoleFilter(initialRole), [initialRole]);

  const filtered = React.useMemo(() => {
    if (!candidates) return [];
    return candidates.filter((c) => {
      if (roleFilter !== "all" && c.roleId !== roleFilter) return false;
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (scoreFilter === "high" && c.overallScore < 8) return false;
      if (
        scoreFilter === "mid" &&
        (c.overallScore < 6 || c.overallScore >= 8)
      )
        return false;
      if (scoreFilter === "low" && c.overallScore >= 6) return false;
      if (
        search &&
        !`${c.name} ${c.email} ${c.skills.join(" ")} ${c.currentCompany}`
          .toLowerCase()
          .includes(search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [candidates, roleFilter, statusFilter, scoreFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Candidates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {liveApps && liveApps.length > 0
              ? `${liveApps.length} live applications · ${candidates?.length ?? 0} demo candidates`
              : candidates
                ? `${candidates.length} candidates`
                : "Loading…"}{" "}
            across {roles?.length ?? 0} active roles.
          </p>
        </div>
        <div className="flex items-center rounded-md border border-border bg-card p-0.5">
          <ViewButton
            active={view === "table"}
            onClick={() => setView("table")}
            label="Table"
            icon={<Rows3 className="size-3.5" />}
          />
          <ViewButton
            active={view === "kanban"}
            onClick={() => setView("kanban")}
            label="Kanban"
            icon={<Columns className="size-3.5" />}
          />
          <ViewButton
            active={view === "grid"}
            onClick={() => setView("grid")}
            label="Grid"
            icon={<LayoutGrid className="size-3.5" />}
          />
        </div>
      </div>

      {/* Live applications — real candidates who applied through invite
          links or the public job board. Surfaced here (in addition to the
          dashboard) so recruiters can see scoring/status alongside the
          demo data the rest of the table is built on. */}
      <Card>
        <CardHeader className="flex flex-row items-end justify-between gap-3 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Inbox className="size-4 text-muted-foreground" />
              Live applications
              {roleFamilyFilter && (
                <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                  · filtered by {roleFamilyFilter.replace(/_/g, " ")}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Real candidates who applied and (where shown) their interview score.
            </CardDescription>
          </div>
          {liveAppsFiltered && (
            <Badge variant="outline" className="tabular">
              {liveAppsFiltered.length}
              {liveApps && liveAppsFiltered.length !== liveApps.length && (
                <span className="ml-1 text-muted-foreground">/ {liveApps.length}</span>
              )}
            </Badge>
          )}
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {liveLoading ? (
            <div className="space-y-1.5 px-5 pb-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !liveAppsFiltered || liveAppsFiltered.length === 0 ? (
            <div className="px-5 py-4 text-xs text-muted-foreground">
              {roleFamilyFilter
                ? `No live applications for ${roleFamilyFilter.replace(/_/g, " ")} yet.`
                : "No live applications yet. As candidates apply on your job postings they appear here with their interview status and score."}
            </div>
          ) : (
            <ul>
              {liveAppsFiltered.map((a) => {
                const score = a.session_score;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors hover:bg-accent/40"
                  >
                    <div className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-medium tabular">
                      {(a.candidate_name || "?")
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        <span className="font-medium">{a.candidate_name}</span>
                        <span className="text-muted-foreground"> · </span>
                        <span className="text-muted-foreground">{a.job_title}</span>
                      </div>
                      <div className="text-xs text-muted-foreground tabular">
                        {a.candidate_email} · applied {relative(a.created_at)}
                        {a.session_stage ? ` · stage: ${a.session_stage}` : ""}
                      </div>
                    </div>
                    {a.role_family && (
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {a.role_family.replace(/_/g, " ")}
                      </Badge>
                    )}
                    {score != null ? (
                      <ScoreBadge size="sm" score={score} />
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        Not yet scored
                      </Badge>
                    )}
                    <Badge variant="outline" className="capitalize">
                      {a.status.replace(/_/g, " ")}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search by name, email, skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 max-w-[260px]"
          />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-[200px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {roles?.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={scoreFilter}
            onValueChange={(v) => setScoreFilter(v as typeof scoreFilter)}
          >
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue placeholder="Score" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All scores</SelectItem>
              <SelectItem value="high">High (8+)</SelectItem>
              <SelectItem value="mid">Mid (6-8)</SelectItem>
              <SelectItem value="low">Low (&lt;6)</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
          >
            <SelectTrigger className="h-8 w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="ai_screened">AI Screened</SelectItem>
              <SelectItem value="shortlisted">Shortlisted</SelectItem>
              <SelectItem value="human_round">Human Round</SelectItem>
              <SelectItem value="offered">Offered</SelectItem>
              <SelectItem value="hired">Hired</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          {(roleFilter !== "all" ||
            scoreFilter !== "all" ||
            statusFilter !== "all" ||
            search) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
                setScoreFilter("all");
                setStatusFilter("all");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            illustration={<CandidatesEmptyIllustration />}
            title="No candidates match"
            description="Try widening your role or score filter."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setRoleFilter("all");
                  setScoreFilter("all");
                  setStatusFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
        </Card>
      ) : view === "table" ? (
        <CandidateTable data={filtered} filter={search} />
      ) : view === "kanban" ? (
        <CandidateKanban data={filtered} />
      ) : (
        <CandidateGrid data={filtered} />
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
