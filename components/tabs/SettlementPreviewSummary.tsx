"use client";

import { FiShield } from "react-icons/fi";
import { motion } from "motion/react";
import { formatUsdc } from "@/lib/tabs/money";
import type { SettlementPreviewSnapshot } from "@/lib/tabs/types";
import { formatPreviewDate, getOutcomeCopy } from "./settlementPreviewUtils";

type SettlementPreviewSummaryProps = {
  reducedMotion: boolean;
  snapshot: SettlementPreviewSnapshot;
};

export function SettlementPreviewSummary({
  reducedMotion,
  snapshot,
}: SettlementPreviewSummaryProps) {
  const outcome = getOutcomeCopy(snapshot.currentMemberOutcome);
  const expiry = formatPreviewDate(snapshot.currentMemberOutcome.expiresAt);

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-4"
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
    >
      <div className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-low p-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted">{outcome.label}</p>
          <p className={`mt-1 break-words text-2xl font-semibold ${outcome.toneClassName}`}>
            {outcome.amount}
          </p>
          {snapshot.currentMemberOutcome.capBaseUnits ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm leading-6 text-muted">
              <FiShield aria-hidden="true" className="text-primary" />
              <span>Cap {formatUsdc(snapshot.currentMemberOutcome.capBaseUnits)}</span>
              {expiry ? <span>Expires {expiry}</span> : null}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 sm:text-right">
          <p className="text-sm font-semibold text-muted">Total moving</p>
          <p className="mt-1 break-words text-2xl font-semibold text-foreground">
            {formatUsdc(snapshot.totalAmountBaseUnits)}
          </p>
          <p className="mt-3 text-sm leading-6 text-muted">
            {snapshot.includedExpenseCount} included - {snapshot.excludedExpenseCount} outside
          </p>
        </div>
      </div>
    </motion.div>
  );
}
