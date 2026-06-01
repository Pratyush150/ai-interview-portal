"use client";

import * as React from "react";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Mic,
  Building2,
  ShieldCheck,
  ClipboardList,
  Headphones,
  Eye,
  Briefcase,
  Clock,
  Users,
  TrendingDown,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, RECRUITER_ROLES } from "@/stores/auth-store";
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_YEAR,
  DEMO_WORKSPACE,
  DEMO_PASSWORD,
} from "@/lib/brand";

const TRUST_LOGOS = [
  "Razorpay",
  "Swiggy",
  "CRED",
  "Zerodha",
  "Freshworks",
  "Meesho",
  "PhonePe",
];

export default function Landing() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <LogoStrip />
      <ProblemWeSolve />
      <Features />
      <HowItWorks />
      <Credibility />
      <Stats />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const logout = useAuth((s) => s.logout);
  const isRecruiter = !!user && RECRUITER_ROLES.includes(user.role);
  const isCandidate = user?.role === "candidate";
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-[60px] max-w-6xl items-center px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-[var(--primary)] text-white">
            <Sparkles className="size-3.5" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">{BRAND_NAME}</span>
          <Badge variant="outline" className="ml-1 text-[10px]">
            beta
          </Badge>
        </Link>

        <nav className="ml-8 hidden items-center gap-5 text-sm text-muted-foreground md:flex">
          <Link href="/features" className="hover:text-foreground">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/customers" className="hover:text-foreground">
            Customers
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Contact
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {!hydrated || (!isRecruiter && !isCandidate) ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button variant="primary" size="sm" asChild>
                <Link href="/contact">Talk to sales</Link>
              </Button>
            </>
          ) : isRecruiter ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
              <Button variant="primary" size="sm" onClick={() => logout()}>
                Sign out
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/jobs">Browse jobs</Link>
              </Button>
              <Button variant="primary" size="sm" onClick={() => logout()}>
                Sign out
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
      <div className="max-w-3xl">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
          <span className="size-1.5 rounded-full bg-[var(--success)]" />
          <span className="font-medium">Live now</span>
          <span className="text-muted-foreground">
            · 20 engineering roles supported
          </span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
          {BRAND_TAGLINE}.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">
          {BRAND_NAME} is a voice-first AI interviewer your team controls.
          Generate candidate links in bulk, run structured 22-minute
          interviews, and review hire / no-hire reports the moment they
          finish — without burning your senior engineers&apos; calendars on
          phone screens.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button variant="primary" size="lg" asChild>
            <Link href="/contact">
              Talk to sales <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link href="/jobs">
              <Briefcase className="size-4" />
              Browse open roles
            </Link>
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">
            Already a client?{" "}
            <Link
              href="/login"
              className="text-foreground underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </span>
        </div>
      </div>
    </section>
  );
}

