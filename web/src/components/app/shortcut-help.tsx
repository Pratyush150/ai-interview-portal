"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUIStore } from "@/stores/ui-store";

const SHORTCUTS: { keys: string[]; label: string; group: string }[] = [
  { keys: ["⌘", "K"], label: "Open command palette", group: "Navigation" },
  { keys: ["/"], label: "Focus search", group: "Navigation" },
  { keys: ["G", "D"], label: "Go to dashboard", group: "Navigation" },
  { keys: ["G", "C"], label: "Go to candidates", group: "Navigation" },
  { keys: ["G", "A"], label: "Go to analytics", group: "Navigation" },
  { keys: ["J"], label: "Next item in list", group: "Lists" },
  { keys: ["K"], label: "Previous item in list", group: "Lists" },
  { keys: ["E"], label: "Export current view", group: "Lists" },
  { keys: ["Enter"], label: "Open selected item", group: "Lists" },
  { keys: ["?"], label: "Show this help", group: "General" },
  { keys: ["Esc"], label: "Close dialog / palette", group: "General" },
];

export function ShortcutHelp() {
  const open = useUIStore((s) => s.shortcutHelpOpen);
  const setOpen = useUIStore((s) => s.setShortcutHelp);

  const groups = SHORTCUTS.reduce<Record<string, typeof SHORTCUTS>>(
    (acc, s) => {
      (acc[s.group] = acc[s.group] ?? []).push(s);
      return acc;
    },
    {},
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <kbd className="rounded border border-border px-1 tabular">?</kbd>{" "}
            anywhere to open this list.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group}
              </div>
              <div className="space-y-1">
                {items.map((s) => (
                  <div
                    key={s.label}
                    className="flex items-center justify-between rounded-md px-1 py-1 text-sm"
                  >
                    <span className="text-foreground">{s.label}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="min-w-[24px] rounded border border-border bg-card px-1.5 py-0.5 text-center text-[10px] tabular text-muted-foreground"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
