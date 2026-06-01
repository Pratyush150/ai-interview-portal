"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Save, X, Loader2, Code2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/stores/auth-store";

function apiBase(): string {
  if (typeof window === "undefined") return "";
  if (window.location.port === "3000") return "http://localhost:8000";
  return "";
}

interface CodingProblem {
  id: string;
  role_family: string | null;
  title: string;
  prompt: string;
  hint: string;
  examples: { input: string; output: string }[];
  boilerplate: string;
  ai_policy: "forbidden" | "allowed" | "required";
  active: boolean;
  position: number;
  created_at: string;
}

interface RoleFamily {
  role_family: string;
  display_name: string;
}

type EditingState =
  | { mode: "new"; q: Omit<CodingProblem, "id" | "position" | "created_at"> }
  | { mode: "edit"; q: CodingProblem }
  | null;

const DEFAULT_NEW: Omit<CodingProblem, "id" | "position" | "created_at"> = {
  role_family: null,
  title: "",
  prompt: "",
  hint: "",
  examples: [],
  boilerplate: "",
  ai_policy: "forbidden",
  active: true,
};

// Sentinel for "no role" — Radix Select forbids empty string values, so we
// pipe a custom token in/out at the form boundary.
const NO_ROLE = "__generic__";

export default function CodingBankPage() {
  const slug = useAuth((s) => s.user?.companySlug);
  const token = useAuth((s) => s.user?.authToken);
  const [items, setItems] = React.useState<CodingProblem[] | null>(null);
  const [families, setFamilies] = React.useState<RoleFamily[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<EditingState>(null);
  const [saving, setSaving] = React.useState(false);
  const [familyFilter, setFamilyFilter] = React.useState<string>("__all__");

  const refresh = React.useCallback(async () => {
    if (!slug || !token) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/api/c/${slug}/coding-problems`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = (await r.json()) as CodingProblem[];
      setItems(data);
    } catch (e) {
      toast.error(`Couldn't load coding problems: ${(e as Error).message}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // Pull the list of valid role families so the dropdown matches whatever
  // the backend supports. Falls back to the existing rows' role_family
  // values if the catalog endpoint isn't reachable.
  React.useEffect(() => {
    fetch(`${apiBase()}/api/roles`)
      .then((r) => r.json())
      .then((d) => setFamilies(d?.role_families ?? []))
      .catch(() => setFamilies([]));
  }, []);

  async function save() {
    if (!slug || !token || !editing) return;
    if (!editing.q.title.trim() || !editing.q.prompt.trim()) {
      toast.error("Title and prompt are required.");
      return;
    }
    setSaving(true);
    const isNew = editing.mode === "new";
    const url = isNew
      ? `${apiBase()}/api/c/${slug}/coding-problems`
      : `${apiBase()}/api/c/${slug}/coding-problems/${(editing.q as CodingProblem).id}`;
    try {
      const r = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role_family: editing.q.role_family,
          title: editing.q.title.trim(),
          prompt: editing.q.prompt.trim(),
          hint: editing.q.hint.trim(),
          examples: editing.q.examples,
          boilerplate: editing.q.boilerplate ?? "",
          ai_policy: editing.q.ai_policy ?? "forbidden",
          active: editing.q.active,
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.detail || `HTTP ${r.status}`);
      }
      toast.success(isNew ? "Problem added." : "Saved.");
      setEditing(null);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!slug || !token) return;
    if (!confirm("Disable this coding problem? It stays in history but is no longer served.")) return;
    try {
      const r = await fetch(`${apiBase()}/api/c/${slug}/coding-problems/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success("Disabled.");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || "Delete failed.");
    }
  }

  const filtered = React.useMemo(() => {
    if (!items) return null;
    if (familyFilter === "__all__") return items;
    if (familyFilter === "__generic__") return items.filter((x) => x.role_family == null);
    return items.filter((x) => x.role_family === familyFilter);
  }, [items, familyFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Code2 className="size-5 text-muted-foreground" />
            Coding problem bank
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One problem per role family powers the final coding round. Edit
            the prompt, change the role tag, or disable any problem candidates
            shouldn&apos;t see.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={familyFilter} onValueChange={setFamilyFilter}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All role families</SelectItem>
              <SelectItem value="__generic__">Generic / fallback</SelectItem>
              {families.map((f) => (
                <SelectItem key={f.role_family} value={f.role_family}>
                  {f.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setEditing({ mode: "new", q: { ...DEFAULT_NEW } })}
          >
            <Plus className="size-3.5" />
            New problem
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Loading…
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No problems match that filter. Use <strong>New problem</strong> to
            add one.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => (
            <Card key={q.id} className={cn(!q.active && "opacity-60")}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{q.title}</span>
                      <Badge variant="outline" className="capitalize text-[10px]">
                        {q.role_family ? q.role_family.replace(/_/g, " ") : "generic"}
                      </Badge>
                      {!q.active && (
                        <Badge variant="danger" className="text-[10px]">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {q.prompt}
                    </p>
                    {q.hint && (
                      <p className="mt-1 text-[11px] italic text-muted-foreground">
                        Hint: {q.hint}
                      </p>
                    )}
                    {q.examples.length > 0 && (
                      <div className="mt-1.5 text-[11px] text-muted-foreground">
                        {q.examples.length} test case{q.examples.length === 1 ? "" : "s"}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditing({ mode: "edit", q })}
                      aria-label="Edit"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => remove(q.id)}
                      aria-label="Disable"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <Card className="border-[var(--primary)]/50">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">
                {editing.mode === "new" ? "New problem" : "Edit problem"}
              </div>
              <Button size="icon" variant="ghost" onClick={() => setEditing(null)}>
                <X className="size-4" />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Role family</Label>
                <Select
                  value={editing.q.role_family ?? NO_ROLE}
                  onValueChange={(v) =>
                    setEditing({
                      ...editing,
                      // Yes I know this widens the literal — the discriminant
                      // is preserved by spreading editing.q.
                      q: { ...editing.q, role_family: v === NO_ROLE ? null : v },
                    } as EditingState)
                  }
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE}>Generic / fallback</SelectItem>
                    {families.map((f) => (
                      <SelectItem key={f.role_family} value={f.role_family}>
                        {f.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label>Active</Label>
                  <div className="mt-1 flex h-9 items-center">
                    <Switch
                      checked={editing.q.active}
                      onCheckedChange={(v) =>
                        setEditing({
                          ...editing,
                          q: { ...editing.q, active: v },
                        } as EditingState)
                      }
                    />
                    <span className="ml-2 text-xs text-muted-foreground">
                      {editing.q.active ? "Served to candidates" : "Hidden"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <Label>Title</Label>
              <Input
                className="mt-1"
                value={editing.q.title}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    q: { ...editing.q, title: e.target.value },
                  } as EditingState)
                }
                placeholder="Top-K most-frequent words"
              />
            </div>
            <div>
              <Label>Prompt (pseudocode-first)</Label>
              <Textarea
                className="mt-1 min-h-[120px]"
                value={editing.q.prompt}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    q: { ...editing.q, prompt: e.target.value },
                  } as EditingState)
                }
                placeholder="Describe the problem. Ask the candidate for an APPROACH/pseudocode, not runnable code."
              />
            </div>
            <div>
              <Label>Hint (optional, shown alongside the problem)</Label>
              <Textarea
                className="mt-1 min-h-[60px]"
                value={editing.q.hint}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    q: { ...editing.q, hint: e.target.value },
                  } as EditingState)
                }
                placeholder="One-liner that nudges the candidate without spoiling the solution."
              />
            </div>
            <div>
              <Label>AI assistance policy</Label>
              <select
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={editing.q.ai_policy ?? "forbidden"}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    q: {
                      ...editing.q,
                      ai_policy: e.target.value as CodingProblem["ai_policy"],
                    },
                  } as EditingState)
                }
              >
                <option value="forbidden">Forbidden — no AI tools (default)</option>
                <option value="allowed">Allowed — candidate may use AI</option>
                <option value="required">Required — AI-assisted task</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                When AI is allowed or required, a high AI-likelihood signal is
                expected and is not treated as cheating in the report.
              </p>
            </div>
            <div>
              <Label>Starter / boilerplate code (optional)</Label>
              <Textarea
                className="mt-1 min-h-[120px] font-mono text-xs"
                value={editing.q.boilerplate ?? ""}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    q: { ...editing.q, boilerplate: e.target.value },
                  } as EditingState)
                }
                placeholder={"Pre-fills the candidate's editor so they write only the logic, e.g.\n\ndef solve(nums, target):\n    # your approach here\n    pass"}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Shown to candidates of every role for this problem. Leave blank
                to use the generic per-language pseudocode stub.
              </p>
            </div>
            {/* Test-case editor.
                We store each example as {input, output}. The candidate
                sees them rendered as Input: / Output: blocks alongside
                the prompt. Recruiters can add/remove/edit. */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Test cases (input / output)</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      q: {
                        ...editing.q,
                        examples: [
                          ...(editing.q.examples ?? []),
                          { input: "", output: "" },
                        ],
                      },
                    } as EditingState)
                  }
                >
                  <Plus className="size-3.5" />
                  Add test case
                </Button>
              </div>
              {(editing.q.examples ?? []).length === 0 ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No test cases yet. Add at least one input/output pair so
                  the candidate can see what the function should return.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {(editing.q.examples ?? []).map((ex, i) => (
                    <div
                      key={i}
                      className="grid items-start gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                    >
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Input
                        </span>
                        <Input
                          value={ex.input}
                          onChange={(e) => {
                            const next = [...(editing.q.examples ?? [])];
                            next[i] = { ...next[i], input: e.target.value };
                            setEditing({
                              ...editing,
                              q: { ...editing.q, examples: next },
                            } as EditingState);
                          }}
                          placeholder='nums=[1,3,4,7], T=10'
                          className="mt-0.5 h-8 tabular"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          Output
                        </span>
                        <Input
                          value={ex.output}
                          onChange={(e) => {
                            const next = [...(editing.q.examples ?? [])];
                            next[i] = { ...next[i], output: e.target.value };
                            setEditing({
                              ...editing,
                              q: { ...editing.q, examples: next },
                            } as EditingState);
                          }}
                          placeholder='(1,3) → 3+7=10'
                          className="mt-0.5 h-8 tabular"
                        />
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="mt-4"
                        aria-label="Remove test case"
                        onClick={() => {
                          const next = [...(editing.q.examples ?? [])];
                          next.splice(i, 1);
                          setEditing({
                            ...editing,
                            q: { ...editing.q, examples: next },
                          } as EditingState);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving} loading={saving}>
                <Save className="size-3.5" />
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
