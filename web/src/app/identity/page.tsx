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
  ScanFace,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BRAND_NAME } from "@/lib/brand";

function apiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

interface IdentityState {
  candidate_name: string | null;
  job_title: string | null;
  required: boolean;
  verified: boolean;
  provider: string;
}

export default function IdentityPageWrapper() {
  return (
    <React.Suspense
      fallback={
        <Centered>
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </Centered>
      }
    >
      <IdentityPage />
    </React.Suspense>
  );
}

function IdentityPage() {
  const sp = useSearchParams();
  const token = sp.get("invite") || "";
  const [state, setState] = React.useState<IdentityState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // After identity, route through /consent (which itself forwards to /aptitude
  // when the notice isn't required) so the gate chain stays linear.
  const nextUrl = `/consent/?invite=${encodeURIComponent(token)}`;

  React.useEffect(() => {
    if (!token) {
      setError("Missing invite token in the link.");
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${apiBase()}/api/identity/${token}`);
        if (!r.ok) {
          setError("This interview link is no longer valid.");
          return;
        }
        const data: IdentityState = await r.json();
        if (!data.required || data.verified) {
          window.location.href = nextUrl;
          return;
        }
        setState(data);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function verify() {
    if (!token) return;
    setSubmitting(true);
    try {
      const r = await fetch(`${apiBase()}/api/identity/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error("Verification could not be started. Please try again.");
        setSubmitting(false);
        return;
      }
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }
      if (data.verified) {
        window.location.href = nextUrl;
        return;
      }
      toast.message("Verification is pending. You'll be able to continue once it's confirmed.");
      setSubmitting(false);
    } catch {
      toast.error("Network error. Please try again.");
      setSubmitting(false);
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
          Loading identity verification…
        </div>
      </Centered>
    );
  }

  return (
    <Centered>
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col gap-6 p-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="size-4 text-[var(--primary)]" />
            <span className="font-medium text-foreground">{BRAND_NAME}</span>
            {state.job_title ? <span>· {state.job_title}</span> : null}
          </div>

          <div className="flex items-start gap-3">
            <ScanFace className="mt-0.5 size-6 shrink-0 text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold">Verify your identity</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {state.candidate_name ? `Hi ${state.candidate_name} — before ` : "Before "}
                you begin, we need to confirm it&apos;s really you. This protects the
                fairness of the process for every candidate.
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-3 text-sm">
            <li className="flex gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
              <span>A quick photo-ID and selfie check — usually under a minute.</span>
            </li>
            <li className="flex gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
              <span>Handled by a secure verification provider; we store only the result.</span>
            </li>
          </ul>

          <Button onClick={verify} disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Start verification
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>

          <p className="text-[11px] text-muted-foreground">
            Verification provider: {state.provider}
          </p>
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
