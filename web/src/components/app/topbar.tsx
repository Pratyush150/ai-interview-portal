"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  HelpCircle,
  Bell,
  LogOut,
  User as UserIcon,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./theme-toggle";
import { useUIStore } from "@/stores/ui-store";
import { useAuth, type Role } from "@/stores/auth-store";
import { initials } from "@/lib/format";
import { toast } from "sonner";

const ROLE_LABEL: Record<Role, string> = {
  recruiter: "Recruiter",
  hiring_manager: "Hiring manager",
  admin: "Admin",
  candidate: "Candidate",
};

export function Topbar({ breadcrumbs }: { breadcrumbs?: React.ReactNode }) {
  const router = useRouter();
  const togglePalette = useUIStore((s) => s.togglePalette);
  const setShortcutHelp = useUIStore((s) => s.setShortcutHelp);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const loginAs = useAuth((s) => s.loginAs);

  function handleLogout() {
    logout();
    toast.success("Signed out");
    router.push("/");
  }

  function switchRole(role: Role) {
    loginAs(role);
    toast.success(`Now signed in as ${ROLE_LABEL[role]}`);
    if (role === "candidate") {
      // Pass identity so the vanilla portal pre-fills the setup screen.
      const next = useAuth.getState().user;
      const qs = new URLSearchParams();
      if (next?.name) qs.set("name", next.name);
      if (next?.email) qs.set("email", next.email);
      window.location.href = `/candidate/?${qs.toString()}`;
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-sm md:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="hidden md:block">{breadcrumbs}</div>
      </div>

      <button
        type="button"
        onClick={togglePalette}
        className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent w-[280px] max-w-[40vw]"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search candidates, roles…</span>
        <kbd className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] tabular">
          ⌘K
        </kbd>
      </button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setShortcutHelp(true)}
        aria-label="Keyboard shortcuts"
      >
        <HelpCircle className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => toast("3 new notifications", { duration: 2000 })}
        aria-label="Notifications"
      >
        <Bell className="size-4" />
      </Button>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-md border border-transparent px-1.5 py-1 transition-colors hover:bg-accent">
            <Avatar className="h-7 w-7">
              <AvatarFallback>
                {user ? initials(user.name) : "?"}
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left md:block">
              <div className="text-xs font-medium leading-tight">
                {user?.name ?? "Guest"}
              </div>
              <div className="text-[10px] text-muted-foreground leading-tight">
                {user ? ROLE_LABEL[user.role] : "Not signed in"}
              </div>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[220px]">
          <DropdownMenuLabel>
            <div className="flex items-center justify-between gap-2">
              <span>{user?.name ?? "Guest"}</span>
              {user && (
                <Badge variant="outline" className="text-[10px]">
                  {ROLE_LABEL[user.role]}
                </Badge>
              )}
            </div>
            {user && (
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground tabular">
                {user.email}
              </div>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <UserIcon className="size-4" />
              Account & settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/candidate/" target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Open candidate portal
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>
            <span className="text-[10px] uppercase tracking-wider">
              Switch role (demo)
            </span>
          </DropdownMenuLabel>
          {(["recruiter", "hiring_manager", "admin", "candidate"] as Role[]).map(
            (r) => (
              <DropdownMenuItem
                key={r}
                onSelect={() => switchRole(r)}
                disabled={user?.role === r}
              >
                <RefreshCw className="size-4" />
                {ROLE_LABEL[r]}
                {user?.role === r && (
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    current
                  </span>
                )}
              </DropdownMenuItem>
            ),
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleLogout}>
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
