import * as React from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: { value: number; label: string };
  hint?: string;
  loading?: boolean;
  icon?: React.ReactNode;
}

export function StatCard({
  label,
  value,
  delta,
  hint,
  loading,
  icon,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5 pt-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
          {icon && (
            <span className="text-muted-foreground" aria-hidden>
              {icon}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          {loading ? (
            <Skeleton className="h-8 w-24" />
          ) : (
            <span className="text-2xl font-semibold tabular tracking-tight">
              {value}
            </span>
          )}
          {delta && !loading && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs tabular",
                delta.value >= 0
                  ? "text-[var(--success)]"
                  : "text-[var(--danger)]",
              )}
            >
              {delta.value >= 0 ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              )}
              {Math.abs(delta.value)}%
            </span>
          )}
        </div>
        {hint && (
          <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
