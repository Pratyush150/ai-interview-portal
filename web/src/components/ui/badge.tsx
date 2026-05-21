import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border bg-transparent text-foreground",
        success:
          "border-[color-mix(in_oklab,var(--success)_30%,transparent)] bg-[color-mix(in_oklab,var(--success)_12%,transparent)] text-[var(--success)]",
        warning:
          "border-[color-mix(in_oklab,var(--warning)_30%,transparent)] bg-[color-mix(in_oklab,var(--warning)_12%,transparent)] text-[var(--warning)]",
        danger:
          "border-[color-mix(in_oklab,var(--danger)_30%,transparent)] bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] text-[var(--danger)]",
        primary:
          "border-[color-mix(in_oklab,var(--primary)_30%,transparent)] bg-[color-mix(in_oklab,var(--primary)_12%,transparent)] text-[var(--primary)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
