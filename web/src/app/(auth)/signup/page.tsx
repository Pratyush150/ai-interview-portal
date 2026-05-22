"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Mail, Lock, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/stores/auth-store";
import { realSignup, AuthError } from "@/lib/auth-api";
import { BRAND_NAME } from "@/lib/brand";
import { toast } from "sonner";

export default function SignupPage() {
  const router = useRouter();
  const loginAs = useAuth((s) => s.loginAs);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [company, setCompany] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password.trim()) {
      toast.error("Fill in name, email, and password.");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    let companyId: string | null = null;
    let authToken: string | null = null;
    let backedByApi = false;

    // The backend identifies workspaces by `name`. Use the company field if
    // provided; otherwise fall back to "<First> Workspace" derived from name.
    const workspaceName = (company.trim() || `${name.trim().split(" ")[0]}'s Workspace`).slice(0, 80);

    try {
      const r = await realSignup(workspaceName, email.trim(), password);
      backedByApi = true;
      companyId = r.company_id;
      authToken = r.auth_token;
    } catch (e) {
      const err = e as AuthError;
      // 409 / 500 from a duplicate name is a real error worth surfacing.
      if (err.status === 409 || err.message?.toLowerCase().includes("unique")) {
        toast.error(
          `Workspace "${workspaceName}" already exists. Try signing in or pick a different company name.`,
        );
        setLoading(false);
        return;
      }
      // Network / 5xx — fall through to mock so the demo flow still works.
    }

    loginAs("recruiter", name.trim(), email.trim(), { companyId, authToken });
    setLoading(false);
    toast.success(
      backedByApi
        ? `Workspace "${workspaceName}" created. Welcome, ${name.trim().split(" ")[0]}.`
        : `Welcome${company ? ` to ${company}` : ""}, ${name.trim().split(" ")[0]} (demo mode)`,
    );
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
              <Sparkles className="size-3.5" />
            </div>
            <span className="font-semibold">{BRAND_NAME}</span>
          </Link>

          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Create your workspace
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Free during the beta. No credit card.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="name">Your name</Label>
              <div className="relative mt-1">
                <User className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-8"
                  placeholder="Naidu Krishore"
                  required
                />
              </div>
            </div>
            <div>
              <Label htmlFor="company">Company (optional)</Label>
              <div className="relative mt-1">
                <Building2 className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="pl-8"
                  placeholder="DemoCorp"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="email">Work email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-8"
                  placeholder="you@company.com"
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
                  className="pl-8"
                  placeholder="At least 8 characters"
                  required
                  minLength={8}
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={loading}
          >
            Create workspace
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            <Link href="/" className="hover:underline">
              ← Back to landing
            </Link>
          </p>
        </form>
      </div>

      <div className="hidden flex-1 border-l border-border bg-card lg:block">
        <div className="flex h-full flex-col justify-between p-12">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            What you get
          </div>
          <ul className="space-y-3 text-sm">
            <li>• Pipeline view, transcript, scoring, and analytics</li>
            <li>• 22 role families × 6 seniority tiers built-in</li>
            <li>• Anti-cheat with paste, tab-switch, camera, motion</li>
            <li>• Mock data so you can demo immediately</li>
          </ul>
          <div className="rounded-md border border-border bg-background px-4 py-3 text-xs text-muted-foreground">
            Want to try without signing up? The landing page lists demo
            accounts you can use as-is.
          </div>
        </div>
      </div>
    </div>
  );
}
