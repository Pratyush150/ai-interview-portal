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
      // Wrong role → either send candidates to their portal, or back to login.
      if (user.role === "candidate") {
        const qs = new URLSearchParams();
        qs.set("name", user.name);
        if (user.email) qs.set("email", user.email);
        window.location.href = `/candidate/?${qs.toString()}`;
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
