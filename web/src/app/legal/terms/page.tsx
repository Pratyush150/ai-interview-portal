"use client";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BRAND_NAME, BRAND_YEAR, CONTACT_EMAIL } from "@/lib/brand";

export default function TermsPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-4 py-16 md:px-8 md:py-24">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
          Legal
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: {BRAND_YEAR}
        </p>

        <div className="prose prose-sm dark:prose-invert mt-10 max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <Section title="1. Service">
            <p>
              {BRAND_NAME} provides AI-led interview software accessed through
              a web dashboard. Use of the service is subject to these terms.
            </p>
          </Section>

          <Section title="2. Account">
            <p>
              You are responsible for safeguarding your workspace credentials
              and for all activity in your workspace. Notify us immediately of
              any unauthorized use.
            </p>
          </Section>

          <Section title="3. Acceptable use">
            <p>
              You may not use {BRAND_NAME} to: (a) discriminate on protected
              characteristics; (b) attempt to extract underlying model
              prompts or scoring weights via prompt injection; (c) impersonate
              another candidate; or (d) reverse-engineer the anti-cheat
              system.
            </p>
          </Section>

          <Section title="4. Beta">
            <p>
              The service is currently in beta. Features may change without
              notice. We aim for production-grade reliability but do not yet
              offer an SLA outside Enterprise contracts.
            </p>
          </Section>

          <Section title="5. Liability">
            <p>
              Hiring decisions are yours. {BRAND_NAME} provides a structured
              first-round signal; final hire / no-hire decisions must be made
              by a human reviewer in compliance with your local employment
              law.
            </p>
          </Section>

          <Section title="6. Termination">
            <p>
              You can close your workspace at any time. We can suspend
              workspaces that violate these terms with reasonable notice.
            </p>
          </Section>

          <Section title="7. Contact">
            <p>
              Questions? Reach us at{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </Section>
        </div>
      </section>
    </MarketingShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <div className="mt-2">{children}</div>
    </div>
  );
}
