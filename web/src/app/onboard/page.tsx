"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Loader2,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/stores/auth-store";
import { BRAND_NAME } from "@/lib/brand";
import { toast } from "sonner";

function apiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

interface Preflight {
  name: string;
  slug: string;
  expires_at: string | null;
  already_set: boolean;
}

export default function OnboardPageWrapper() {
  return (
    <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading…</div>}>
      <OnboardPage />
    </React.Suspense>
  );
}

function OnboardPage() {
  const sp = useSearchParams();
  const slug = sp.get("slug") || "";
  const setupToken = sp.get("token") || "";
  const router = useRouter();
  const setUser = useAuth((s) => s.setUser);

  const [pre, setPre] = React.useState<Preflight | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!slug || !setupToken) {
      setError("This setup link is missing parameters. Check your email for the full URL.");
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${apiBase()}/api/c/${slug}/onboard/${setupToken}`);
        if (!r.ok) {
          let msg = "This setup link is invalid or has expired.";
          try {
            const j = await r.json();
            if (typeof j?.detail === "string") msg = j.detail;
          } catch {}
          setError(msg);
          return;
        }
        setPre(await r.json());
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [slug, setupToken]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${apiBase()}/api/c/${slug}/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setup_token: setupToken, password }),
      });
      if (!r.ok) {
        let msg = `Couldn't set password (${r.status})`;
        try {
          const j = await r.json();
          if (typeof j?.detail === "string") msg = j.detail;
        } catch {}
        throw new Error(msg);
      }
      const ok = await r.json();
      setUser({
        name: pre?.name || ok.name,
        email: "",
        role: "admin",
        canManageRoles: true,
        canManageBilling: true,
        canViewAnalytics: true,
        companyId: ok.company_id,
        companySlug: ok.slug,
        authToken: ok.auth_token,
      });
      toast.success(`Welcome to ${BRAND_NAME}!`);
      router.replace(`/dashboard`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
            <Sparkles className="size-3.5" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">{BRAND_NAME}</span>
        </div>

        <Card>
          <CardContent className="p-6">
            {error ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <AlertTriangle className="size-8 text-[var(--danger)]" />
                <h1 className="text-lg font-semibold">Setup link unavailable</h1>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button variant="outline" asChild>
                  <Link href="/contact">Contact us for a fresh link</Link>
                </Button>
              </div>
            ) : !pre ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Verifying your setup link…
              </div>
            ) : pre.already_set ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="size-8 text-[var(--success)]" />
                <h1 className="text-lg font-semibold">
                  {pre.name} is already set up
                </h1>
                <p className="text-sm text-muted-foreground">
                  Sign in with the password you set previously.
                </p>
                <Button variant="primary" asChild>
                  <Link href="/login">Sign in</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <h1 className="text-xl font-semibold tracking-tight">
                    Welcome, {pre.name}.
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Set a password to access your {BRAND_NAME} workspace.
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium" htmlFor="pw">
                    New password
                  </label>
                  <input
                    id="pw"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                    minLength={6}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium" htmlFor="confirm">
                    Confirm password
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={6}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <>
                      Activate workspace <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
