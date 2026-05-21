"use client";

import * as React from "react";
import {
  Mic,
  Camera,
  Wifi,
  ShieldCheck,
  Check,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type CheckStatus = "pending" | "running" | "ok" | "fail";

interface CheckItem {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: CheckStatus;
  detail?: string;
}

interface Props {
  candidateName: string;
  roleTitle: string;
  onReady: () => void;
}

export function PreInterviewCheck({ candidateName, roleTitle, onReady }: Props) {
  const [checks, setChecks] = React.useState<CheckItem[]>([
    {
      id: "mic",
      label: "Microphone",
      description: "Permission and live audio level.",
      icon: Mic,
      status: "pending",
    },
    {
      id: "camera",
      label: "Camera",
      description: "Permission and frame capture.",
      icon: Camera,
      status: "pending",
    },
    {
      id: "network",
      label: "Network",
      description: "Latency and stable upload bandwidth.",
      icon: Wifi,
      status: "pending",
    },
    {
      id: "id",
      label: "ID verification",
      description: "Government ID matched to your application.",
      icon: ShieldCheck,
      status: "pending",
    },
  ]);

  const [running, setRunning] = React.useState(false);

  async function runAll() {
    setRunning(true);
    for (let i = 0; i < checks.length; i++) {
      setChecks((cs) =>
        cs.map((c, idx) => (idx === i ? { ...c, status: "running" } : c)),
      );
      // Simulate the check; in a real flow we'd request media permissions etc.
      await new Promise((r) => setTimeout(r, 700 + i * 200));
      setChecks((cs) =>
        cs.map((c, idx) =>
          idx === i
            ? {
                ...c,
                status: "ok",
                detail:
                  c.id === "mic"
                    ? "Detected: -34dBFS · MacBook Pro Microphone"
                    : c.id === "camera"
                      ? "Detected: 1280×720 · FaceTime HD Camera"
                      : c.id === "network"
                        ? "Latency 38ms · Upload 11.2 Mbps"
                        : "Aadhaar verified · matched against application",
              }
            : c,
        ),
      );
    }
    setRunning(false);
  }

  const allOk = checks.every((c) => c.status === "ok");

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-12">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Hello {candidateName.split(" ")[0]}, welcome.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A few quick checks before we start your interview for{" "}
          <span className="font-medium text-foreground">{roleTitle}</span>.
          This usually takes under a minute.
        </p>
      </div>

      <Card className="overflow-hidden">
        <ul>
          {checks.map((c, i) => {
            const Icon = c.icon;
            return (
              <li
                key={c.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3.5",
                  i !== 0 && "border-t border-border",
                )}
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border">
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.label}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.detail ?? c.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground max-w-md">
          By starting the interview you agree to be recorded. Recordings are
          stored only for review by the hiring team.
        </p>
        {allOk ? (
          <Button variant="primary" onClick={onReady}>
            Start interview
          </Button>
        ) : (
          <Button
            variant="primary"
            loading={running}
            onClick={runAll}
            disabled={running}
          >
            {running ? "Running checks…" : "Run checks"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (status === "ok")
    return (
      <Badge variant="success" className="gap-1">
        <Check className="size-3" /> Ready
      </Badge>
    );
  if (status === "running")
    return (
      <Badge variant="primary" className="gap-1">
        <Loader2 className="size-3 animate-spin" /> Checking
      </Badge>
    );
  if (status === "fail")
    return (
      <Badge variant="danger" className="gap-1">
        <AlertTriangle className="size-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Pending
    </Badge>
  );
}
