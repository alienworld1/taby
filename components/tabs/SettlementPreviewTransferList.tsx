"use client";

import { FiArrowRight } from "react-icons/fi";
import { motion } from "motion/react";
import { formatUsdc } from "@/lib/tabs/money";
import type { SettlementPreviewSnapshot, TabMemberResponse } from "@/lib/tabs/types";

type SettlementPreviewTransferListProps = {
  membersById: Map<string, TabMemberResponse>;
  reducedMotion: boolean;
  snapshot: SettlementPreviewSnapshot;
};

export function SettlementPreviewTransferList({
  membersById,
  reducedMotion,
  snapshot,
}: SettlementPreviewTransferListProps) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold text-foreground">Final transfers</h3>
      <div className="divide-y divide-outline-variant rounded-md border border-outline-variant bg-surface-container-lowest">
        {snapshot.transfers.map((transfer) => {
          const debtorName = membersById.get(transfer.fromMemberId)?.displayName ?? "Someone";
          const creditorName = membersById.get(transfer.toMemberId)?.displayName ?? "Someone";

          return (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center"
              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
              key={transfer.id}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}
            >
              <span className="min-w-0 break-words text-sm font-medium text-debtor">
                {debtorName} pays
              </span>
              <FiArrowRight aria-hidden="true" className="hidden text-muted sm:block" />
              <span className="min-w-0 break-words text-sm font-medium text-creditor">
                {creditorName}
              </span>
              <span className="text-sm font-semibold text-foreground sm:text-right">
                {formatUsdc(transfer.amountBaseUnits)}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
