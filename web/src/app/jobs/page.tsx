"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sparkles,
  Briefcase,
  Search,
  ArrowRight,
  Building2,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BRAND_NAME } from "@/lib/brand";
import { Badge } from "@/components/ui/badge";
import { fetchJobs, fetchRoleCatalog, type JobRow } from "@/lib/auth-api";
import { useAuth } from "@/stores/auth-store";

interface RoleFamily {
  role_family: string;
  display_name: string;
}

export default function JobsPage() {
  const user = useAuth((s) => s.user);
  const isCandidateAuthed = !!user?.candidateToken;
  const [roleFamilies, setRoleFamilies] = React.useState<RoleFamily[]>([]);
  const [filterRole, setFilterRole] = React.useState("");
  const [filterSkill, setFilterSkill] = React.useState("");
  const [filterExp, setFilterExp] = React.useState<string>("");
  const [jobs, setJobs] = React.useState<JobRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchRoleCatalog()
      .then((c) => setRoleFamilies(c.role_families))
      .catch(() => setRoleFamilies([]));
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const exp = filterExp ? Number(filterExp) : undefined;
      const data = await fetchJobs({
        role_family: filterRole || undefined,
        skill: filterSkill.trim() || undefined,
        experience: exp,
      });
      setJobs(data);
    } catch (e) {
      setError((e as Error).message || "Couldn't load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [filterRole, filterSkill, filterExp]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex h-[60px] max-w-6xl items-center px-4 md:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
              <Sparkles className="size-3.5" strokeWidth={2.5} />
            </div>
            <span className="font-semibold tracking-tight">{BRAND_NAME}</span>
            <Badge variant="outline" className="ml-1 text-[10px]">
              Jobs
            </Badge>
          </Link>
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {isCandidateAuthed ? (
              <span>
                Signed in as <span className="font-medium text-foreground">{user?.name}</span>
              </span>
            ) : (
              <>
                <Link
                  href="/candidate-login"
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
                <span className="opacity-50">·</span>
                <Link href="/" className="hover:text-foreground">
                  Hire on {BRAND_NAME}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 pb-6 pt-10 md:px-8 md:pt-14">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
          Open roles
        </div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Find your next engineering role.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
          Apply with your resume and complete a 22-minute structured interview
          straight away. No phone screens, no scheduling back-and-forth.
        </p>
      </section>

      {/* Filter bar */}
      <section className="mx-auto max-w-6xl px-4 pb-4 md:px-8">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[180px] flex-1">
              <label className="text-xs font-medium" htmlFor="filter-role">
                Role family
              </label>
              <select
                id="filter-role"
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All roles</option>
                {roleFamilies.map((r) => (
                  <option key={r.role_family} value={r.role_family}>
                    {r.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px] flex-1">
              <label className="text-xs font-medium" htmlFor="filter-exp">
                Your experience (yrs)
              </label>
              <input
                id="filter-exp"
                type="number"
                value={filterExp}
                onChange={(e) => setFilterExp(e.target.value)}
                placeholder="e.g. 3"
                min={0}
                max={40}
                step={0.5}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="min-w-[180px] flex-1">
              <label className="text-xs font-medium" htmlFor="filter-skill">
                Skill / keyword
              </label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
                <input
                  id="filter-skill"
                  type="text"
                  value={filterSkill}
                  onChange={(e) => setFilterSkill(e.target.value)}
                  placeholder="React, Postgres, ETABS…"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Refresh"}
            </Button>
          </CardContent>
        </Card>
      </section>

      {/* Results */}
      <section className="mx-auto max-w-6xl px-4 pb-16 md:px-8">
        {loading && jobs == null ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-border" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-border" />
                  <div className="mt-4 h-3 w-full animate-pulse rounded bg-border" />
                  <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-border" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Couldn&apos;t load jobs: {error}.{" "}
              <button
                className="text-foreground underline-offset-4 hover:underline"
                onClick={load}
              >
                Try again
              </button>
            </CardContent>
          </Card>
        ) : (jobs ?? []).length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No openings match those filters. Try widening the search.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {jobs!.map((j) => (
              <JobCard key={j.id} job={j} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function JobCard({ job }: { job: JobRow }) {
  const skills = (job.required_skills || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  return (
    <Card className="transition-colors hover:bg-accent/40">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">{job.title}</div>
            <div className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="size-3" />
              {job.company_name}
            </div>
          </div>
          <Badge variant="outline" className="capitalize tabular">
            {job.seniority}
          </Badge>
        </div>
        <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {job.description}
        </p>
        {skills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {skills.map((s) => (
              <Badge key={s} variant="outline" className="text-[10px]">
                {s}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="text-[11px] text-muted-foreground tabular">
            {job.min_experience_years}-{job.max_experience_years} yrs ·{" "}
            {(job.role_family || "").replace(/_/g, " ")}
          </div>
          <Button variant="primary" size="sm" asChild>
            <Link href={`/jobs/apply/?id=${encodeURIComponent(job.id)}`}>
              <Briefcase className="size-3.5" />
              View &amp; apply
              <ArrowRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
