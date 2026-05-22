"use client";

import * as React from "react";
import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  ShieldCheck,
  Upload,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRAND_NAME } from "@/lib/brand";
import {
  applyToJob,
  candidateLogin,
  candidateSignup,
  fetchJob,
  AuthError,
  type JobRow,
} from "@/lib/auth-api";
import { useAuth } from "@/stores/auth-store";
import { toast } from "sonner";

export default function JobApplyPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-sm">Loading…</div>}>
      <JobApplyInner />
    </Suspense>
  );
}

function JobApplyInner() {
  const params = useSearchParams();
  const router = useRouter();
  const jobId = params.get("id");
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);

  const [job, setJob] = React.useState<JobRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!jobId) {
      setLoadError("No job ID supplied.");
      setLoading(false);
      return;
    }
    fetchJob(jobId)
      .then((j) => setJob(j))
      .catch((e) => setLoadError((e as Error).message || "Couldn't load job"))
      .finally(() => setLoading(false));
  }, [jobId]);

  const isCandidateAuthed = !!user?.candidateToken;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }
  if (loadError || !job) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <Sparkles className="mb-4 size-7 text-[var(--primary)]" />
        <h1 className="text-xl font-semibold">Couldn&apos;t open this role.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {loadError ?? "The role may have been closed or the link is invalid."}
        </p>
        <Button variant="outline" size="sm" className="mt-4" asChild>
          <Link href="/jobs">Back to all roles</Link>
        </Button>
      </div>
    );
  }

  const skills = (job.required_skills || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-sm">
        <div className="mx-auto flex h-[60px] max-w-5xl items-center px-4 md:px-8">
          <Link
            href="/jobs"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            All roles
          </Link>
          <Link
            href="/"
            className="ml-auto flex items-center gap-2 text-sm font-semibold"
          >
            <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
              <Sparkles className="size-3.5" strokeWidth={2.5} />
            </div>
            {BRAND_NAME}
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1fr_minmax(0,360px)] md:px-8 md:py-12">
        {/* Left: job content */}
        <div className="space-y-4">
          <div>
            <Badge variant="outline" className="mb-2 capitalize tabular">
              {job.seniority} · {job.role_family.replace(/_/g, " ")}
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {job.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {job.company_name}
              {job.department ? ` · ${job.department}` : ""}
              {" · "}
              {job.min_experience_years}–{job.max_experience_years} yrs
            </p>
          </div>

          <Card>
            <CardContent className="p-6">
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                About the role
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">
                {job.description}
              </p>
              {skills.length > 0 && (
                <>
                  <div className="mt-6 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Skills
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                      <Badge key={s} variant="outline" className="text-[11px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="rounded-md border border-border bg-card/40 p-4 text-xs text-muted-foreground">
            <ShieldCheck className="mr-1 inline size-3.5" />
            Applying triggers a 22-minute live AI interview right after upload —
            you can take it now or return via the link in your email.
          </div>
        </div>

        {/* Right: apply panel */}
        <div className="md:sticky md:top-[80px] md:self-start">
          {isCandidateAuthed ? (
            <ResumeUploadPanel
              job={job}
              onApplied={(inviteToken) => {
                router.push(`/interview/?invite=${encodeURIComponent(inviteToken)}`);
              }}
            />
          ) : (
            <AuthPanel
              onAuthed={(name, email, candidateId, candidateToken) => {
                setUser({
                  name,
                  email,
                  role: "candidate",
                  canManageRoles: false,
                  canManageBilling: false,
                  canViewAnalytics: false,
                  companyId: null,
                  authToken: null,
                  candidateId,
                  candidateToken,
                });
                toast.success(`Welcome, ${name}. Upload your resume to apply.`);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sign-up / sign-in card (shown when no candidate token in store) ───

function AuthPanel({
  onAuthed,
}: {
  onAuthed: (
    name: string,
    email: string,
    candidateId: string,
    candidateToken: string,
  ) => void;
}) {
  const [mode, setMode] = React.useState<"signup" | "signin">("signup");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6 || (mode === "signup" && !name.trim())) {
      toast.error(
        mode === "signup"
          ? "Name, email, and a password (6+ chars) are required."
          : "Email and password are required.",
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const ok = await candidateSignup(name.trim(), email.trim(), password);
        onAuthed(ok.name, ok.email, ok.candidate_id, ok.auth_token);
      } else {
        const ok = await candidateLogin(email.trim(), password);
        onAuthed(ok.name, ok.email, ok.candidate_id, ok.auth_token);
      }
    } catch (err) {
      const e = err as AuthError;
      if (e.status === 409) {
        toast.error(e.message + " Switching to sign in.");
        setMode("signin");
      } else {
        toast.error(e.message || "Couldn't authenticate.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
          To apply, sign in
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Create a candidate account so you can track this and future
          applications. Takes under 30 seconds.
        </p>

        <div
          className="mt-4 grid grid-cols-2 rounded-md border border-border p-0.5 text-xs"
          role="tablist"
        >
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={
              "rounded-[5px] py-1.5 transition-colors " +
              (mode === "signup"
                ? "bg-card font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
            role="tab"
            aria-selected={mode === "signup"}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={
              "rounded-[5px] py-1.5 transition-colors " +
              (mode === "signin"
                ? "bg-card font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
            role="tab"
            aria-selected={mode === "signin"}
          >
            Sign in
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          {mode === "signup" && (
            <div>
              <label className="text-xs font-medium" htmlFor="ap-name">
                Full name
              </label>
              <input
                id="ap-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Priya Sharma"
                autoComplete="name"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
          <div>
            <label className="text-xs font-medium" htmlFor="ap-email">
              Email
            </label>
            <input
              id="ap-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@gmail.com"
              autoComplete="email"
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="ap-password">
              Password
            </label>
            <input
              id="ap-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Button type="submit" variant="primary" size="sm" disabled={busy} className="w-full">
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                {mode === "signup" ? "Creating account…" : "Signing in…"}
              </>
            ) : mode === "signup" ? (
              "Create account & continue"
            ) : (
              "Sign in & continue"
            )}
          </Button>
        </form>
        <p className="mt-3 text-[11px] text-muted-foreground">
          By creating an account you agree to take a recorded AI interview.
          Your interview is shared only with the company you applied to.
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Resume upload card (shown after candidate is authed) ───

function ResumeUploadPanel({
  job,
  onApplied,
}: {
  job: JobRow;
  onApplied: (inviteToken: string) => void;
}) {
  const user = useAuth((s) => s.user);
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a PDF resume to apply.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Resume must be a PDF.");
      return;
    }
    if (!user?.candidateToken) {
      toast.error("Session expired. Please sign in again.");
      return;
    }
    setBusy(true);
    try {
      const res = await applyToJob(job.id, file, user.candidateToken);
      if (res.duplicate) {
        toast.message("You've already applied to this role — taking you to your interview.");
      } else {
        toast.success("Application submitted. Starting your interview…");
      }
      onApplied(res.invite_token);
    } catch (err) {
      const e = err as AuthError;
      toast.error(e.message || "Couldn't submit your application.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
          Apply to {job.title}
        </div>
        <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3 text-[var(--success)]" />
          Signed in as {user?.name}
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium" htmlFor="resume-file">
              Resume (PDF)
            </label>
            <label
              htmlFor="resume-file"
              className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-input bg-transparent px-3 py-3 text-xs text-muted-foreground hover:bg-accent/40"
            >
              <Upload className="size-3.5" />
              {file ? <span className="text-foreground">{file.name}</span> : "Choose a PDF…"}
              <input
                id="resume-file"
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <Button type="submit" variant="primary" size="sm" disabled={busy} className="w-full">
            {busy ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Submitting…
              </>
            ) : (
              "Submit application & start interview"
            )}
          </Button>
        </form>
        <p className="mt-3 text-[11px] text-muted-foreground">
          We&apos;ll parse your resume, brief the interviewer, then begin the
          live 22-minute structured interview right away.
        </p>
      </CardContent>
    </Card>
  );
}
