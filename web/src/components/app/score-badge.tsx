import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number; // 0-10
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

function bandFor(score: number) {
  if (score >= 8) return "high";
  if (score >= 6) return "mid";
  if (score >= 4) return "low";
  return "weak";
}

const STYLES: Record<string, string> = {
  high: "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)] border-[color-mix(in_oklab,var(--success)_30%,transparent)]",
  mid: "bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] text-[var(--primary)] border-[color-mix(in_oklab,var(--primary)_30%,transparent)]",
  low: "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] text-[var(--warning)] border-[color-mix(in_oklab,var(--warning)_30%,transparent)]",
  weak: "bg-[color-mix(in_oklab,var(--danger)_14%,transparent)] text-[var(--danger)] border-[color-mix(in_oklab,var(--danger)_30%,transparent)]",
};

export function ScoreBadge({
  score,
  size = "md",
  showLabel = false,
  className,
}: ScoreBadgeProps) {
  const band = bandFor(score);
  const sizes = {
    sm: "h-5 px-1.5 text-[10px]",
    md: "h-6 px-2 text-xs",
    lg: "h-7 px-2.5 text-sm",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border tabular font-medium",
        STYLES[band],
        sizes[size],
        className,
      )}
    >
      {score.toFixed(1)}
      {showLabel && (
        <span className="text-muted-foreground/80 font-normal capitalize">
          · {band}
        </span>
      )}
    </span>
  );
}
