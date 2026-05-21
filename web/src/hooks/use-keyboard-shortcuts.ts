"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/stores/ui-store";

function isTyping(t: EventTarget | null) {
  if (!t || !(t instanceof HTMLElement)) return false;
  return (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable
  );
}

/**
 * Two-key sequences (G→D, G→C, G→A, N→R) plus single-key shortcuts.
 */
export function useKeyboardShortcuts() {
  const router = useRouter();
  const setShortcutHelp = useUIStore((s) => s.setShortcutHelp);
  const lastKey = React.useRef<{ key: string; at: number } | null>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      const k = e.key.toLowerCase();

      // single-key
      if (e.key === "?") {
        e.preventDefault();
        setShortcutHelp(true);
        return;
      }

      // sequences
      const now = Date.now();
      const recent =
        lastKey.current && now - lastKey.current.at < 800
          ? lastKey.current.key
          : null;

      if (recent === "g") {
        lastKey.current = null;
        if (k === "d") return void router.push("/dashboard");
        if (k === "c") return void router.push("/candidates");
        if (k === "a") return void router.push("/analytics");
        if (k === "s") return void router.push("/settings");
      } else if (recent === "n") {
        lastKey.current = null;
        if (k === "r") return void router.push("/roles/new");
      }

      if (k === "g" || k === "n") {
        lastKey.current = { key: k, at: now };
      } else {
        lastKey.current = null;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, setShortcutHelp]);
}
