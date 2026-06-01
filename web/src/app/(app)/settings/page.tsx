"use client";

import * as React from "react";
import {
  Plug, Slack, Mail, Building2, CreditCard, Users, Plus,
  Trash2, Send, Download, Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { lakhs } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/stores/auth-store";

function apiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

const TEAM = [
  { name: "Naidu Krishore", role: "Owner", email: "naidu@democorp.test" },
  { name: "Riya Mehta", role: "Recruiter", email: "riya@democorp.test" },
  { name: "Akash Pillai", role: "Recruiter", email: "akash@democorp.test" },
  { name: "Sneha Bose", role: "Hiring Manager", email: "sneha@democorp.test" },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Workspace, team, billing, and integrations.
        </p>
      </div>

      <Tabs defaultValue="workspace">
        <TabsList>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace">
          <Card>
            <CardHeader>
              <CardTitle>Workspace</CardTitle>
              <CardDescription>
                Public details and defaults for your interview portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Company name</Label>
                <Input className="mt-1" defaultValue="DemoCorp" />
              </div>
              <div>
                <Label>Subdomain</Label>
                <Input className="mt-1" defaultValue="democorp.apertureai.com" />
              </div>
              <div>
                <Label>Default timezone</Label>
                <Input className="mt-1" defaultValue="Asia/Kolkata (IST)" />
              </div>
              <div>
                <Label>Currency</Label>
                <Input className="mt-1" defaultValue="₹ INR" />
              </div>
              <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Anti-cheat default</div>
                  <div className="text-xs text-muted-foreground">
                    Camera, motion, paste, and tab-switch detection on by default.
                  </div>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="team">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Team</CardTitle>
                <CardDescription>4 active members · 1 invite pending</CardDescription>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => toast.success("Invite sent")}
              >
                <Plus className="size-3.5" /> Invite
              </Button>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <ul>
                {TEAM.map((m, i) => (
                  <li
                    key={m.email}
                    className={
                      "flex items-center gap-3 px-5 py-3 " +
                      (i !== 0 ? "border-t border-border" : "")
                    }
                  >
                    <Avatar>
                      <AvatarFallback>
                        {m.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.email}
                      </div>
                    </div>
                    <Badge variant="outline">{m.role}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="billing">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Plan</CardTitle>
                <CardDescription>You&apos;re on the Growth plan.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between rounded-md border border-border p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="primary">Growth</Badge>
                      <span className="text-sm text-muted-foreground">
                        Renews 1 May 2026
                      </span>
                    </div>
                    <div className="mt-1.5 text-2xl font-semibold tabular">
                      {lakhs(5_40_000)}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        / year
                      </span>
                    </div>
                  </div>
                  <Button variant="outline">Upgrade</Button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Stat label="Interviews used" value="142 / 250" />
                  <Stat label="Active roles" value="8 / 20" />
                  <Stat label="Team seats" value="4 / 10" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invoices</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { id: "INV-2026-04", amount: 45_000, date: "1 Apr 2026" },
                  { id: "INV-2026-03", amount: 45_000, date: "1 Mar 2026" },
                  { id: "INV-2026-02", amount: 45_000, date: "1 Feb 2026" },
                ].map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm"
                  >
                    <div>
                      <div className="font-medium tabular">{inv.id}</div>
                      <div className="text-xs text-muted-foreground">
                        {inv.date}
                      </div>
                    </div>
                    <div className="tabular">{lakhs(inv.amount)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="integrations">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                name: "Slack",
                desc: "Post candidate updates to a channel.",
                icon: Slack,
                connected: true,
              },
              {
                name: "Email",
                desc: "Default invitation and reminder mailer.",
                icon: Mail,
                connected: true,
              },
              {
                name: "Greenhouse",
                desc: "Sync applications and stages.",
                icon: Building2,
                connected: false,
              },
              {
                name: "Lever",
                desc: "Sync applications and stages.",
                icon: Users,
                connected: false,
              },
              {
                name: "Stripe",
                desc: "Billing for self-serve plans.",
                icon: CreditCard,
                connected: true,
              },
              {
                name: "Webhooks",
                desc: "Push events to your own systems.",
                icon: Plug,
                connected: false,
              },
            ].map((it) => {
              const Icon = it.icon;
              return (
                <Card key={it.name}>
                  <CardContent className="flex items-center gap-3 p-4">
                    <div className="flex size-10 items-center justify-center rounded-md border border-border">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{it.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {it.desc}
                      </div>
                    </div>
                    {it.connected ? (
                      <Badge variant="success">Connected</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toast.success(`${it.name} connected`)}
                      >
                        Connect
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <AtsIntegrations />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface AtsConn {
  id: string;
  label: string;
  target_url: string;
  secret_masked: string;
  active: boolean;
  last_delivery_at: string | null;
  last_status: string | null;
}

function AtsIntegrations() {
  const slug = useAuth((s) => s.user?.companySlug);
  const token = useAuth((s) => s.user?.authToken);
  const [conns, setConns] = React.useState<AtsConn[] | null>(null);
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [secret, setSecret] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const auth = React.useCallback(
    (path: string, init?: RequestInit) =>
      fetch(`${apiBase()}/api/c/${slug}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
      }),
    [slug, token],
  );

  const load = React.useCallback(async () => {
    if (!slug || !token) return;
    try {
      const r = await auth("/ats-connections");
      if (r.ok) setConns(await r.json());
    } catch {
      /* non-fatal */
    }
  }, [slug, token, auth]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!url.trim()) {
      toast.error("Enter a webhook URL.");
      return;
    }
    setBusy(true);
    try {
      const r = await auth("/ats-connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), target_url: url.trim(), secret }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        toast.error(b.detail || "Could not add the webhook.");
        return;
      }
      setLabel("");
      setUrl("");
      setSecret("");
      toast.success("Webhook added.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const r = await auth(`/ats-connections/${id}`, { method: "DELETE" });
    if (r.ok) {
      toast.success("Webhook removed.");
      await load();
    }
  }

  async function test(id: string) {
    const r = await auth(`/ats-connections/${id}/test`, { method: "POST" });
    const b = await r.json().catch(() => ({}));
    if (r.ok) {
      toast.success(`Test delivered — last status: ${b.last_status ?? "?"}`);
      await load();
    } else {
      toast.error("Test failed.");
    }
  }

  async function downloadCsv() {
    if (!slug || !token) return;
    try {
      const r = await auth("/export/reports.csv");
      if (!r.ok) {
        toast.error("Export failed.");
        return;
      }
      const blob = await r.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${slug}-reports.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      toast.error("Export failed.");
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>ATS webhooks &amp; export</CardTitle>
          <CardDescription>
            Push each finished interview to your ATS / systems (HMAC-signed), or
            export finished reports as CSV.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadCsv}>
          <Download className="size-3.5" /> Export CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_1fr_auto]">
          <Input placeholder="Label (e.g. Greenhouse)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input placeholder="https://your-ats.example/webhook" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Input placeholder="Signing secret (optional)" value={secret} onChange={(e) => setSecret(e.target.value)} />
          <Button onClick={add} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Add
          </Button>
        </div>

        {conns === null ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : conns.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No webhooks yet.</p>
        ) : (
          <div className="space-y-2">
            {conns.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-md border border-border p-3"
              >
                <Plug className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {c.label || c.target_url}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.target_url}
                    {c.secret_masked ? ` · secret ${c.secret_masked}` : ""}
                  </div>
                  {c.last_status ? (
                    <div className="text-[11px] text-muted-foreground tabular">
                      last delivery: {c.last_status}
                      {c.last_delivery_at
                        ? ` · ${c.last_delivery_at.replace("T", " ").slice(0, 16)}`
                        : ""}
                    </div>
                  ) : null}
                </div>
                <Button size="sm" variant="ghost" className="gap-1" onClick={() => test(c.id)}>
                  <Send className="size-3.5" /> Test
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                  <Trash2 className="size-4 text-[var(--danger)]" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold tabular">{value}</div>
    </div>
  );
}
