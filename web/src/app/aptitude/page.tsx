"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Clock,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BRAND_NAME } from "@/lib/brand";

function apiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

interface AptitudeQuestion {
  id: string;
  category: string;
  question_text: string;
  options: string[];
  difficulty: string;
}

interface AptitudeState {
  candidate_name: string | null;
  job_title: string | null;
  status: "pending" | "in_progress" | "passed" | "failed" | "skipped";
  score: number | null;
  pass_score: number;
  total: number;
  duration_min: number;
  seconds_remaining: number | null;
  questions: AptitudeQuestion[];
  aptitude_required: boolean;
}

export default function AptitudePageWrapper() {
  return (
    <React.Suspense
      fallback={
        <Centered>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </Centered>
      }
    >
      <AptitudePage />
    </React.Suspense>
  );
}

function AptitudePage() {
  const router = useRouter();
  const sp = useSearchParams();
  const invite = sp.get("invite") || "";

  const [state, setState] = React.useState<AptitudeState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<"intro" | "running" | "submitting" | "result">("intro");
  const [answers, setAnswers] = React.useState<Record<string, number>>({});
  const [currentIdx, setCurrentIdx] = React.useState(0);
  const [secondsLeft, setSecondsLeft] = React.useState(0);
  const [resultScore, setResultScore] = React.useState<{ score: number; total: number; passed: boolean } | null>(null);

  // ─── Bootstrap: fetch state for this invite ───
  React.useEffect(() => {
    if (!invite) {
      setError("No invite token provided.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${apiBase()}/api/aptitude/${encodeURIComponent(invite)}`);
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.detail || `Couldn't load aptitude (HTTP ${r.status})`);
        }
        const data = (await r.json()) as AptitudeState;
        setState(data);

        // Skip path: aptitude not required for this job OR already cleared.
        if (!data.aptitude_required || data.status === "skipped" || data.status === "passed") {
          router.replace(`/interview/?invite=${encodeURIComponent(invite)}`);
          return;
        }
        if (data.status === "failed") {
          setPhase("result");
          setResultScore({
            score: data.score ?? 0,
            total: data.total,
            passed: false,
          });
        } else if (data.status === "in_progress") {
          // Resume mid-attempt
          setSecondsLeft(data.seconds_remaining ?? data.duration_min * 60);
          setPhase("running");
        }
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [invite, router]);

  // ─── Countdown timer ───
  React.useEffect(() => {
    if (phase !== "running") return;
    if (secondsLeft <= 0) {
      void submit(answers, true);
      return;
    }
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, secondsLeft]);

  async function startAttempt() {
    if (!state) return;
    try {
      const r = await fetch(`${apiBase()}/api/aptitude/${encodeURIComponent(invite)}/start`, {
        method: "POST",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || `Couldn't start (HTTP ${r.status})`);
      }
      setSecondsLeft(state.duration_min * 60);
      setPhase("running");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function submit(finalAnswers: Record<string, number>, isTimeout = false) {
    setPhase("submitting");
    try {
      const r = await fetch(`${apiBase()}/api/aptitude/${encodeURIComponent(invite)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || `Couldn't submit (HTTP ${r.status})`);
      }
      const data = (await r.json()) as { score: number; total: number; passed: boolean };
      setResultScore({ score: data.score, total: data.total, passed: data.passed });
      setPhase("result");
      if (isTimeout) {
        toast.warning("Time's up — answers auto-submitted.");
      }
    } catch (e) {
      toast.error((e as Error).message);
      setPhase("running");
    }
  }

  function pickAnswer(qid: string, idx: number) {
    setAnswers((a) => ({ ...a, [qid]: idx }));
  }

  function next() {
    if (!state) return;
    if (currentIdx < state.questions.length - 1) {
      setCurrentIdx((i) => i + 1);
    }
  }

  function prev() {
    setCurrentIdx((i) => Math.max(0, i - 1));
  }

  if (loading) {
    return (
      <Centered>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Centered>
    );
  }
  if (error) {
    return (
      <Centered>
        <Card className="max-w-md">
          <CardContent className="space-y-3 p-6 text-center">
            <AlertTriangle className="mx-auto size-7 text-[var(--danger)]" />
            <div className="text-base font-semibold">Couldn't load the aptitude round</div>
            <div className="text-sm text-muted-foreground">{error}</div>
            <Button variant="outline" asChild>
              <Link href="/jobs">Back to roles</Link>
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (!state) return null;

  // ─── Result screen ───
  if (phase === "result" && resultScore) {
    const passed = resultScore.passed;
    return (
      <Centered>
        <Card className="max-w-lg">
          <CardContent className="space-y-4 p-8 text-center">
            {passed ? (
              <CheckCircle2 className="mx-auto size-12 text-[var(--success,#10b981)]" />
            ) : (
              <XCircle className="mx-auto size-12 text-[var(--danger)]" />
            )}
            <div className="text-xl font-semibold">
              {passed ? "You cleared the aptitude round" : "You didn't clear the aptitude round"}
            </div>
            <div className="text-3xl font-bold tabular tracking-tight">
              {resultScore.score} / {resultScore.total}
            </div>
            <div className="text-sm text-muted-foreground">
              {passed
                ? `Pass mark is ${state.pass_score}. Starting the interview…`
                : `Pass mark is ${state.pass_score}. This application is now closed — no retries.`}
            </div>
            {passed ? (
              <Button
                onClick={() => router.push(`/interview/?invite=${encodeURIComponent(invite)}`)}
                className="gap-2"
              >
                Continue to interview <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link href="/jobs">Browse other roles</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </Centered>
    );
  }

  // ─── Intro screen ───
  if (phase === "intro") {
    return (
      <Centered>
        <Card className="max-w-xl">
          <CardContent className="space-y-4 p-8">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
                <Sparkles className="size-3.5" strokeWidth={2.5} />
              </div>
              <span className="font-semibold tracking-tight">{BRAND_NAME}</span>
            </Link>
            <div>
              <Badge variant="outline" className="mb-2">
                Step 1 of 2 · Aptitude
              </Badge>
              <h1 className="text-xl font-semibold tracking-tight">
                Quick aptitude round, {state.candidate_name?.split(" ")[0] || "there"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Before your {state.job_title ?? "interview"}, please complete a short
                {" "}{state.total}-question MCQ round. You have {state.duration_min}{" "}
                minutes; pass mark is {state.pass_score}/{state.total}. You can change
                your answer for any question before submitting.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground space-y-1.5">
              <div>• Mix of logical, quantitative and verbal questions.</div>
              <div>• Timer is enforced server-side — you can't pause it.</div>
              <div>• If you don't clear, this application closes (no retry).</div>
              <div>• On pass, you'll be taken straight into the interview.</div>
            </div>
            <Button onClick={startAttempt} className="w-full gap-2">
              Begin aptitude round <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  // ─── Running ───
  const q = state.questions[currentIdx];
  const answeredCount = Object.keys(answers).length;
  const allAnswered = answeredCount === state.questions.length;
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const lowTime = secondsLeft <= 60;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-sm md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
            <Sparkles className="size-3.5" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">{BRAND_NAME}</span>
        </Link>
        <Badge variant="outline" className="ml-2 hidden sm:inline-flex">
          Aptitude · {state.job_title ?? "Role"}
        </Badge>
        <div className="ml-auto flex items-center gap-3">
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-sm tabular",
              lowTime && "border-[var(--danger)] text-[var(--danger)]",
            )}
          >
            <Clock className="size-3.5" />
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </div>
          <Badge variant="outline" className="tabular">
            {answeredCount} / {state.total}
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 md:px-8">
        <Progress
          value={((currentIdx + 1) / state.questions.length) * 100}
          className="mb-6 h-1.5"
        />

        <Card>
          <CardContent className="space-y-5 p-6 md:p-8">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px] capitalize">
                {q.category}
              </Badge>
              <span>Question {currentIdx + 1} of {state.questions.length}</span>
            </div>
            <div className="text-base font-medium leading-relaxed">
              {q.question_text}
            </div>
            <div className="space-y-2">
              {q.options.map((opt, i) => {
                const chosen = answers[q.id] === i;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickAnswer(q.id, i)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left text-sm transition-colors",
                      chosen
                        ? "border-[var(--primary)] bg-[var(--primary)]/8 text-foreground"
                        : "border-border bg-card/40 hover:bg-accent",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                        chosen
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="leading-relaxed">{opt}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="mt-5 flex items-center gap-3">
          <Button variant="outline" onClick={prev} disabled={currentIdx === 0}>
            Previous
          </Button>
          {currentIdx < state.questions.length - 1 ? (
            <Button onClick={next} className="ml-auto">
              Next
            </Button>
          ) : (
            <Button
              onClick={() => submit(answers)}
              disabled={phase === "submitting" || !allAnswered}
              loading={phase === "submitting"}
              className="ml-auto"
            >
              Submit aptitude
            </Button>
          )}
        </div>

        {currentIdx === state.questions.length - 1 && !allAnswered && (
          <div className="mt-3 text-xs text-muted-foreground">
            Answer all {state.questions.length} questions to submit. Unanswered: {state.questions.length - answeredCount}.
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      {children}
    </div>
  );
}
