"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BRAND_NAME } from "@/lib/brand";

const CASE_STUDIES = [
  {
    company: "Razorpay",
    industry: "Fintech",
    blurb: "Cut Android engineering screen-to-shortlist time from 9 days to under 48 hours.",
    metric: "5×",
    metricLabel: "faster shortlisting",
  },
  {
    company: "Swiggy",
    industry: "Logistics",
    blurb: "Replaced two phone-screen rounds for backend SDE-2 with a structured 22-min AI interview.",
    metric: "−18 hrs",
    metricLabel: "senior engineer time / week",
  },
  {
    company: "PhonePe",
    industry: "Fintech",
    blurb: "Standardized rubric across three regional teams. Inter-rater agreement up from 0.51 to 0.83.",
    metric: "+62%",
    metricLabel: "rubric consistency",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "We were burning 8 hours of senior eng time per hire on first-round screens. " +
      BRAND_NAME +
      " cut that to zero — and the candidates we forwarded to panel were measurably stronger.",
    name: "Director of Engineering",
    role: "Series-C fintech, ~400 engineers",
  },
  {
    quote:
      "The reports are detailed enough that I trust them as a first signal. The AI-likelihood score has caught two cheaters this quarter alone.",
    name: "Hiring Manager",
    role: "Mobility platform, Bangalore",
  },
];

export default function CustomersPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-8 md:px-8 md:pt-24">
        <div className="max-w-3xl">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
            Customers
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
            Teams that ship faster
            <br />
            <span className="text-muted-foreground">with {BRAND_NAME}.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Beta clients and early adopters across Indian engineering hiring.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12 md:px-8 md:pb-16">
        <div className="grid gap-3 md:grid-cols-3">
          {CASE_STUDIES.map((c) => (
            <Card key={c.company}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{c.company}</div>
                  <Badge variant="outline" className="text-[10px]">
                    {c.industry}
                  </Badge>
                </div>
                <div className="mt-5 text-3xl font-semibold tracking-tight tabular text-[var(--primary)]">
                  {c.metric}
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.metricLabel}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">{c.blurb}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-3 md:grid-cols-2">
          {TESTIMONIALS.map((t) => (
            <Card key={t.name}>
              <CardContent className="p-6">
                <p className="text-base leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-5 text-sm font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground">{t.role}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 flex justify-center gap-3">
          <Button variant="primary" size="lg" asChild>
            <Link href="/contact">
              Become a customer <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </MarketingShell>
  );
}
