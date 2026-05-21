import * as React from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  illustration?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/**
 * Use this for any zero-data view. The illustration prop accepts inline SVG
 * (undraw-style) — never an emoji.
 */
export function EmptyState({
  illustration,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center px-6 py-12",
        className,
      )}
    >
      {illustration && (
        <div className="mb-5 text-muted-foreground" aria-hidden>
          {illustration}
        </div>
      )}
      <div className="text-sm font-semibold">{title}</div>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Generic line-art illustration. Plain stroke, no gradients.
 */
export function CandidatesEmptyIllustration() {
  return (
    <svg
      width="120"
      height="92"
      viewBox="0 0 120 92"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="14" width="108" height="68" rx="4" opacity="0.25" />
      <circle cx="30" cy="36" r="7" />
      <path d="M18 60c2.5-7 7.5-10 12-10s9.5 3 12 10" />
      <path d="M58 30h44" opacity="0.5" />
      <path d="M58 40h32" opacity="0.4" />
      <path d="M58 56h44" opacity="0.5" />
      <path d="M58 66h28" opacity="0.4" />
    </svg>
  );
}

export function SearchEmptyIllustration() {
  return (
    <svg
      width="100"
      height="100"
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="42" cy="42" r="22" />
      <path d="M58 58l16 16" />
      <path d="M34 42h16M42 34v16" opacity="0.4" />
    </svg>
  );
}
