"use client";

import { useMemo } from "react";
import { FiDollarSign, FiRefreshCcw, FiRepeat } from "react-icons/fi";
import { motion } from "motion/react";
import { MemberBalanceList } from "@/components/tabs/MemberBalanceList";
import { SettlementGraphSection } from "@/components/tabs/SettlementGraphSection";
import { SettlementTransferList } from "@/components/tabs/SettlementTransferList";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { formatUsdc } from "@/lib/tabs/money";
import {
  calculateSettlement,
  createSettlementInputsFromTabDetail,
} from "@/lib/tabs/settlement";
import type { TabDetailResponse } from "@/lib/tabs/types";

type SettlementSummaryProps = {
  detail: TabDetailResponse;
  settlementPreviewActive?: boolean;
  onRefresh: () => void;
};

export function SettlementSummary({
  detail,
  settlementPreviewActive = false,
  onRefresh,
}: SettlementSummaryProps) {
  const settlement = useMemo(
    () =>
      calculateSettlement(
        createSettlementInputsFromTabDetail({
          expenses: detail.expenses,
          members: detail.members,
          splits: detail.splits,
          tokenAddress: detail.tab.tokenAddress,
        }),
      ),
    [detail.expenses, detail.members, detail.splits, detail.tab.tokenAddress],
  );
  const membersById = useMemo(
    () => new Map(detail.members.map((member) => [member.id, member])),
    [detail.members],
  );

  if (!settlement.ok) {
    return (
      <section aria-labelledby="settlement-heading" className="grid gap-4">
        <h2 id="settlement-heading" className="text-xl font-semibold text-foreground">
          Final Tab evidence
        </h2>
        <ErrorCallout
          action={
            <Button icon={<FiRefreshCcw aria-hidden="true" />} onClick={onRefresh}>
              Refresh
            </Button>
          }
          message="Refresh the tab. If this keeps happening, one expense may need to be reviewed again."
          title="We could not calculate settlement from this tab yet."
        />
      </section>
    );
  }

  const result = settlement.result;

  if (result.eligibleExpenseIds.length === 0) {
    return (
      <section aria-labelledby="settlement-heading" className="grid gap-4">
        <h2 id="settlement-heading" className="text-xl font-semibold text-foreground">
          Settlement
        </h2>
        <EmptyState
          description="Only agreed expenses will be included. Anything pending or disputed stays outside."
          icon={<FiRepeat aria-hidden="true" />}
          title="No Final Tab yet."
        />
      </section>
    );
  }

  const isEven = result.settlementCount === 0;
  const graphKey = [
    result.rawIouCount,
    result.settlementCount,
    result.totalMovingBaseUnits,
    result.eligibleExpenseIds.join(","),
    result.excludedExpenseIds.join(","),
  ].join(":");

  return (
    <section aria-labelledby="settlement-heading" className="grid gap-4">
      <div>
        <h2 id="settlement-heading" className="text-xl font-semibold text-foreground">
          Final Tab evidence
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Accepted expenses created these obligations. The Final Tab above is the group’s agreement.
        </p>
      </div>

      <motion.div
        key={graphKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <Card className="grid gap-5">
          <SettlementGraphSection
            key={graphKey}
            detail={detail}
            settlementPreviewActive={settlementPreviewActive}
            settlement={result}
          />

          {!isEven ? (
            <div className="flex flex-col gap-2 rounded-md border border-outline-variant bg-surface-container-low px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-muted">
                <FiDollarSign aria-hidden="true" />
                Total that would move
              </span>
              <span className="text-base font-semibold text-foreground">
                {formatUsdc(result.totalMovingBaseUnits)}
              </span>
            </div>
          ) : null}

          <SettlementTransferList membersById={membersById} transfers={result.transfers} />
          <MemberBalanceList balances={result.balances} />
        </Card>
      </motion.div>
    </section>
  );
}
