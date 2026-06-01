"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { BRAND_NAME } from "@/lib/brand";

function apiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

interface Notice {
  version: string;
  title: string;
  bullets: string[];
  alt_assessment_enabled: boolean;
  alt_assessment_note?: string;
}

interface ConsentState {
  candidate_name: string | null;
  job_title: string | null;
  required: boolean;
  acknowledged: boolean;
  alt_assessment_status: string;
  notice: Notice;
}

export default function ConsentPageWrapper() {
  return (
    <React.Suspense
      fallback={
        <Centered>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </Centered>
      }
    >
      <ConsentPage />
    </React.Suspense>
  );
}

function ConsentPage() {
  const sp = useSearchParams();
  const token = sp.get("invite") || "";
  const [state, setState] = React.useState<ConsentState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [agreed, setAgreed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [altRequested, setAltRequested] = React.useState(false);

  const nextUrl = `/aptitude/?invite=${encodeURIComponent(token)}`;

  React.useEffect(() => {
    if (!token) {
      setError("Missing invite token in the link.");
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${apiBase()}/api/consent/${token}`);
        if (!r.ok) {
          setError("This interview link is no longer valid.");
          return;
        }
        const data: ConsentState = await r.json();
        // Nothing to acknowledge — forward to the next round immediately.
        if (!data.required || data.acknowledged) {
          window.location.href = nextUrl;
          return;
        }
        setState(data);
        setAltRequested(data.alt_assessment_status === "requested");
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function acknowledge() {
    if (!agreed || !token) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${apiBase()}/api/consent/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: true }),
      });
      if (!r.ok) {
        toast.error("Could not record your acknowledgement. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = nextUrl;
    } catch {
      toast.error("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  async function requestAlternative() {
    if (!token) return;
    try {
      const r = await fetch(`${apiBase()}/api/consent/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged: false, request_alt_assessment: true }),
      });
      if (!r.ok) {
        toast.error("Could not submit your request.");
        return;
      }
      setAltRequested(true);
      toast.success("Request received — a recruiter will be in touch by email.");
    } catch {
      toast.error("Network error. Please try again.");
    }
  }

  if (error) {
    return (
      <Centered>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <AlertTriangle className="size-10 text-[var(--danger)]" />
            <div>
              <h1 className="text-xl font-semibold">Link unavailable</h1>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
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
          Loading the interview notice…
        </div>
      </Centered>
    );
  }

  const { notice } = state;

  return (
    <Centered>
      <Card className="w-full max-w-2xl">
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-[var(--primary)]" />
            <span className="font-medium text-foreground">{BRAND_NAME}</span>
            {state.job_title ? <span>· {state.job_title}</span> : null}
          </div>

          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-6 shrink-0 text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold">{notice.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {state.candidate_name ? `Hi ${state.candidate_name} — please ` : "Please "}
                review the notice below before you begin.
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {notice.bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--primary)]"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I have read and understood this notice, and I consent to being evaluated
              by the automated decision tool described above.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button onClick={acknowledge} disabled={!agreed || submitting}>
              {submitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <>
                  Acknowledge &amp; continue
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>

            {notice.alt_assessment_enabled ? (
              altRequested ? (
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2 className="size-3.5" />
                  Alternative assessment requested
                </Badge>
              ) : (
                <Button variant="ghost" size="sm" onClick={requestAlternative}>
                  Request an alternative assessment
                </Button>
              )
            ) : null}
          </div>

          {notice.alt_assessment_enabled && notice.alt_assessment_note ? (
            <p className="text-xs text-muted-foreground">{notice.alt_assessment_note}</p>
          ) : null}

          <p className="text-[11px] text-muted-foreground">Notice version {notice.version}</p>
        </CardContent>
      </Card>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      {children}
    </div>
  );
}
