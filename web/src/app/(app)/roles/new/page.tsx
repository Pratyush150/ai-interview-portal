"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, Sparkles, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { lakhs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  createJob,
  createTenantJob,
  fetchRoleCatalog,
  AuthError,
  type JobCreatePayload,
} from "@/lib/auth-api";
import { useAuth } from "@/stores/auth-store";

// Default years range per seniority — used when the user doesn't override.
const SENIORITY_YEARS: Record<string, [number, number]> = {
  intern: [0, 1],
  entry: [0, 2],
  mid: [2, 5],
  senior: [5, 9],
  lead: [9, 14],
  principal: [14, 25],
};

const STEPS = [
  { id: "paste", label: "Paste JD" },
  { id: "skills", label: "Extract skills" },
  { id: "questions", label: "Configure questions" },
  { id: "difficulty", label: "Set difficulty" },
  { id: "review", label: "Review & publish" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

const SAMPLE_JD = `We're hiring a Senior Software Engineer to own the design and delivery of our payments platform services. The role involves owning multi-region API gateways, building event-driven workflows on Kafka, and partnering closely with the SRE team on reliability targets.

Requirements:
- 5+ years building production services in Go or Python
- Strong PostgreSQL fluency and experience with high-cardinality data models
- Comfort with Kubernetes, gRPC, and tracing-based observability
- Track record of leading complex migrations end-to-end without outages
- Excellent written communication; ability to mentor mid-level engineers

Bengaluru / hybrid · 38–65 LPA`;

export default function NewRolePage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [stepIdx, setStepIdx] = React.useState(0);
  const step: StepId = STEPS[stepIdx]!.id;

  const [jd, setJd] = React.useState(SAMPLE_JD);
  const [title, setTitle] = React.useState("Senior Software Engineer — Platform");
  const [department, setDepartment] = React.useState("Engineering");
  const [location, setLocation] = React.useState("Bengaluru / Hybrid");
  const [seniority, setSeniority] = React.useState("senior");
  const [roleFamily, setRoleFamily] = React.useState("backend_engineering");
  const [roleFamilies, setRoleFamilies] = React.useState<
    { role_family: string; display_name: string }[]
  >([]);
  const [salaryMin, setSalaryMin] = React.useState(38_00_000);
  const [salaryMax, setSalaryMax] = React.useState(65_00_000);
  const [skills, setSkills] = React.useState<string[]>([
    "Go",
    "Kubernetes",
    "gRPC",
    "Distributed Systems",
    "PostgreSQL",
    "Observability",
  ]);
  const [skillInput, setSkillInput] = React.useState("");
  const [extracting, setExtracting] = React.useState(false);
  const [extractDone, setExtractDone] = React.useState(false);

  const [includeCoding, setIncludeCoding] = React.useState(true);
  const [includeBehavioural, setIncludeBehavioural] = React.useState(true);
  const [includeSystemDesign, setIncludeSystemDesign] = React.useState(true);
  const [difficulty, setDifficulty] = React.useState<"easy" | "medium" | "hard">("medium");
  const [publishing, setPublishing] = React.useState(false);

  React.useEffect(() => {
    fetchRoleCatalog()
      .then((c) => setRoleFamilies(c.role_families))
      .catch(() => setRoleFamilies([]));
  }, []);

  function next() {
    if (stepIdx === 0 && !extractDone) {
      // Simulate extraction step entering
      setExtracting(true);
      setTimeout(() => {
        setExtracting(false);
        setExtractDone(true);
        setStepIdx(1);
      }, 900);
      return;
    }
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }
  function prev() {
    setStepIdx((i) => Math.max(i - 1, 0));
  }

  async function publish() {
    if (!user?.companyId || !user.authToken) {
      toast.error(
        "You're not signed in to a company workspace. Sign in or register first.",
      );
      router.push("/login");
      return;
    }
    const [defaultMin, defaultMax] = SENIORITY_YEARS[seniority] ?? [2, 5];
    const payload: JobCreatePayload = {
      title: title.trim(),
      description: jd.trim(),
      required_skills: skills.join(", "),
      role_family: roleFamily,
      seniority,
      min_experience_years: defaultMin,
      max_experience_years: defaultMax,
      department: department.trim(),
      employment_type: "full_time",
    };
    if (!payload.title) {
      toast.error("A title is required.");
      return;
    }
    setPublishing(true);
    try {
      // Slug-aware path is preferred — it goes through the multi-tenant
      // guard. Legacy path stays as a fallback for mock-auth sessions.
      if (user.companySlug) {
        await createTenantJob(user.companySlug, user.authToken, payload);
      } else {
        await createJob(user.companyId, user.authToken, payload);
      }
      toast.success("Role published. Candidates can apply now.");
      router.push("/dashboard");
    } catch (err) {
      const e = err as AuthError;
      toast.error(e.message || "Couldn't publish the role.");
    } finally {
      setPublishing(false);
    }
  }

  function addSkill() {
    const s = skillInput.trim();
    if (!s) return;
    if (!skills.includes(s)) setSkills([...skills, s]);
    setSkillInput("");
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New role</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Each step takes under thirty seconds. We&apos;ll wire interviews to
          this role automatically.
        </p>
      </div>

      <Stepper currentIdx={stepIdx} />

      {step === "paste" && (
        <Card>
          <CardHeader>
            <Label>Paste a JD or write your own</Label>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              rows={10}
              className="text-sm"
              placeholder="Paste a JD here…"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Department">
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                />
              </Field>
              <Field label="Location">
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </Field>
              <Field label="Seniority">
                <Select value={seniority} onValueChange={setSeniority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="intern">Intern</SelectItem>
                    <SelectItem value="entry">Entry</SelectItem>
                    <SelectItem value="mid">Mid</SelectItem>
                    <SelectItem value="senior">Senior</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="principal">Principal</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Role family (drives interview style)">
                <Select value={roleFamily} onValueChange={setRoleFamily}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleFamilies.length === 0 ? (
                      <SelectItem value={roleFamily}>
                        {roleFamily.replace(/_/g, " ")}
                      </SelectItem>
                    ) : (
                      roleFamilies.map((r) => (
                        <SelectItem key={r.role_family} value={r.role_family}>
                          {r.display_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "skills" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-[var(--primary)]" />
              <Label>AI-extracted skills</Label>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Edit, remove, or add. These drive interview question selection.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <Badge
                  key={s}
                  variant="primary"
                  className="gap-1 pr-1 cursor-pointer"
                  onClick={() => setSkills(skills.filter((x) => x !== s))}
                >
                  {s}
                  <X className="size-3 opacity-70" />
                </Badge>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <Input
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSkill()}
                placeholder="Add a skill (press Enter)"
                className="max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={addSkill}>
                Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "questions" && (
        <Card>
          <CardHeader>
            <Label>Interview composition</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              The engine mixes these blocks based on the role family.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <ToggleRow
              label="Background"
              description="Probe past projects, ownership, and tradeoffs."
              checked
              onChange={() => undefined}
              locked
            />
            <ToggleRow
              label="Coding"
              description="Live coding via Monaco. Autocomplete is disabled."
              checked={includeCoding}
              onChange={setIncludeCoding}
            />
            <ToggleRow
              label="System design"
              description="Open-ended scaling and tradeoff reasoning."
              checked={includeSystemDesign}
              onChange={setIncludeSystemDesign}
            />
            <ToggleRow
              label="Behavioural"
              description="Conflict, mentoring, and decision reversal questions."
              checked={includeBehavioural}
              onChange={setIncludeBehavioural}
            />
          </CardContent>
        </Card>
      )}

      {step === "difficulty" && (
        <Card>
          <CardHeader>
            <Label>Difficulty</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Auto-calibrated from candidate years of experience, but you can
              set a floor here.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            {(["easy", "medium", "hard"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDifficulty(d)}
                className={cn(
                  "flex flex-col rounded-md border p-4 text-left transition-colors",
                  difficulty === d
                    ? "border-[var(--primary)] bg-[color-mix(in_oklab,var(--primary)_6%,transparent)]"
                    : "border-border hover:bg-accent/40",
                )}
              >
                <span className="text-sm font-medium capitalize">{d}</span>
                <span className="mt-1 text-xs text-muted-foreground">
                  {d === "easy"
                    ? "New-grad / junior — fundamentals."
                    : d === "medium"
                      ? "IC-level — tradeoffs and project ownership."
                      : "Senior — architecture and failure modes."}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <Card>
          <CardHeader>
            <Label>Review</Label>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Summary label="Title" value={title} />
              <Summary label="Department" value={department} />
              <Summary label="Location" value={location} />
              <Summary label="Seniority" value={seniority} />
              <Summary label="Role family" value={roleFamily.replace(/_/g, " ")} />
              <Summary label="Difficulty" value={difficulty} />
              <Summary
                label="CTC range"
                value={`${lakhs(salaryMin)} – ${lakhs(salaryMax)}`}
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Skills
              </div>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Min CTC (₹)">
                <Input
                  value={salaryMin}
                  onChange={(e) => setSalaryMin(Number(e.target.value))}
                  className="tabular"
                />
              </Field>
              <Field label="Max CTC (₹)">
                <Input
                  value={salaryMax}
                  onChange={(e) => setSalaryMax(Number(e.target.value))}
                  className="tabular"
                />
              </Field>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={prev}
          disabled={stepIdx === 0}
          className="gap-1.5"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        {stepIdx === STEPS.length - 1 ? (
          <Button variant="primary" onClick={publish} disabled={publishing}>
            {publishing ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {publishing ? "Publishing…" : "Publish role"}
          </Button>
        ) : (
          <Button variant="primary" onClick={next} loading={extracting}>
            {stepIdx === 0 && !extractDone ? "Extract skills" : "Continue"}
            <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ currentIdx }: { currentIdx: number }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1">
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s.id} className="flex items-center gap-2 shrink-0">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-[11px] font-medium tabular",
                done
                  ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                  : active
                    ? "border-[var(--primary)] text-[var(--primary)]"
                    : "border-border text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn(
                "text-xs",
                active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="mx-1 h-px w-6 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm capitalize">{value}</div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  locked,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {label}{" "}
          {locked && (
            <Badge variant="outline" className="ml-1.5 text-[10px]">
              required
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={locked} />
    </div>
  );
}
