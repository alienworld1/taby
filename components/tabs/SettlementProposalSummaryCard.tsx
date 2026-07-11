"use client";

import { FiClock, FiDollarSign, FiFileText, FiLock, FiUnlock } from "react-icons/fi";
import { motion } from "motion/react";
import { ProposalSummaryMetric } from "@/components/tabs/ProposalSummaryMetric";
import { formatExpiry } from "@/components/tabs/proposalUtils";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUsdc } from "@/lib/tabs/money";
import type { SettlementProposalResponse } from "@/lib/tabs/types";

type SettlementProposalSummaryCardProps = {
  excludedCount: number;
  includedCount: number;
  nowMs: number | null;
  proposal: SettlementProposalResponse;
  reducedMotion: boolean;
};

export function SettlementProposalSummaryCard({
  excludedCount,
  includedCount,
  nowMs,
  proposal,
  reducedMotion,
}: SettlementProposalSummaryCardProps) {
  const expired = nowMs !== null && new Date(proposal.expiresAt).getTime() <= nowMs;
  const statusCopy = expired
    ? "Expired"
    : proposal.status === "locked"
      ? "Final Tab locked"
      : proposal.status === "open"
        ? "Ready to lock"
        : "Needs review";
  const StatusIcon = proposal.status === "locked" ? FiLock : FiUnlock;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-4"
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <StatusChip className="w-fit gap-1.5" tone={expired ? "warning" : "pending"}>
            <StatusIcon aria-hidden="true" />
            {statusCopy}
          </StatusChip>
          <div className="flex items-center gap-2 text-sm text-muted">
            <FiClock aria-hidden="true" />
            Expires {formatExpiry(proposal.expiresAt)}
          </div>
        </div>
        <div className="rounded-md border border-outline-variant bg-surface-container-low px-4 py-3 sm:text-right">
          <p className="flex items-center gap-2 text-sm text-muted sm:justify-end">
            <FiDollarSign aria-hidden="true" />
            Total moving
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
            {formatUsdc(proposal.totalAmountBaseUnits)}
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <ProposalSummaryMetric label="Transfers" value={proposal.transfers.length.toString()} />
        <ProposalSummaryMetric label="Included" value={includedCount.toString()} />
        <ProposalSummaryMetric label="Outside" value={excludedCount.toString()} />
        <ProposalSummaryMetric
          icon={<FiFileText aria-hidden="true" />}
          label="Readiness"
          value={proposal.status === "locked" ? "Review approval" : "Review"}
        />
      </div>
    </motion.div>
  );
}
