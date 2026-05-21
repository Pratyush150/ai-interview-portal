"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { BRAND_NAME, CONTACT_EMAIL } from "@/lib/brand";
import { submitLead } from "@/lib/leads-api";
import { toast } from "sonner";

type Kind = "company" | "individual";

export default function ContactPage() {
  const [kind, setKind] = React.useState<Kind>("company");
  const [companyName, setCompanyName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [roleCount, setRoleCount] = React.useState("");
  const [useCase, setUseCase] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contactName.trim()) {
      toast.error("Please tell us your name.");
      return;
    }
    if (!email.includes("@")) {
      toast.error("A valid email helps us reach back.");
      return;
    }
    setBusy(true);
    try {
      await submitLead({
        kind,
        company_name: kind === "company" ? companyName.trim() || null : null,
        contact_name: contactName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        role_count: roleCount ? parseInt(roleCount, 10) : null,
        use_case: useCase.trim() || null,
        source: "contact_form",
      });
      setDone(true);
      toast.success("Got it. We'll be in touch within 24 hours.");
    } catch (err) {
      toast.error((err as Error).message || "Couldn't submit. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-8 md:px-8 md:pt-24">
        <div className="max-w-3xl">
          <div className="text-xs font-medium uppercase tracking-wider text-[var(--primary)]">
            Contact
          </div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
            Tell us what you&apos;re hiring for.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground">
            We&apos;ll provision your {BRAND_NAME} workspace and walk you
            through your first interview within 24 hours. Or email us directly
            at{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-foreground underline-offset-4 hover:underline"
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 md:px-8 md:pb-28">
        <div className="grid gap-8 md:grid-cols-3">
          <div className="md:col-span-1">
            <h3 className="text-sm font-semibold">What happens next</h3>
            <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--primary)] text-xs font-semibold text-[var(--primary)]">
                  1
                </span>
                We read your note and reply within 24 hours.
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--primary)] text-xs font-semibold text-[var(--primary)]">
                  2
                </span>
                30-min call to scope your roles + screening flow.
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--primary)] text-xs font-semibold text-[var(--primary)]">
                  3
                </span>
                We provision your workspace and email you a setup link.
              </li>
              <li className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-[var(--primary)] text-xs font-semibold text-[var(--primary)]">
                  4
                </span>
                You generate your first batch of candidate links — same day.
              </li>
            </ol>
          </div>

          <Card className="md:col-span-2">
            <CardContent className="p-6">
              {done ? (
                <div className="flex flex-col items-center gap-4 py-12 text-center">
                  <CheckCircle2 className="size-12 text-[var(--success)]" />
                  <div className="text-lg font-semibold">
                    Thanks — we&apos;ve got it.
                  </div>
                  <p className="max-w-md text-sm text-muted-foreground">
                    A member of the {BRAND_NAME} team will be in touch within
                    24 hours. In the meantime, you&apos;re welcome to{" "}
                    <Link
                      href="/login"
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      sign into the demo workspace
                    </Link>{" "}
                    and explore.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setKind("company")}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                        kind === "company"
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                          : "border-input text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      I&apos;m hiring
                    </button>
                    <button
                      type="button"
                      onClick={() => setKind("individual")}
                      className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                        kind === "individual"
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                          : "border-input text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      Just curious
                    </button>
                  </div>

                  {kind === "company" && (
                    <Field label="Company name" htmlFor="company">
                      <input
                        id="company"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="Acme Technologies"
                        autoComplete="organization"
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </Field>
                  )}

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Your name" htmlFor="cname" required>
                      <input
                        id="cname"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                        placeholder="Priya Sharma"
                        autoComplete="name"
                        required
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </Field>
                    <Field label="Work email" htmlFor="email" required>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="priya@acme.com"
                        autoComplete="email"
                        required
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Phone (optional)" htmlFor="phone">
                      <input
                        id="phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+91 98xxx xxxxx"
                        autoComplete="tel"
                        className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </Field>
                    {kind === "company" && (
                      <Field label="Hiring volume / month" htmlFor="rcount">
                        <input
                          id="rcount"
                          type="number"
                          min={0}
                          value={roleCount}
                          onChange={(e) => setRoleCount(e.target.value)}
                          placeholder="e.g. 25"
                          className="mt-1 flex h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                      </Field>
                    )}
                  </div>

                  <Field
                    label={
                      kind === "company"
                        ? "What are you trying to solve?"
                        : "What would you like to know?"
                    }
                    htmlFor="use_case"
                  >
                    <textarea
                      id="use_case"
                      value={useCase}
                      onChange={(e) => setUseCase(e.target.value)}
                      placeholder={
                        kind === "company"
                          ? "Tell us about the roles you're hiring for, current screening flow, and what's slow."
                          : "Tell us what you're curious about."
                      }
                      rows={4}
                      className="mt-1 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </Field>

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    disabled={busy}
                    className="w-full"
                  >
                    {busy ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      <>
                        Send <ArrowRight className="size-4" />
                      </>
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </MarketingShell>
  );
}

function Field({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium" htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-[var(--danger)]"> *</span> : null}
      </label>
      {children}
    </div>
  );
}
