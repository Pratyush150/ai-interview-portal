"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "recruiter" | "hiring_manager" | "admin" | "candidate";

export interface AuthUser {
  name: string;
  email: string;
  role: Role;
  // Recruiter permissions — derived from role but exposed flat so views can
  // gate buttons without re-deriving.
  canManageRoles: boolean;
  canManageBilling: boolean;
  canViewAnalytics: boolean;
  // Populated when the user successfully authenticated against the real
  // backend (POST /api/company or /api/company/login). Null = mock-auth.
  // Authenticated calls (job creation, applications listing) attach the
  // token as `Authorization: Bearer <token>`.
  companyId?: string | null;
  // URL-safe workspace slug used for /c/{slug}/... routes.
  companySlug?: string | null;
  authToken?: string | null;
  // Populated when a CANDIDATE successfully authenticated against the real
  // backend (POST /api/candidate/{signup,login}). Same Bearer-token model;
  // separate identity model from companies.
  candidateId?: string | null;
  candidateToken?: string | null;
}

interface AuthExtras {
  companyId?: string | null;
  companySlug?: string | null;
  authToken?: string | null;
  candidateId?: string | null;
  candidateToken?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  hydrated: boolean;
  setUser: (u: AuthUser | null) => void;
  loginAs: (
    role: Role,
    name?: string,
    email?: string,
    extras?: AuthExtras,
  ) => void;
  logout: () => void;
  setHydrated: () => void;
}

function profileFor(
  role: Role,
  name: string,
  email: string,
  extras?: AuthExtras,
): AuthUser {
  return {
    name,
    email,
    role,
    canManageRoles: role === "recruiter" || role === "admin",
    canManageBilling: role === "admin",
    canViewAnalytics: role !== "candidate",
    companyId: extras?.companyId ?? null,
    companySlug: extras?.companySlug ?? null,
    authToken: extras?.authToken ?? null,
    candidateId: extras?.candidateId ?? null,
    candidateToken: extras?.candidateToken ?? null,
  };
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      setUser: (user) => set({ user }),
      loginAs: (role, name, email, extras) => {
        const defaults: Record<Role, { name: string; email: string }> = {
          recruiter: { name: "Naidu Krishore", email: "naidu@democorp.test" },
          hiring_manager: {
            name: "Sneha Bose",
            email: "sneha@democorp.test",
          },
          admin: { name: "Riya Mehta", email: "riya@democorp.test" },
          candidate: { name: "Priya Sharma", email: "priya@gmail.com" },
        };
        const d = defaults[role];
        set({
          user: profileFor(role, name ?? d.name, email ?? d.email, extras),
        });
      },
      logout: () => set({ user: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "apertureai-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** Roles allowed to access the recruiter dashboard (everything under (app)). */
export const RECRUITER_ROLES: Role[] = ["recruiter", "hiring_manager", "admin"];
