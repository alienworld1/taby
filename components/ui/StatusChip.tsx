import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type StatusChipTone = "neutral" | "pending" | "success" | "warning" | "error";

type StatusChipProps = {
  children: ReactNode;
  className?: string;
  tone?: StatusChipTone;
};

const toneClasses: Record<StatusChipTone, string> = {
  neutral: "bg-surface-container text-muted",
  pending: "bg-primary-soft text-primary-strong",
  success: "bg-primary-fixed text-primary-strong",
  warning: "bg-secondary-soft text-secondary",
  error: "bg-error-container text-on-error-container",
};

export function StatusChip({
  children,
  className,
  tone = "neutral",
}: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-3 text-sm font-semibold",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
