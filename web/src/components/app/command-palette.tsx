"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  BarChart3,
  Settings,
  PlayCircle,
  Plus,
  ArrowRight,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useCandidates, useRoles } from "@/lib/mock-api";

export function CommandPalette() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPalette);
  const router = useRouter();
  const { data: candidates } = useCandidates();
  const { data: roles } = useRoles();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/dashboard")}>
            <LayoutDashboard className="size-4" /> Dashboard
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/candidates")}>
            <Users className="size-4" /> Candidates
            <CommandShortcut>G C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/analytics")}>
            <BarChart3 className="size-4" /> Analytics
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <Settings className="size-4" /> Settings
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => go("/roles/new")}>
            <Plus className="size-4" /> New role
            <CommandShortcut>N R</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/interview")}>
            <PlayCircle className="size-4" /> Open live interview demo
          </CommandItem>
        </CommandGroup>

        {candidates && candidates.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Candidates">
              {candidates.slice(0, 6).map((c) => (
                <CommandItem
                  key={c.id}
                  onSelect={() => go(`/candidates/${c.id}`)}
                  value={`candidate ${c.name} ${c.email}`}
                >
                  <ArrowRight className="size-3.5 opacity-50" />
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground tabular">
                    · {c.overallScore.toFixed(1)}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {roles && roles.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Roles">
              {roles.slice(0, 6).map((r) => (
                <CommandItem
                  key={r.id}
                  onSelect={() => go(`/candidates?role=${r.id}`)}
                  value={`role ${r.title} ${r.family}`}
                >
                  <Briefcase className="size-3.5 opacity-50" />
                  <span>{r.title}</span>
                  <span className="text-xs text-muted-foreground">
                    · {r.family}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function isTypingTarget(t: EventTarget | null) {
  if (!t || !(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    t.isContentEditable
  );
}
