import { cn } from "@/lib/utils";
import type { CandidateStatus } from "@/types";

const STATUS_LABEL: Record<CandidateStatus, string> = {
  applied: "Applied",
  ai_screened: "AI Screened",
  shortlisted: "Shortlisted",
  human_round: "Human Round",
  offered: "Offered",
  hired: "Hired",
  rejected: "Rejected",
};

const STATUS_STYLE: Record<CandidateStatus, string> = {
  applied: "bg-secondary text-foreground",
  ai_screened:
    "bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] text-[var(--primary)]",
  shortlisted:
    "bg-[color-mix(in_oklab,var(--chart-5)_14%,transparent)] text-[var(--chart-5)]",
  human_round:
    "bg-[color-mix(in_oklab,var(--chart-6)_14%,transparent)] text-[var(--chart-6)]",
  offered:
    "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)] text-[var(--warning)]",
  hired:
    "bg-[color-mix(in_oklab,var(--success)_14%,transparent)] text-[var(--success)]",
  rejected:
    "bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-[var(--danger)]",
};

export function StatusPill({
  status,
  className,
}: {
  status: CandidateStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export { STATUS_LABEL };
