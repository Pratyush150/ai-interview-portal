"use client";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BRAND_NAME, BRAND_YEAR, CONTACT_EMAIL } from "@/lib/brand";

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-3xl px-4 py-16 md:px-8 md:py-24">
        <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
          Legal
        </div>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: {BRAND_YEAR}
        </p>

        <div className="prose prose-sm dark:prose-invert mt-10 max-w-none space-y-6 text-sm leading-relaxed text-muted-foreground">
          <Section title="1. What we collect">
            <p>
              When you use {BRAND_NAME}, we collect: (a) account information
              (name, email, password hash) for recruiters and candidates;
              (b) interview content (audio, transcripts, evaluation scores);
              (c) anti-cheat telemetry (tab switches, paste events, camera
              motion patterns); and (d) standard server logs (IP, user-agent,
              request timestamps) for security and uptime.
            </p>
          </Section>

          <Section title="2. What we don't do">
            <p>
              We do not sell your data. We do not share candidate transcripts
              with third parties. We do not use your candidates&apos; interview
              content to train any AI model — including ours.
            </p>
          </Section>

          <Section title="3. How long we keep it">
            <p>
              Interview audio is deleted within 30 days of the interview
              ending. Transcripts and reports are retained for as long as your
              workspace is active. You can delete an individual candidate
              record at any time from your dashboard.
            </p>
          </Section>

          <Section title="4. Sub-processors">
            <p>
              We use Deepgram for speech-to-text, ElevenLabs for text-to-speech
              (optional), and Groq for the language model. All sub-processors
              are bound by data processing agreements that prohibit retention
              beyond the time required to serve the request.
            </p>
          </Section>

          <Section title="5. Your rights">
            <p>
              You can request a copy of all data we hold about you, or
              request deletion, by emailing{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
              . We respond within 30 days.
            </p>
          </Section>

          <Section title="6. Contact">
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
