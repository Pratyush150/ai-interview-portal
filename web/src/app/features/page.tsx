"use client";

import Link from "next/link";
import {
  Mic,
  ShieldCheck,
  Building2,
  ClipboardList,
  Eye,
  Users,
  Clock,
  FileText,
  Zap,
  Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BRAND_NAME } from "@/lib/brand";

const FEATURES = [
  {
    icon: <Mic className="size-4" />,
    title: "Voice-first interviews",
    body: "Candidates speak, the AI listens. No typing, no awkward chatbot UI. Mid-thought silences are tolerated; barge-in is supported.",
  },
  {
    icon: <Building2 className="size-4" />,
    title: "20 role profiles, 6 seniority tiers",
    body: "Backend, frontend, mobile, data, ML, devops, security, embedded, robotics, PM, TPM, sales eng — and growing. Each role has its own prompt set, topic mix, and rubric weights.",
  },
  {
    icon: <Clock className="size-4" />,
    title: "Clock-paced, not turn-paced",
    body: "Stages get a percentage of the total interview time, not a fixed number of questions. A 22-minute principal interview goes deeper on architecture; a 12-minute intern interview stays on fundamentals.",
  },
  {
    icon: <ShieldCheck className="size-4" />,
    title: "Anti-cheat, browser-side",
    body: "Tab switches, paste events, second-screen reflections, dark frames, camera blocks, motion patterns — all detected client-side, all logged with timestamps the reviewer can replay.",
  },
  {
    icon: <FileText className="size-4" />,
    title: "Resume-aware probing",
    body: "Pre-flight reads the resume against the JD and produces a brief: gaps to probe, unverified claims, depth-test topics. The interviewer steers questions toward what's actually unknown.",
  },
  {
    icon: <Eye className="size-4" />,
    title: "Structured 4-dimension rubric",
    body: "Correctness, depth, communication, relevance. Each turn scored 0–10 across all four. Aggregated into hire / lean-hire / lean-no / no-hire recommendation with cited evidence.",
  },
  {
    icon: <Zap className="size-4" />,
    title: "AI-likelihood detection",
    body: "Every turn rated 0–1 for AI-generated likelihood, blending heuristic signals (typing speed, vocabulary density, disfluency) with LLM judgment.",
  },
  {
    icon: <Users className="size-4" />,
    title: "Bulk candidate links",
    body: "Paste a list of emails, generate a batch of single-use interview URLs in one click. Each link tracks: created → sent → opened → started → completed. Revoke instantly.",
  },
  {
    icon: <ClipboardList className="size-4" />,
    title: "Self-serve workspace",
    body: "Each client gets a dedicated dashboard URL. Create roles, generate links, review reports — your team controls the pipeline without a single email to us.",
  },
  {
    icon: <Lock className="size-4" />,
    title: "Tenant-isolated data",
    body: "Every API call is scoped to your workspace. No cross-client reads. Your candidates' data is never used to train anyone's model — including ours.",
  },
];

export default function FeaturesPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-8 md:px-8 md:pt-24">
        <div className="max-w-3xl">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
            Features
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
            Everything {BRAND_NAME} ships,
            <br />
            <span className="text-muted-foreground">in one page.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Built for engineering hiring managers who want consistency,
            auditability, and speed — without giving up control.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title}>
              <CardContent className="p-6">
                <div className="flex size-9 items-center justify-center rounded-md border border-border text-[var(--primary)]">
                  {f.icon}
                </div>
                <div className="mt-4 text-sm font-semibold">{f.title}</div>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 flex justify-center gap-3">
          <Button variant="primary" size="lg" asChild>
            <Link href="/contact">Talk to sales</Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/pricing">See pricing</Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
