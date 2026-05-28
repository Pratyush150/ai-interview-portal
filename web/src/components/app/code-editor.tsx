"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

const Monaco = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
      Loading editor…
    </div>
  ),
});

const LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "go",
  "java",
  "c",
  "cpp",
  "rust",
  "sql",
] as const;

export type CodeLanguage = (typeof LANGUAGES)[number];

interface Props {
  value: string;
  onChange: (v: string) => void;
  language: CodeLanguage;
  onLanguageChange: (l: CodeLanguage) => void;
  onSubmit?: () => void;
  submitting?: boolean;
}

// Monaco's mode id for "C" is just "c" — Monaco supports it out of the box.
export function CodeEditor({
  value,
  onChange,
  language,
  onLanguageChange,
  onSubmit,
  submitting,
}: Props) {
  const { resolvedTheme } = useTheme();
  return (
    <div className="flex h-full flex-col rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <Select
          value={language}
          onValueChange={(v) => onLanguageChange(v as CodeLanguage)}
        >
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Pseudocode preferred · autocomplete off
          </div>
          {onSubmit && (
            <Button
              size="sm"
              variant="primary"
              onClick={onSubmit}
              disabled={submitting}
              loading={submitting}
              className="gap-1.5"
            >
              <Send className="size-3.5" />
              Submit
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden rounded-b-md">
        <Monaco
          height="100%"
          language={language}
          value={value}
          theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
          onChange={(v) => onChange(v ?? "")}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            renderLineHighlight: "line",
            // Anti-cheat: no autocomplete / no suggestions / no quick-fix
            quickSuggestions: false,
            suggest: { showWords: false, showSnippets: false },
            wordBasedSuggestions: "off",
            acceptSuggestionOnEnter: "off",
            tabCompletion: "off",
            parameterHints: { enabled: false },
            inlineSuggest: { enabled: false },
            codeLens: false,
            contextmenu: false,
          }}
        />
      </div>
    </div>
  );
}
