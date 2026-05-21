"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BRAND_NAME } from "@/lib/brand";

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    blurb: "For teams piloting AI interviews on a couple of roles.",
    features: [
      "Up to 25 interviews/month",
      "1 workspace, 1 seat",
      "All 20 role profiles",
      "Standard reports",
      "Community support",
    ],
    cta: "Talk to sales",
    highlight: false,
  },
  {
    name: "Growth",
    price: "Custom",
    badge: "Most teams",
    blurb: "Self-serve dashboard, bulk candidate links, full anti-cheat.",
    features: [
      "Up to 500 interviews/month",
      "Unlimited team seats",
      "Bulk candidate-link generation",
      "Full report + transcript export",
      "Anti-cheat dashboard",
      "Priority email support",
    ],
    cta: "Talk to sales",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Talk to us",
    blurb: "ATS integration, SSO, custom rubrics, dedicated support.",
    features: [
      "Unlimited interviews",
      "SSO (Google / Microsoft / SAML)",
      "ATS integrations (Greenhouse, Lever, …)",
      "Custom rubrics & role profiles",
      "Audit log export",
      "SLA + dedicated success engineer",
    ],
    cta: "Talk to sales",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-8 md:px-8 md:pt-24">
        <div className="max-w-3xl">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
            Pricing
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
            Pick a plan.
            <br />
            <span className="text-muted-foreground">Scale when ready.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            Free during the {BRAND_NAME} beta. No credit card. Talk to sales
            when you&apos;re ready to scale beyond the Starter caps.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-3 md:grid-cols-3">
          {PLANS.map((p) => (
            <Card
              key={p.name}
              className={p.highlight ? "border-[var(--primary)] shadow-md" : ""}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{p.name}</div>
                  {p.badge ? (
                    <Badge variant="primary" className="text-[10px]">
                      {p.badge}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-4 text-3xl font-semibold tracking-tight tabular">
                  {p.price}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.blurb}</p>
                <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-[var(--success)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={p.highlight ? "primary" : "outline"}
                  size="lg"
                  className="mt-6 w-full"
                  asChild
                >
                  <Link href="/contact">{p.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Need something different?{" "}
          <Link
            href="/contact"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Tell us what you need
          </Link>{" "}
          — we&apos;ll quote in 48 hours.
        </p>
      </section>
    </MarketingShell>
  );
}
