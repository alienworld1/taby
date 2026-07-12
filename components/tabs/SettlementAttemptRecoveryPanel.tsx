"use client";

import { FiRefreshCcw } from "react-icons/fi";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SettlementAttemptResponse } from "@/lib/tabs/types";

type SettlementAttemptRecoveryPanelProps = {
  attempt: SettlementAttemptResponse;
  errorMessage: string | null;
  loading: boolean;
  onRefresh: () => void;
};

function attemptCopy(attempt: SettlementAttemptResponse) {
  switch (attempt.status) {
    case "created":
      return {
        helper: "Open review to continue settlement.",
        status: "Ready",
        title: "Settlement is ready to continue.",
        tone: "pending" as const,
      };
    case "confirmed":
      return {
        helper: "The agreed transfers are complete.",
        status: "Verified",
        title: "Final Tab settled",
        tone: "success" as const,
      };
    case "reverted":
      return {
        helper: "Refresh status to check whether you can try again.",
        status: "Needs refresh",
        title: "Settlement did not go through. Nothing moved.",
        tone: "warning" as const,
      };
    case "unknown":
      return {
        helper: "Settlement is still confirming. Refresh status before trying again.",
        status: "Needs refresh",
        title: "We are still checking the result.",
        tone: "warning" as const,
      };
    default:
      return {
        helper: "Settlement is still confirming. Refresh status before trying again.",
        status: "Confirming",
        title: "Settling the Final Tab",
        tone: "pending" as const,
      };
  }
}

export function SettlementAttemptRecoveryPanel({
  attempt,
  errorMessage,
  loading,
  onRefresh,
}: SettlementAttemptRecoveryPanelProps) {
  const copy = attemptCopy(attempt);

  return (
    <div
      aria-live="polite"
      className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-low p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">{copy.title}</h3>
            <StatusChip tone={copy.tone}>{copy.status}</StatusChip>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted">{copy.helper}</p>
        </div>
        <Button
          className="w-full sm:w-auto"
          icon={<FiRefreshCcw aria-hidden="true" />}
          loading={loading}
          onClick={onRefresh}
          variant="secondary"
        >
          Refresh status
        </Button>
      </div>
      {errorMessage ? <ErrorCallout message={errorMessage} /> : null}
      {attempt.status === "confirmed" && attempt.txHash ? (
        <p className="break-all font-mono text-xs leading-5 text-muted">
          Transaction {attempt.txHash}
        </p>
      ) : null}
    </div>
  );
}
