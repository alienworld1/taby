import { FiArrowRight } from "react-icons/fi";
import { motion } from "motion/react";
import { formatUsdc } from "@/lib/tabs/money";
import type { SettlementTransfer } from "@/lib/tabs/settlement";
import type { TabMemberResponse } from "@/lib/tabs/types";

type SettlementTransferListProps = {
  membersById: Map<string, TabMemberResponse>;
  transfers: SettlementTransfer[];
};

export function SettlementTransferList({ membersById, transfers }: SettlementTransferListProps) {
  if (transfers.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold text-foreground">Final settlements</h3>
      <div className="divide-y divide-outline-variant rounded-md border border-outline-variant bg-surface-container-lowest">
        {transfers.map((transfer) => {
          const debtorName = membersById.get(transfer.fromMemberId)?.displayName ?? "Someone";
          const creditorName = membersById.get(transfer.toMemberId)?.displayName ?? "Someone";

          return (
            <motion.div
              key={transfer.id}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center"
              initial={{ opacity: 0, y: 6 }}
              layout
              animate={{ opacity: 1, y: 0 }}
            >
              <span className="min-w-0 break-words text-sm font-medium text-debtor">
                {debtorName} pays
              </span>
              <FiArrowRight
                aria-hidden="true"
                className="hidden text-muted sm:block"
              />
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
