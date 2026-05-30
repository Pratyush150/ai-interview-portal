"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Sparkles,
  Mail,
  User,
  Key,
  ShieldCheck,
  Briefcase,
  Lock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/stores/auth-store";
import { BRAND_NAME } from "@/lib/brand";
import {
  candidateLogin,
  candidateSignup,
  AuthError,
} from "@/lib/auth-api";
import { toast } from "sonner";

type Mode = "signin" | "signup" | "invite";

export default function CandidateLoginWrapper() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading…</div>
        </div>
      }
    >
      <CandidateLogin />
    </Suspense>
  );
}

function CandidateLogin() {
  const params = useSearchParams();
  const router = useRouter();
  const setUser = useAuth((s) => s.setUser);

  // If the user landed here from a "?invite=…" link, default to the invite tab.
  const presetToken = params.get("invite") || params.get("token") || "";
  const [mode, setMode] = React.useState<Mode>(presetToken ? "invite" : "signin");

  // Shared
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [name, setName] = React.useState("");
  // Invite-only
  const [token, setToken] = React.useState(presetToken);
  const [loading, setLoading] = React.useState(false);

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || password.length < 6 || (mode === "signup" && !name.trim())) {
      toast.error(
        mode === "signup"
          ? "Name, email, and a password (6+ chars) required."
          : "Email and password required.",
      );
      return;
    }
    setLoading(true);
    try {
      const ok =
        mode === "signup"
          ? await candidateSignup(name.trim(), email.trim(), password)
          : await candidateLogin(email.trim(), password);
      setUser({
        name: ok.name,
        email: ok.email,
        role: "candidate",
        canManageRoles: false,
        canManageBilling: false,
        canViewAnalytics: false,
        companyId: null,
        authToken: null,
        candidateId: ok.candidate_id,
        candidateToken: ok.auth_token,
      });
      toast.success(`Welcome, ${ok.name}.`);
      router.push("/jobs");
    } catch (err) {
      const e = err as AuthError;
      if (e.status === 409) {
        toast.error(e.message);
        setMode("signin");
      } else {
        toast.error(e.message || "Couldn't authenticate.");
      }
    } finally {
      setLoading(false);
    }
  }

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      toast.error("Paste the invite token from your email.");
      return;
    }
    // Hand off to the interview portal directly with the invite token.
    router.push(`/interview/?invite=${encodeURIComponent(token.trim())}`);
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
              <Sparkles className="size-3.5" />
            </div>
            <span className="font-semibold">{BRAND_NAME}</span>
          </Link>

          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Candidate sign-in
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to apply, track your interviews, and resume saved
              applications.
            </p>
          </div>

          {/* Mode switcher */}
          <div
            className="grid grid-cols-3 rounded-md border border-border p-0.5 text-xs"
            role="tablist"
          >
            {([
              ["signin", "Sign in"],
              ["signup", "Create account"],
              ["invite", "Invite link"],
            ] as Array<[Mode, string]>).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "rounded-[5px] py-1.5 transition-colors " +
                  (mode === m
                    ? "bg-card font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
                role="tab"
                aria-selected={mode === m}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "invite" ? (
            <form onSubmit={submitInvite} className="space-y-3">
              <div>
                <Label htmlFor="token">Invite token</Label>
                <div className="relative mt-1">
                  <Key className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="paste from your email"
                    className="pl-8 tabular"
                    autoFocus
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Tokens look like <code>a3f8c1d…</code> and let you skip
                  account creation. They&apos;re sent by the hiring team.
                </p>
              </div>
              <Button type="submit" variant="primary" className="w-full">
                Continue to interview
              </Button>
            </form>
          ) : (
            <form onSubmit={submitAuth} className="space-y-3">
              {mode === "signup" && (
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Priya Sharma"
                      className="pl-8"
                      autoComplete="name"
                      required
                    />
                  </div>
                </div>
              )}
              <div>
                <Label htmlFor="email">Email</Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@gmail.com"
                    className="pl-8"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "At least 6 characters" : "Your password"}
                    className="pl-8"
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                  />
                </div>
              </div>
              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    {mode === "signup" ? "Creating account…" : "Signing in…"}
                  </>
                ) : mode === "signup" ? (
                  "Create candidate account"
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          )}

          <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Demo candidate:</span>{" "}
              <code className="tabular text-foreground">demo@aperture.test</code>{" "}
              ·{" "}
              <code className="tabular text-foreground">demo1234</code>
            </div>
            <div>
              Recruiter or hiring manager?{" "}
              <Link
                href="/login"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Sign in here
              </Link>
              .
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            <Link href="/" className="hover:underline">
              ← Back to landing
            </Link>
          </p>
        </div>
      </div>

      <div className="hidden flex-1 border-l border-border bg-card lg:block">
        <div className="flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Briefcase className="size-3.5" />
            What to expect
          </div>
          <div className="space-y-4 text-sm">
            <Step
              icon={<ShieldCheck className="size-3.5" />}
              title="Pre-flight checks"
              body="We verify mic, camera, and network in under a minute."
            />
            <Step
              icon={<ShieldCheck className="size-3.5" />}
              title="Voice-first interview with Sara"
              body="Sara asks one question at a time. Click the mic when you finish — no silence-cutoff."
            />
            <Step
              icon={<ShieldCheck className="size-3.5" />}
              title="22 minutes, time-paced"
              body="The interview is paced by clock. You can press 'Take a moment' for a 30-second think break."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            By starting, you agree to be recorded for review by the hiring
            team. Recordings are stored securely and only shared with the
            people on the hiring loop.
          </p>
        </div>
      </div>
    </div>
  );
}

function Step({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{body}</div>
      </div>
    </div>
  );
}
