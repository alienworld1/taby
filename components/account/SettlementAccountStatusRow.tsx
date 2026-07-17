"use client";

import { FiAlertCircle, FiCheckCircle, FiClock, FiShield } from "react-icons/fi";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SettlementAccountReadiness } from "@/lib/account/types";

type SettlementAccountStatusRowProps = {
  readiness: SettlementAccountReadiness | null;
};

export function SettlementAccountStatusRow({ readiness }: SettlementAccountStatusRowProps) {
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
        <StatusChip tone={status.tone}>{status.chip}</StatusChip>
      </div>
    </div>
  );
}

function getStatus(readiness: SettlementAccountReadiness | null) {
  if (!readiness || readiness.delegationStatus === "not_initialized") {
    return {
      chip: "Preparing",
      helper: "This usually takes a moment.",
      icon: <FiClock aria-hidden="true" />,
      title: "Preparing settlement",
      tone: "pending" as const,
    };
  }

  if (readiness.delegationStatus === "ready") {
    return {
      chip: "Ready",
      helper: "This address needs USDC before a Final Tab can settle.",
      icon: <FiCheckCircle aria-hidden="true" />,
      title: "Settlement ready",
      tone: "success" as const,
    };
  }

  if (readiness.paymasterPolicyStatus === "rejected") {
    return {
      chip: "Retry needed",
      helper: "Settlement is not available right now. Try again in a moment.",
      icon: <FiAlertCircle aria-hidden="true" />,
      title: "Settlement paused",
      tone: "warning" as const,
    };
  }

  if (readiness.delegationStatus === "fallback_required") {
    return {
      chip: "Needs review",
      helper: "We updated your settlement account. Existing locked tabs need a fresh Final Tab before approval.",
      icon: <FiShield aria-hidden="true" />,
      title: "Settlement needs review",
      tone: "warning" as const,
    };
  }

  return {
    chip: "Try again",
    helper: "We could not prepare settlement. Try again before approving this Final Tab.",
    icon: <FiAlertCircle aria-hidden="true" />,
    title: "Settlement paused",
    tone: "error" as const,
  };
}