function LogoStrip() {
  return (
    <section className="border-y border-border bg-card/40 py-6">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Built for teams like
          </span>
          {TRUST_LOGOS.map((c) => (
            <span
              key={c}
              className="text-sm font-semibold text-muted-foreground/80 tracking-tight"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProblemWeSolve() {
  const points = [
    {
      icon: <Clock className="size-4" />,
      title: "Hours lost to phone screens",
      body: "Senior engineers spend 6–10 hours a week on repetitive first-round interviews. That's headcount-equivalent of a full junior engineer disappearing.",
    },
    {
      icon: <Users className="size-4" />,
      title: "Inconsistent, biased rubrics",
      body: "Every reviewer asks slightly different questions, weights things differently, and grades on different days. Outcomes correlate with reviewer mood more than candidate skill.",
    },
    {
      icon: <TrendingDown className="size-4" />,
      title: "Slow funnels lose top candidates",
      body: "Top candidates close in 7–10 days. Most teams need 3 weeks to get a candidate from resume to offer. The best people are gone before the panel meets.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
      <div className="max-w-2xl">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
          The problem
        </div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Hiring engineering talent is expensive,
          <br />
          <span className="text-muted-foreground">
            and most of the cost is on the wrong side.
          </span>
        </h2>
      </div>
      <div className="mt-10 grid gap-3 md:grid-cols-3">
        {points.map((p) => (
          <Card key={p.title}>
            <CardContent className="p-6">
              <div className="flex size-9 items-center justify-center rounded-md border border-border text-[var(--primary)]">
                {p.icon}
              </div>
              <div className="mt-4 text-sm font-semibold">{p.title}</div>
              <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Features() {
  return (
    <section
      id="features"
      className="border-t border-border bg-card/30 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="max-w-2xl">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
            Why {BRAND_NAME}
          </div>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
            Everything a structured interview needs.
            <br />
            <span className="text-muted-foreground">
              Nothing it doesn&apos;t.
            </span>
          </h2>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <FeatureCard
            icon={<Mic className="size-4" />}
            title="Voice-first"
            body="Mic in, voice out. No typing, no avatars in the candidate's face. The interviewer waits until they finish — never silence-cuts mid-thought."
          />
          <FeatureCard
            icon={<Building2 className="size-4" />}
            title="Adapts to the role"
            body="20 engineering roles × 6 seniority tiers, paced by clock not turn count. A staff SRE deep-dive and an Android interview look genuinely different — same engine, different prompts."
          />
          <FeatureCard
            icon={<ShieldCheck className="size-4" />}
            title="Anti-cheat baked in"
            body="Camera, paste, tab-switch, and second-screen detection — all browser-side, all logged, all visible to the reviewer with timestamps."
          />
        </div>

        <div className="mt-6 flex justify-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/features">
              See all features <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex size-9 items-center justify-center rounded-md border border-border text-[var(--primary)]">
          {icon}
        </div>
        <div className="mt-4 text-sm font-semibold">{title}</div>
        <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <ClipboardList className="size-4" />,
      title: "Post a role",
      body: "Paste a JD into your dashboard. AI extracts skills, sets the depth, picks the topic mix. Under 30 seconds.",
    },
    {
      icon: <Headphones className="size-4" />,
      title: "Generate candidate links",
      body: "Paste a list of emails or generate anonymous links. Each link is single-use, expires automatically, revocable any time.",
    },
    {
      icon: <Eye className="size-4" />,
      title: "Review reports",
      body: "Transcript with timestamped highlights, score breakdown across four dimensions, AI-likelihood per turn. Hire / no-hire recommendation.",
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-28">
      <div className="max-w-2xl">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
          How it works
        </div>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          Three steps. No services calls.
        </h2>
      </div>

      <div className="mt-10 grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <Card key={s.title}>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex size-7 items-center justify-center rounded-full border border-[var(--primary)] text-xs font-semibold tabular text-[var(--primary)]">
                  {i + 1}
                </span>
                <span className="text-muted-foreground">{s.icon}</span>
              </div>
              <div className="mt-4 text-sm font-semibold">{s.title}</div>
              <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Credibility() {
  return (
    <section
      id="credibility"
      className="border-t border-border bg-card/30 py-20 md:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
              Why teams trust us
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              Built by engineers who hire engineers.
            </h2>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
              {BRAND_NAME} was built after watching every interview we ran for
              three years repeat the same first-round questions and produce
              answers that should have been catchable by a script.
            </p>
            <ul className="mt-5 space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                Your data stays in your workspace. No third-party sharing, no
                training on your candidates&apos; transcripts.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                Per-candidate AI-likelihood score with cited evidence — not a
                black box.
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                Tested on real production hiring funnels at Indian
                engineering teams.
              </li>
            </ul>
            <div className="mt-6 flex gap-3">
              <Button variant="primary" size="lg" asChild>
                <Link href="/contact">Talk to sales</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/customers">Read case studies</Link>
              </Button>
            </div>
          </div>
          <Card>
            <CardContent className="p-6">
              <div className="text-sm font-semibold">
                Try the demo workspace
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Pre-seeded with 20 sample roles. Sign in to see the full
                recruiter dashboard.
              </p>
              <div className="mt-4 space-y-2 text-sm tabular">
                <div className="flex justify-between border-b border-border pb-2">
                  <span className="text-muted-foreground">Workspace</span>
                  <span className="font-medium">{DEMO_WORKSPACE}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Password</span>
                  <span className="font-medium">{DEMO_PASSWORD}</span>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                className="mt-5 w-full"
                asChild
              >
                <Link href="/login">Sign in to demo</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const items = [
    { v: "20", k: "engineering roles" },
    { v: "6", k: "seniority tiers" },
    { v: "22 min", k: "default interview, time-paced" },
    { v: "0", k: "third-party data sharing" },
  ];
  return (
    <section className="border-t border-border py-12">
      <div className="mx-auto grid max-w-6xl gap-3 px-4 md:grid-cols-4 md:px-8">
        {items.map((s) => (
          <div key={s.k}>
            <div className="text-3xl font-semibold tabular tracking-tight">
              {s.v}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{s.k}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-24">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-6 p-8 md:p-12">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              Hire faster without hiring more recruiters.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Free during the beta. No credit card. First interview live in
              ten minutes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" asChild>
              <Link href="/contact">
                Talk to sales <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto max-w-6xl px-4 md:px-8">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex size-5 items-center justify-center rounded bg-[var(--primary)] text-white">
              <Sparkles className="size-2.5" />
            </div>
            <span className="font-semibold text-foreground">{BRAND_NAME}</span>
          </div>
          <span className="opacity-60">·</span>
          <Link href="/features" className="hover:text-foreground">
            Features
          </Link>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/customers" className="hover:text-foreground">
            Customers
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Contact
          </Link>
          <Link href="/legal/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/legal/terms" className="hover:text-foreground">
            Terms
          </Link>
          <span className="ml-auto opacity-60 tabular">© {BRAND_YEAR} {BRAND_NAME}</span>
        </div>
      </div>
    </footer>
  );
}
