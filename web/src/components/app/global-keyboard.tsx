"use client";

import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export function GlobalKeyboard() {
  useKeyboardShortcuts();
  return null;
}
