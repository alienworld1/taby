import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ProposalSummaryMetricProps = {
  icon?: ReactNode;
  label: string;
  mono?: boolean;
  value: string;
};

export function ProposalSummaryMetric({
  icon,
  label,
  mono = false,
  value,
}: ProposalSummaryMetricProps) {
  return (
    <div className="min-w-0 rounded-md border border-outline-variant bg-surface-container-lowest px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-1 truncate text-sm font-semibold tabular-nums text-foreground",
          mono ? "font-mono text-xs" : null,
        )}
      >
        {value}
      </p>
    </div>
  );
}
