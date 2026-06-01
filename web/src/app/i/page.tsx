"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Loader2,
  AlertTriangle,
  Mic,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRAND_NAME } from "@/lib/brand";

interface InviteState {
  valid: boolean;
  candidate_name: string | null;
  candidate_email: string | null;
  job_title: string | null;
  job_id: string | null;
  company_name: string | null;
  company_slug: string | null;
  resume_id: string | null;
  status: string;
  expires_at: string | null;
  already_used: boolean;
  consent_required?: boolean;
  consent_url?: string | null;
  alt_assessment_enabled?: boolean;
  identity_required?: boolean;
  identity_url?: string | null;
}

function apiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

export default function InvitePageWrapper() {
  return (
    <React.Suspense fallback={<Centered><div className="text-sm text-muted-foreground">Loading…</div></Centered>}>
      <InvitePage />
    </React.Suspense>
  );
}

function InvitePage() {
  const sp = useSearchParams();
  const token = sp.get("token") || "";
  const [state, setState] = React.useState<InviteState | null>(null);
  const [error, setError] = React.useState<{ status: number; message: string } | null>(
    null,
  );

  React.useEffect(() => {
    if (!token) {
      setError({ status: 0, message: "Missing token in URL." });
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${apiBase()}/api/invite/${token}`);
        if (!r.ok) {
          let msg = "This interview link is no longer valid.";
          try {
            const j = await r.json();
            if (typeof j?.detail === "string") msg = j.detail;
          } catch {}
          setError({ status: r.status, message: msg });
          return;
        }
        setState(await r.json());
      } catch (e) {
        setError({ status: 0, message: (e as Error).message });
      }
    })();
  }, [token]);

  function startInterview() {
    if (!state || !token) return;
    // Gate chain (front to back): identity → consent → aptitude → interview.
    // Each page forwards to the next when its own gate is satisfied, so we only
    // need to send the candidate to the first unmet gate here.
    if (state.identity_required) {
      window.location.href = `/identity/?invite=${encodeURIComponent(token)}`;
      return;
    }
    if (state.consent_required) {
      window.location.href = `/consent/?invite=${encodeURIComponent(token)}`;
      return;
    }
    window.location.href = `/aptitude/?invite=${encodeURIComponent(token)}`;
  }

  if (error) {
    return (
      <Centered>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertTriangle className="size-10 text-[var(--danger)]" />
            <div>
              <h1 className="text-xl font-semibold">Link unavailable</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {error.message}
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href="/">Back to home</Link>
            </Button>
          </CardContent>
        </Card>
      </Centered>
    );
  }

  if (!state) {
    return (
      <Centered>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Verifying your interview link…
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
            <Sparkles className="size-3.5" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">{BRAND_NAME}</span>
          <Badge variant="outline" className="ml-1 text-[10px]">
            Interview
          </Badge>
        </div>

        <Card>
          <CardContent className="p-8">
            <h1 className="text-3xl font-semibold tracking-tight">
              Hi {state.candidate_name?.split(" ")[0] || "there"} —
              <br />
              <span className="text-muted-foreground">
                ready to interview for {state.job_title || "this role"}?
              </span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {state.company_name ? `${state.company_name} has` : "We've"}{" "}
              invited you to a structured AI-led interview. It takes ~22
              minutes and runs entirely in your browser.
            </p>

            <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-3">
                <Mic className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
                <span>
                  <strong className="text-foreground">Voice-first.</strong> You
                  speak — the interviewer listens and replies. No typing.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
                <span>
                  <strong className="text-foreground">~22 minutes.</strong> Six
                  short stages: intro, background, technical, follow-up, and
                  wrap-up.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
                <span>
                  <strong className="text-foreground">Stay focused.</strong>{" "}
                  Tab switches, paste events, and other behaviors are logged.
                </span>
              </li>
            </ul>

            {state.already_used ? (
              <div className="mt-6 rounded-md border border-[var(--warning)] bg-[var(--warning)]/10 p-3 text-sm">
                You&apos;ve already started this interview. Click below to
                resume.
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" onClick={startInterview}>
                {state.already_used ? "Resume interview" : "Start interview"}
                <ArrowRight className="size-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                You&apos;ll be asked to allow microphone + camera on the next
                screen.
              </span>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Powered by {BRAND_NAME}.{" "}
          <Link
            href="/legal/privacy"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Privacy
          </Link>{" "}
          ·{" "}
          <Link
            href="/legal/terms"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Terms
          </Link>
        </p>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      {children}
    </div>
  );
}
