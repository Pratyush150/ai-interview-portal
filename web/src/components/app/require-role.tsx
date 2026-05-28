"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useAuth, type Role } from "@/stores/auth-store";

interface Props {
  allow: Role[];
  redirectTo?: string;
  children: React.ReactNode;
}

/**
 * Client-side route gate. Renders a brief loading shell until the persisted
 * auth state has hydrated, then either renders children or redirects.
 *
 * Hydration matters: on first paint after a hard refresh, `user` is null even
 * if the user is logged in (because zustand/persist hasn't rehydrated yet).
 * We wait for `hydrated === true` before deciding to redirect, which prevents
 * a "you're logged in but I'm sending you back to /login" flicker.
 */
export function RequireRole({ allow, redirectTo = "/login", children }: Props) {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const hydrated = useAuth((s) => s.hydrated);

  React.useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace(redirectTo);
      return;
    }
    if (!allow.includes(user.role)) {
      // Wrong role: send candidates to the public job board (their entry point
      // for applications and interviews). Recruiters/HMs without access go to
      // the login screen. We deliberately do NOT redirect to /candidate/ here
      // — that path serves the legacy vanilla portal, which was leaking into
      // the recruiter dashboard when a candidate session hit it.
      if (user.role === "candidate") {
        router.replace("/jobs");
      } else {
        router.replace(redirectTo);
      }
    }
  }, [hydrated, user, allow, redirectTo, router]);

  if (!hydrated || !user || !allow.includes(user.role)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }
  return <>{children}</>;
}
