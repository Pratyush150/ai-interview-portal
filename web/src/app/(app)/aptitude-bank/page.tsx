"use client";

import * as React from "react";
import { Plus, Pencil, Trash2, Save, X, Loader2 } from "lucide-react";
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

interface AptitudeQ {
  id: string;
  category: string;
  question_text: string;
  options: string[];
  correct_index: number;
  difficulty: string;
  active: boolean;
  position: number;
  created_at: string;
}

type EditingState =
  | { mode: "new"; q: Omit<AptitudeQ, "id" | "position" | "created_at"> }
  | { mode: "edit"; q: AptitudeQ }
  | null;

const DEFAULT_NEW: Omit<AptitudeQ, "id" | "position" | "created_at"> = {
  category: "general",
  question_text: "",
  options: ["", "", "", ""],
  correct_index: 0,
  difficulty: "easy",
  active: true,
};

const CATEGORIES = ["general", "logical", "quantitative", "verbal", "technical"];
const DIFFICULTIES = ["easy", "medium", "hard"];

export default function AptitudePage() {
  const slug = useAuth((s) => s.user?.companySlug);
  const token = useAuth((s) => s.user?.authToken);

  const [questions, setQuestions] = React.useState<AptitudeQ[] | null>(null);
  const [editing, setEditing] = React.useState<EditingState>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!slug || !token) return;
    try {
      const r = await fetch(`${apiBase()}/api/c/${slug}/aptitude/questions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setQuestions(await r.json());
    } catch (e) {
      toast.error("Couldn't load aptitude bank: " + (e as Error).message);
    }
  }, [slug, token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!editing || !slug || !token) return;
    const q = editing.q;
    // Client-side validation
    if (!q.question_text.trim()) {
      toast.error("Question text is required.");
      return;
    }
    if (q.options.some((o) => !o.trim())) {
      toast.error("Fill in all options or remove the blank ones.");
      return;
    }
    if (q.correct_index < 0 || q.correct_index >= q.options.length) {
      toast.error("Pick a correct answer.");
      return;
    }
    setBusy(true);
    try {
      const isNew = editing.mode === "new";
      const url = isNew
        ? `${apiBase()}/api/c/${slug}/aptitude/questions`
        : `${apiBase()}/api/c/${slug}/aptitude/questions/${(editing.q as AptitudeQ).id}`;
      const r = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(q),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.detail || `HTTP ${r.status}`);
      }
      toast.success(isNew ? "Question added" : "Question updated");
      setEditing(null);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function softDelete(id: string) {
    if (!slug || !token) return;
    if (!confirm("Remove this question from the active aptitude bank?")) return;
    try {
      const r = await fetch(
        `${apiBase()}/api/c/${slug}/aptitude/questions/${id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast.success("Question removed");
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const activeCount = questions?.filter((q) => q.active).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Aptitude bank</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Multiple-choice questions shown to candidates before the AI
            interview. Each candidate sees the first {Math.min(activeCount, 10)} active
            questions; pass mark is 6/10, 10-minute timer. Failure locks the
            application — no retries.
          </p>
        </div>
        <Button
          onClick={() => setEditing({ mode: "new", q: { ...DEFAULT_NEW, options: ["", "", "", ""] } })}
          className="gap-1.5"
        >
          <Plus className="size-4" /> Add question
        </Button>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Badge variant="outline">{activeCount} active</Badge>
        <Badge variant="outline">{questions?.length ?? 0} total</Badge>
        {activeCount < 10 && (
          <span className="text-[var(--danger)]">
            Below 10 active questions — candidates will see fewer than the configured total.
          </span>
        )}
      </div>

      {questions === null ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : questions.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No aptitude questions yet. Click <b>Add question</b> to start the bank.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <Card key={q.id} className={cn(!q.active && "opacity-60")}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="mt-0.5 w-8 shrink-0 text-xs font-semibold tabular text-muted-foreground">
                  Q{i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {q.category}
                    </Badge>
                    <Badge variant="outline" className="capitalize text-[10px]">
                      {q.difficulty}
                    </Badge>
                    {!q.active && (
                      <Badge variant="outline" className="text-[10px]">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-sm font-medium leading-relaxed">
                    {q.question_text}
                  </div>
                  <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    {q.options.map((o, j) => (
                      <li
                        key={j}
                        className={cn(
                          "flex items-start gap-2",
                          j === q.correct_index && "text-[var(--success,#10b981)] font-medium",
                        )}
                      >
                        <span className="w-4 shrink-0">{String.fromCharCode(65 + j)}.</span>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setEditing({ mode: "edit", q })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => softDelete(q.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ─── Editor modal ─── */}
      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !busy && setEditing(null)}
        >
          <div
            className="w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Card>
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold tracking-tight">
                    {editing.mode === "new" ? "Add aptitude question" : "Edit question"}
                  </h2>
                  <Button size="icon" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
                    <X className="size-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Category</Label>
                    <Select
                      value={editing.q.category}
                      onValueChange={(v) =>
                        setEditing({ ...editing, q: { ...editing.q, category: v } } as EditingState)
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => (
                          <SelectItem key={c} value={c} className="capitalize">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Difficulty</Label>
                    <Select
                      value={editing.q.difficulty}
                      onValueChange={(v) =>
                        setEditing({ ...editing, q: { ...editing.q, difficulty: v } } as EditingState)
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIFFICULTIES.map((d) => (
                          <SelectItem key={d} value={d} className="capitalize">
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Question text</Label>
                  <Textarea
                    className="mt-1"
                    rows={2}
                    value={editing.q.question_text}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        q: { ...editing.q, question_text: e.target.value },
                      } as EditingState)
                    }
                    placeholder="e.g. What is 20% of 250?"
                  />
                </div>

                <div>
                  <Label className="text-xs">
                    Options (click the circle to mark the correct one)
                  </Label>
                  <div className="mt-2 space-y-2">
                    {editing.q.options.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              ...editing,
                              q: { ...editing.q, correct_index: i },
                            } as EditingState)
                          }
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                            editing.q.correct_index === i
                              ? "border-[var(--success,#10b981)] bg-[var(--success,#10b981)] text-white"
                              : "border-border text-muted-foreground hover:border-foreground",
                          )}
                          title={
                            editing.q.correct_index === i
                              ? "This is the correct answer"
                              : "Mark as correct"
                          }
                        >
                          {String.fromCharCode(65 + i)}
                        </button>
                        <Input
                          value={o}
                          onChange={(e) => {
                            const next = [...editing.q.options];
                            next[i] = e.target.value;
                            setEditing({
                              ...editing,
                              q: { ...editing.q, options: next },
                            } as EditingState);
                          }}
                          placeholder={`Option ${String.fromCharCode(65 + i)}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs">
                    <Switch
                      checked={editing.q.active}
                      onCheckedChange={(v) =>
                        setEditing({
                          ...editing,
                          q: { ...editing.q, active: v },
                        } as EditingState)
                      }
                    />
                    <span>Active (shown to candidates)</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
                      Cancel
                    </Button>
                    <Button onClick={save} disabled={busy} loading={busy} className="gap-1.5">
                      <Save className="size-4" /> Save
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
