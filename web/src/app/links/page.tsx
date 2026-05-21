"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  Copy,
  Check,
  X,
  Loader2,
  ArrowLeft,
  Mail,
  Hash,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth, RECRUITER_ROLES } from "@/stores/auth-store";
import {
  fetchTenantLinks,
  generateTenantLinks,
  revokeTenantLink,
  type InviteLink,
} from "@/lib/auth-api";
import { toast } from "sonner";

export default function LinksPageWrapper() {
  return (
    <React.Suspense fallback={<div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">Loading…</div>}>
      <LinksPage />
    </React.Suspense>
  );
}

function LinksPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const jobId = sp.get("job") || "";
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const slug = user?.companySlug || "";
  const token = user?.authToken || "";

  const [links, setLinks] = React.useState<InviteLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!hydrated) return;
    if (!user || !RECRUITER_ROLES.includes(user.role)) {
      router.replace(`/login?next=/links?job=${jobId}`);
    }
  }, [hydrated, user, jobId, router]);

  const reload = React.useCallback(async () => {
    if (!token || !slug || !jobId) return;
    setLoading(true);
    try {
      const rows = await fetchTenantLinks(slug, jobId, token);
      setLinks(rows);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [slug, jobId, token]);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function handleRevoke(inviteToken: string) {
    if (!confirm("Revoke this link? The candidate will no longer be able to start the interview.")) return;
    try {
      await revokeTenantLink(slug, inviteToken, token);
      toast.success("Link revoked");
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (!jobId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Card>
          <CardContent className="p-8">
            <h1 className="text-lg font-semibold">No role selected</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Open the link manager from a specific role on your dashboard.
            </p>
            <Button variant="primary" className="mt-4" asChild>
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!slug || !token) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-muted-foreground">
        Loading workspace…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="size-3.5" />
              Back to dashboard
            </Link>
          </Button>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            Candidate links
          </h1>
          <p className="text-sm text-muted-foreground">
            Generate single-use, expiry-protected interview URLs in bulk. Each
            link drops the candidate straight into pre-flight + interview — no
            sign-up needed.
          </p>
        </div>
        <Button variant="primary" size="lg" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Generate links
        </Button>
      </div>

      <GenerateDialog
        open={open}
        onOpenChange={setOpen}
        slug={slug}
        jobId={jobId}
        token={token}
        onCreated={reload}
      />

      <Card>
        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-sm text-[var(--danger)]">{error}</div>
          ) : loading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading links…
            </div>
          ) : links.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No links yet. Click <strong>Generate links</strong> to create one
              or many.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b border-border">
                  <Th>Candidate</Th>
                  <Th>Status</Th>
                  <Th>Score</Th>
                  <Th>Expires</Th>
                  <Th>Link</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {links.map((l) => (
                  <LinkRow
                    key={l.application_id}
                    link={l}
                    onRevoke={() => handleRevoke(l.invite_token)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={
        "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground " +
        (className || "")
      }
    >
      {children}
    </th>
  );
}

function LinkRow({ link, onRevoke }: { link: InviteLink; onRevoke: () => void }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard.writeText(link.invite_url).then(() => {
      setCopied(true);
      toast.success("Link copied");
      setTimeout(() => setCopied(false), 1400);
    });
  }
  const status = link.invite_revoked_at
    ? { label: "Revoked" }
    : link.session_status === "finished"
    ? { label: "Completed" }
    : link.invite_used_at
    ? { label: "Started" }
    : { label: "Pending" };

  return (
    <tr className="border-b border-border last:border-0 transition-colors hover:bg-accent/40">
      <td className="px-4 py-2.5">
        <div className="font-medium">
          {link.candidate_name || link.candidate_email || "—"}
        </div>
        {link.candidate_email && link.candidate_name ? (
          <div className="text-[11px] text-muted-foreground">
            {link.candidate_email}
          </div>
        ) : null}
      </td>
      <td className="px-4 py-2.5">
        <Badge variant="outline" className="text-[11px]">
          {status.label}
        </Badge>
      </td>
      <td className="px-4 py-2.5 tabular">
        {link.total_score != null ? Number(link.total_score).toFixed(1) : "—"}
      </td>
      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular">
        {link.invite_expires_at
          ? new Date(link.invite_expires_at).toLocaleDateString()
          : "—"}
      </td>
      <td className="px-4 py-2.5">
        <code className="rounded bg-muted/50 px-2 py-1 text-[11px] tabular">
          {link.invite_url.replace(/^https?:\/\//, "").slice(0, 36)}…
        </code>
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={copy} aria-label="Copy">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </Button>
          {!link.invite_revoked_at && !link.invite_used_at ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRevoke}
              aria-label="Revoke"
            >
              <X className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function GenerateDialog({
  open,
  onOpenChange,
  slug,
  jobId,
  token,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  slug: string;
  jobId: string;
  token: string;
  onCreated: () => void;
}) {
  const [mode, setMode] = React.useState<"emails" | "count">("emails");
  const [emailsText, setEmailsText] = React.useState("");
  const [count, setCount] = React.useState("5");
  const [expiresInDays, setExpiresInDays] = React.useState("14");
  const [sendEmail, setSendEmail] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<InviteLink[] | null>(null);

  async function handleSubmit() {
    setBusy(true);
    try {
      const payload =
        mode === "emails"
          ? {
              candidates: emailsText
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter(Boolean)
                .map((email) => ({ email })),
              expires_in_days: parseInt(expiresInDays, 10) || 14,
              send_email: sendEmail,
            }
          : {
              count: parseInt(count, 10) || 1,
              expires_in_days: parseInt(expiresInDays, 10) || 14,
            };
      if (mode === "emails" && (!payload.candidates || payload.candidates.length === 0)) {
        toast.error("Add at least one email address.");
        setBusy(false);
        return;
      }
      const r = await generateTenantLinks(slug, jobId, token, payload);
      setCreated(r.created);
      toast.success(`Generated ${r.count} link${r.count === 1 ? "" : "s"}`);
      onCreated();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCreated(null);
    setEmailsText("");
    setCount("5");
    setExpiresInDays("14");
    setSendEmail(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(b) => {
        if (!b) reset();
        onOpenChange(b);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Generate candidate links</DialogTitle>
        </DialogHeader>

        {created ? (
          <CreatedList items={created} onClose={() => onOpenChange(false)} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("emails")}
                className={`flex flex-col items-start rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  mode === "emails"
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                    : "border-input hover:bg-accent"
                }`}
              >
                <Mail className="size-4" />
                <span className="mt-1 font-medium">Paste emails</span>
                <span className="text-[10px] text-muted-foreground">
                  One per line. Each gets a personalized link.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("count")}
                className={`flex flex-col items-start rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                  mode === "count"
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
                    : "border-input hover:bg-accent"
                }`}
              >
                <Hash className="size-4" />
                <span className="mt-1 font-medium">Anonymous batch</span>
                <span className="text-[10px] text-muted-foreground">
                  N anonymous links to share manually.
                </span>
              </button>
            </div>

            {mode === "emails" ? (
              <div>
                <label className="text-xs font-medium" htmlFor="emails">
                  Candidate emails
                </label>
                <textarea
                  id="emails"
                  value={emailsText}
                  onChange={(e) => setEmailsText(e.target.value)}
                  rows={6}
                  placeholder="alice@example.com&#10;bob@example.com&#10;carol@example.com"
                  className="mt-1 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <label className="mt-3 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={sendEmail}
                    onChange={(e) => setSendEmail(e.target.checked)}
                  />
                  Send invite email immediately
                </label>
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium" htmlFor="count">
                  How many links?
                </label>
                <input
                  id="count"
                  type="number"
                  min={1}
                  max={200}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-medium" htmlFor="expires">
                Expires in (days)
              </label>
              <input
                id="expires"
                type="number"
                min={1}
                max={60}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        )}

        {!created && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Generate
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreatedList({
  items,
  onClose,
}: {
  items: InviteLink[];
  onClose: () => void;
}) {
  function copyAll() {
    const text = items.map((i) => i.invite_url).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${items.length} link${items.length === 1 ? "" : "s"} copied`);
    });
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {items.length} link{items.length === 1 ? "" : "s"} created. Share with
        the candidate(s) — each is single-use.
      </p>
      <div className="max-h-64 overflow-y-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <tbody>
            {items.map((i) => (
              <tr key={i.application_id} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5 text-muted-foreground tabular">
                  {i.candidate_email || i.application_id}
                </td>
                <td className="px-3 py-1.5">
                  <code className="text-foreground tabular">{i.invite_url}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={copyAll}>
          <Copy className="size-3.5" />
          Copy all
        </Button>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}
