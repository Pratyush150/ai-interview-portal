"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  BarChart3,
  Settings,
  Plus,
  ChevronDown,
  Sparkles,
  ClipboardList,
  FileText,
  Code2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useRoles } from "@/lib/mock-api";
import type { Role } from "@/types";
import { useAuth } from "@/stores/auth-store";
import { BRAND_NAME } from "@/lib/brand";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // Predicate against the auth state — undefined means "always show".
  show?: (perms: {
    canViewAnalytics: boolean;
    canManageBilling: boolean;
    canManageRoles: boolean;
  }) => boolean;
  badge?: string;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/aptitude-bank", label: "Aptitude bank", icon: ClipboardList },
  { href: "/coding-bank", label: "Coding bank", icon: Code2 },
  {
    href: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    show: (p) => p.canViewAnalytics,
  },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: roles } = useRoles();
  const user = useAuth((s) => s.user);
  const perms = {
    canViewAnalytics: user?.canViewAnalytics ?? false,
    canManageBilling: user?.canManageBilling ?? false,
    canManageRoles: user?.canManageRoles ?? false,
  };
  const visibleNav = NAV.filter((n) => !n.show || n.show(perms));
  const [rolesOpen, setRolesOpen] = React.useState(true);
  const grouped = React.useMemo<Map<string, Role[]>>(() => {
    const m = new Map<string, Role[]>();
    if (!roles) return m;
    for (const r of roles) {
      const arr = m.get(r.family) ?? [];
      arr.push(r);
      m.set(r.family, arr);
    }
    return m;
  }, [roles]);

  return (
    <aside className="hidden md:flex w-[240px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex h-[60px] items-center gap-2 px-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--primary)] text-[var(--primary-foreground)]">
            <Sparkles className="size-3.5" strokeWidth={2.5} />
          </div>
          <span className="font-semibold tracking-tight">{BRAND_NAME}</span>
        </Link>
        <Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0">
          beta
        </Badge>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        <div className="space-y-0.5">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
                {item.badge && (
                  <Badge variant="primary" className="ml-auto">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={() => setRolesOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "size-3 transition-transform",
                !rolesOpen && "-rotate-90",
              )}
            />
            <span className="uppercase tracking-wider">Active roles</span>
            {perms.canManageRoles && (
              <Link
                href="/roles/new"
                className="ml-auto rounded p-1 hover:bg-accent"
                aria-label="Create role"
                onClick={(e) => e.stopPropagation()}
              >
                <Plus className="size-3" />
              </Link>
            )}
          </button>

          {rolesOpen && (
            <div className="mt-1 space-y-3">
              {Array.from(grouped.entries()).map(([family, list]) => (
                <div key={family}>
                  <div className="px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
                    {family}
                  </div>
                  <div className="space-y-0.5">
                    {list?.map((role) => (
                      <Link
                        key={role.id}
                        href={`/candidates?role=${role.id}`}
                        className="group flex items-center gap-2 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Briefcase className="size-3 opacity-60" />
                        <span className="truncate">{role.title}</span>
                        <span className="ml-auto tabular text-[10px] opacity-60 group-hover:opacity-100">
                          {role.applicants}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </nav>

      <div className="border-t border-border p-3">
        <div className="rounded-md border border-border bg-card px-3 py-2">
          <div className="text-xs font-medium">DemoCorp</div>
          <div className="text-[11px] text-muted-foreground tabular">
            142 / 250 interviews used
          </div>
          <div className="mt-1.5 h-1 w-full rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-[var(--primary)]"
              style={{ width: "56%" }}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
