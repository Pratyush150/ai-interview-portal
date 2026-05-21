"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid, Rows3, Columns } from "lucide-react";
import { Card } from "@/components/ui/card";
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
import { CandidateTable } from "@/components/app/candidate-table";
import { CandidateKanban } from "@/components/app/candidate-kanban";
import { CandidateGrid } from "@/components/app/candidate-grid";
import {
  EmptyState,
  CandidatesEmptyIllustration,
} from "@/components/app/empty-state";
import { useCandidates, useRoles } from "@/lib/mock-api";
import { cn } from "@/lib/utils";
import type { CandidateStatus } from "@/types";

type View = "table" | "kanban" | "grid";

export default function CandidatesPageWrapper() {
  return (
    <Suspense fallback={<div className="space-y-2"><Skeleton className="h-9 w-44" /><Skeleton className="h-12 w-full" /></div>}>
      <CandidatesPage />
    </Suspense>
  );
}

function CandidatesPage() {
  const params = useSearchParams();
  const initialRole = params.get("role") ?? "all";

  const { data: candidates, isLoading } = useCandidates();
  const { data: roles } = useRoles();

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
            {candidates ? `${candidates.length} candidates` : "Loading…"} across{" "}
            {roles?.length ?? 0} active roles.
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
