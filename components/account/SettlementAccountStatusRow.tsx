"use client";

import { FiAlertCircle, FiCheckCircle, FiClock, FiRefreshCw, FiShield } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SettlementAccountReadiness } from "@/lib/account/types";

type SettlementAccountStatusRowProps = {
  readiness: SettlementAccountReadiness | null;
  onRetry?: () => void;
};

export function SettlementAccountStatusRow({ readiness, onRetry }: SettlementAccountStatusRowProps) {
  const status = getStatus(readiness);

  return (
    <div
      aria-live="polite"
      className="mt-4 grid gap-3 rounded-md border border-outline-variant bg-surface-container-lowest p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong">
            {status.icon}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{status.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted">{status.helper}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusChip tone={status.tone}>{status.chip}</StatusChip>
          {status.retry && onRetry ? (
            <Button icon={<FiRefreshCw aria-hidden="true" />} onClick={onRetry} size="sm" variant="secondary">
              Try again
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getStatus(readiness: SettlementAccountReadiness | null) {
  if (!readiness || readiness.delegationStatus === "not_initialized") {
    return {
      chip: "Preparing",
      helper: "This usually takes a moment. You will not need gas to continue.",
      icon: <FiClock aria-hidden="true" />,
      title: "Preparing secure settlement",
      tone: "pending" as const,
      retry: false,
    };
  }

  if (readiness.delegationStatus === "ready") {
    return {
      chip: "Ready",
      helper: "This address needs USDC before a Final Tab can settle.",
      icon: <FiCheckCircle aria-hidden="true" />,
      title: "Secure settlement ready",
      tone: "success" as const,
      retry: false,
    };
  }

  if (readiness.paymasterPolicyStatus === "rejected") {
    return {
      chip: "Retry needed",
      helper: "Settlement is not available right now. Try again in a moment.",
      icon: <FiAlertCircle aria-hidden="true" />,
      title: "Settlement paused",
      tone: "warning" as const,
      retry: true,
    };
  }

  if (readiness.delegationStatus === "fallback_required") {
    return {
      chip: "Needs review",
      helper: "We updated your settlement account. Existing locked tabs need a fresh Final Tab before approval.",
      icon: <FiShield aria-hidden="true" />,
      title: "Settlement needs review",
      tone: "warning" as const,
      retry: true,
    };
  }

  return {
    chip: "Try again",
    helper: "We could not prepare settlement. Try again before approving this Final Tab.",
    icon: <FiAlertCircle aria-hidden="true" />,
    title: "Settlement paused",
    tone: "error" as const,
    retry: true,
  };
}
