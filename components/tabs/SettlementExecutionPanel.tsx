"use client";

import { FiCheckCircle, FiRefreshCcw, FiRotateCcw, FiShield, FiZap } from "react-icons/fi";
import { motion } from "motion/react";
import { SettlementTransactionStatus } from "@/components/tabs/SettlementTransactionStatus";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SettlementBlocker } from "@/lib/tabs/types";

type ExecutionState =
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

type SettlementExecutionPanelProps = {
  blockers: SettlementBlocker[];
  errorMessage: string | null;
  reducedMotion: boolean;
  state: ExecutionState;
  transferCount: number;
  onRefreshStatus: () => void;
  onSettle: () => void;
};

export function SettlementExecutionPanel({
  blockers,
  errorMessage,
  reducedMotion,
  state,
  transferCount,
  onRefreshStatus,
  onSettle,
}: SettlementExecutionPanelProps) {
  const pending = ["preflighting", "opening_wallet", "submitting", "submitted", "confirming", "verifying"].includes(
    state,
  );
  const canRetry = state === "retryable_failed" || state === "unknown";
  const primaryCopy =
    state === "preflighting"
      ? "Checking final settlement"
      : state === "opening_wallet"
        ? "One final confirmation closes the whole tab."
        : state === "submitting"
          ? "Sending settlement"
          : state === "submitted"
            ? "Settlement sent"
            : state === "confirming" || state === "verifying"
              ? "Settling the Final Tab"
              : state === "settled"
                ? "Final Tab settled"
                : state === "retryable_failed"
                  ? "Settlement did not go through. Nothing moved."
                  : state === "terminal_failed"
                    ? "Create a fresh Final Tab before settling."
                    : `${transferCount} ${transferCount === 1 ? "transfer" : "transfers"} will close the whole tab`;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      aria-live="polite"
      className="grid gap-4 rounded-md border border-outline-variant bg-surface-container-low p-4"
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
          {state === "settled" ? <FiCheckCircle aria-hidden="true" /> : <FiShield aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">{primaryCopy}</h3>
            {state === "settled" ? <StatusChip tone="success">Verified</StatusChip> : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-muted">
            {state === "settled"
              ? "The agreed transfers are complete."
              : state === "confirming" || state === "verifying"
                ? "We are waiting for Arbitrum to confirm the transaction."
                : state === "opening_wallet"
                  ? "You will not need gas to continue."
                  : "Taby checks the final agreement before sending settlement."}
          </p>
        </div>
      </div>

      {pending || state === "settled" ? <SettlementTransactionStatus state={state} /> : null}

      {blockers.length > 0 ? (
        <div className="grid gap-2">
          {blockers.map((blocker) => (
            <div
              className="rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm leading-6 text-foreground"
              key={blocker.id}
            >
              {blocker.message}
            </div>
          ))}
        </div>
      ) : null}

      {errorMessage ? (
        <ErrorCallout
          action={
            <Button
              icon={<FiRefreshCcw aria-hidden="true" />}
              onClick={onRefreshStatus}
              variant="secondary"
            >
              Refresh status
            </Button>
          }
          message={errorMessage}
        />
      ) : null}

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        {state === "ready" || state === "idle" || canRetry ? (
          <Button
            className="w-full sm:w-auto"
            disabled={pending || blockers.length > 0}
            icon={canRetry ? <FiRotateCcw aria-hidden="true" /> : <FiZap aria-hidden="true" />}
            loading={pending}
            onClick={onSettle}
          >
            {canRetry ? "Try settlement again" : "Settle together"}
          </Button>
        ) : null}
        {state === "confirming" || state === "verifying" || state === "unknown" ? (
          <Button
            className="w-full sm:w-auto"
            icon={<FiRefreshCcw aria-hidden="true" />}
            loading={state === "verifying"}
            onClick={onRefreshStatus}
            variant="secondary"
          >
            Refresh status
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
