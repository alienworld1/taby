"use client";

import { FiCheckCircle, FiRefreshCcw, FiShield, FiXCircle } from "react-icons/fi";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { SettlementPreviewThresholdResult } from "@/lib/tabs/types";
import { getThresholdCopy } from "./settlementPreviewUtils";

type SettlementPreviewActionPanelProps = {
  countdownStatus: "idle" | "running" | "cancelled" | "invalidated" | "complete";
  finalChecking: boolean;
  readyToSettle: boolean;
  reducedMotion: boolean;
  thresholdResult: SettlementPreviewThresholdResult | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SettlementPreviewActionPanel({
  countdownStatus,
  finalChecking,
  readyToSettle,
  reducedMotion,
  thresholdResult,
  onCancel,
  onConfirm,
}: SettlementPreviewActionPanelProps) {
  const thresholdCopy = getThresholdCopy(thresholdResult);

  if (countdownStatus === "running") {
    return (
      <Button
        className="w-full sm:w-auto"
        icon={<FiXCircle aria-hidden="true" />}
        onClick={onCancel}
        variant="danger"
      >
        Cancel settlement
      </Button>
    );
  }

  if (countdownStatus === "cancelled") {
    return (
      <div
        aria-live="polite"
        className="rounded-md border border-secondary-soft bg-secondary-soft/40 p-4 text-secondary"
      >
        <div className="flex items-center gap-2 font-semibold">
          <FiXCircle aria-hidden="true" />
          Settlement cancelled. Nothing moved.
        </div>
      </div>
    );
  }

  if (countdownStatus !== "complete") {
    return null;
  }

  if (!readyToSettle && !thresholdResult?.requiresExplicitConfirmation) {
    return (
      <Button
        className="w-full sm:w-auto"
        icon={<FiRefreshCcw aria-hidden="true" />}
        loading={finalChecking}
        variant="secondary"
      >
        Getting settlement ready
      </Button>
    );
  }

  if (thresholdResult?.requiresExplicitConfirmation && !readyToSettle) {
    return (
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-4 rounded-md border border-outline-variant bg-surface-container-low p-4"
        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
        transition={{ duration: reducedMotion ? 0 : 0.18 }}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-soft text-secondary">
            <FiShield aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">Confirm this settlement</h3>
            <p className="mt-1 text-sm leading-6 text-muted">
              This settlement is above the quick-settle limit, so review it once more before continuing.
            </p>
            {thresholdCopy ? (
              <p className="mt-2 text-sm font-semibold text-secondary">{thresholdCopy}</p>
            ) : null}
          </div>
        </div>
        <Button
          className="w-full sm:w-auto"
          icon={<FiCheckCircle aria-hidden="true" />}
          loading={finalChecking}
          onClick={onConfirm}
        >
          {finalChecking ? "Getting settlement ready" : "Confirm settlement"}
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      aria-live="polite"
      className="rounded-md border border-primary-fixed bg-primary-fixed/70 p-4 text-primary-strong"
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <FiCheckCircle aria-hidden="true" />
        <h3 className="font-semibold">Ready to settle</h3>
        <StatusChip tone="success">Preview passed</StatusChip>
      </div>
      <p className="mt-2 text-sm leading-6">
        The preview passed. Settlement execution is handled in the next step.
      </p>
      {finalChecking ? (
        <Button
          className="mt-4"
          icon={<FiRefreshCcw aria-hidden="true" />}
          loading
          variant="secondary"
        >
          Getting settlement ready
        </Button>
      ) : null}
    </motion.div>
  );
}
