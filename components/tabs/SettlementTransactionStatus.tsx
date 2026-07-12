"use client";

import { FiCheckCircle, FiCircle, FiLoader } from "react-icons/fi";
import { cn } from "@/lib/cn";

type SettlementTransactionStatusProps = {
  state:
    | "idle"
    | "preflighting"
    | "ready"
    | "opening_wallet"
    | "submitting"
    | "submitted"
    | "confirming"
    | "verifying"
    | "settled"
    | "retryable_failed"
    | "terminal_failed"
    | "unknown";
  reducedMotion?: boolean;
};

const steps = ["Sent", "Confirmed", "Verified"] as const;

export function SettlementTransactionStatus({
  state,
  reducedMotion = false,
}: SettlementTransactionStatusProps) {
  const activeIndex =
    state === "settled"
      ? 3
      : state === "verifying"
        ? 2
        : state === "confirming" || state === "submitted"
          ? 1
          : 0;
  const pending = ["opening_wallet", "submitting", "submitted", "confirming", "verifying"].includes(
    state,
  );

  return (
    <div className="grid gap-2" aria-label="Settlement progress">
      <div className="grid grid-cols-3 gap-2">
        {steps.map((step, index) => {
          const complete = index < activeIndex;
          const current = pending && index === activeIndex;

          return (
            <div
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm",
                complete
                  ? "border-primary bg-primary-fixed text-primary-strong"
                  : current
                    ? "border-outline bg-surface-container-low text-foreground"
                    : "border-outline-variant bg-surface-container-lowest text-muted",
              )}
              key={step}
            >
              {complete ? (
                <FiCheckCircle aria-hidden="true" className="shrink-0" />
              ) : current ? (
                <FiLoader
                  aria-hidden="true"
                  className={cn("shrink-0", !reducedMotion && "animate-spin")}
                />
              ) : (
                <FiCircle aria-hidden="true" className="shrink-0" />
              )}
              <span className="min-w-0 truncate">{step}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
