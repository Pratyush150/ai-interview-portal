"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Mail, Lock, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAuth, type Role } from "@/stores/auth-store";
import { realLogin, AuthError } from "@/lib/auth-api";
import { BRAND_NAME, DEMO_WORKSPACE, DEMO_PASSWORD } from "@/lib/brand";
import { toast } from "sonner";

const ROLE_OPTIONS: { id: Role; label: string; hint: string }[] = [
  {
    id: "recruiter",
    label: "Recruiter",
    hint: "Pipeline, posting, hire decisions.",
  },
  {
    id: "hiring_manager",
    label: "Hiring manager",
    hint: "Reviews shortlists, no admin.",
  },
  { id: "admin", label: "Admin", hint: "Billing and team management." },
];

export default function LoginPage() {
  const router = useRouter();
  const loginAs = useAuth((s) => s.loginAs);
  const [loading, setLoading] = React.useState(false);
  // Default to the seeded demo workspace. The backend identifies workspaces
  // by `name`, so this field is best filled with "DemoCorp" for real-backend
  // login. Email-shaped inputs still work because we attempt mock-auth on
  // backend failure (so the named demo personas — naidu/sneha/riya — keep
  // working without a real DB row).
  const [workspace, setWorkspace] = React.useState(DEMO_WORKSPACE);
  const [password, setPassword] = React.useState(DEMO_PASSWORD);
  const [role, setRole] = React.useState<Role>("recruiter");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    let backedByApi = false;
    let companyId: string | null = null;
    let companySlug: string | null = null;
    let authToken: string | null = null;

    try {
      const r = await realLogin(workspace.trim(), password);
      backedByApi = true;
      companyId = r.company_id;
      companySlug = r.slug ?? null;
      authToken = r.auth_token;
    } catch (e) {
      const err = e as AuthError;
      const looksLikeMockPersona = /^[a-z][a-z._]*@democorp\.test$/i.test(
        workspace,
      );
      if (err.status === 401 && !looksLikeMockPersona) {
        toast.error(err.message || "Invalid workspace or password");
        setLoading(false);
        return;
      }
    }

    const name = workspace
      .split("@")[0]!
      .replace(/[._]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    loginAs(role, name, workspace.includes("@") ? workspace : undefined, {
      companyId,
      companySlug,
      authToken,
    });
    setLoading(false);
    toast.success(
      backedByApi
        ? `Signed in to ${name} workspace`
        : `Signed in as ${name} (demo)`,
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
              Sign in to your workspace
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Recruiters and hiring managers only. Candidates get an invite by
              email — no sign-in needed.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="workspace">Workspace name or email</Label>
              <div className="relative mt-1">
                <Mail className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="workspace"
                  type="text"
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  className="pl-8"
                  placeholder="DemoCorp"
                  required
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                The seeded demo workspace is{" "}
                <code className="tabular text-foreground">DemoCorp</code>.
              </p>
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
                  required
                />
              </div>
            </div>

            <div>
              <Label>Sign in as</Label>
              <div className="mt-1 grid grid-cols-3 gap-1.5">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRole(r.id)}
                    className={
                      "flex flex-col rounded-md border p-2 text-left text-xs transition-colors " +
                      (role === r.id
                        ? "border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]"
                        : "border-border hover:bg-accent/40")
                    }
                  >
                    <span className="font-medium">{r.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {r.hint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            loading={loading}
          >
            Sign in
          </Button>

          <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Real backend:</span>{" "}
              <code className="tabular text-foreground">DemoCorp</code> ·{" "}
              <code className="tabular text-foreground">demo1234</code>
            </div>
            <div>
              <span className="font-medium text-foreground">Mock-only personas</span>{" "}
              (any password):{" "}
              <code className="tabular text-foreground">naidu@democorp.test</code>,{" "}
              <code className="tabular text-foreground">sneha@democorp.test</code>,{" "}
              <code className="tabular text-foreground">riya@democorp.test</code>
            </div>
            <div>
              Candidate?{" "}
              <Link
                href="/candidate-login"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Interview portal
              </Link>{" "}
              · No account?{" "}
              <Link
                href="/signup"
                className="text-foreground underline-offset-4 hover:underline"
              >
                Create one
              </Link>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            <Link href="/" className="hover:underline">
              ← Back to landing
            </Link>
          </p>
        </form>
      </div>

      <div className="hidden flex-1 border-l border-border bg-card lg:block">
        <div className="flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Briefcase className="size-3.5" />
            Trusted by Indian engineering teams
          </div>
          <blockquote className="max-w-md">
            <p className="text-lg leading-relaxed">
              We replaced two rounds of phone screens with {BRAND_NAME}. Time-to-shortlist
              dropped from nine days to two, and our staff engineers&apos; calendars
              came back.
            </p>
            <footer className="mt-4 text-sm text-muted-foreground">
              Aditya Reddy · VP Engineering · Razorpay
            </footer>
          </blockquote>
          <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground tabular">
            <div>
              <div className="text-xl font-semibold text-foreground">2.4×</div>
              shortlist throughput
            </div>
            <div>
              <div className="text-xl font-semibold text-foreground">77%</div>
              fewer engineer hours per offer
            </div>
            <div>
              <div className="text-xl font-semibold text-foreground">
                <Badge variant="primary" className="text-base">22</Badge>
              </div>
              role families supported
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
