"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth, RECRUITER_ROLES } from "@/stores/auth-store";
import { BRAND_NAME, BRAND_YEAR } from "@/lib/brand";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

function MarketingNav() {
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);
  const isRecruiter = !!user && RECRUITER_ROLES.includes(user.role);
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
          <Link href="/features" className="hover:text-foreground">Features</Link>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/customers" className="hover:text-foreground">Customers</Link>
          <Link href="/contact" className="hover:text-foreground">Contact</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {!hydrated || !isRecruiter ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/login">Sign in</Link>
              </Button>
              <Button variant="primary" size="sm" asChild>
                <Link href="/contact">Talk to sales</Link>
              </Button>
            </>
          ) : (
            <Button variant="primary" size="sm" asChild>
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function MarketingFooter() {
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
          <Link href="/features" className="hover:text-foreground">Features</Link>
          <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
          <Link href="/customers" className="hover:text-foreground">Customers</Link>
          <Link href="/contact" className="hover:text-foreground">Contact</Link>
          <Link href="/legal/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/legal/terms" className="hover:text-foreground">Terms</Link>
          <span className="ml-auto opacity-60 tabular">© {BRAND_YEAR} {BRAND_NAME}</span>
        </div>
      </div>
    </footer>
  );
}
