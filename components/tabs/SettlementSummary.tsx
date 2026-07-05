"use client";

import { useMemo } from "react";
import { FiCheckCircle, FiDollarSign, FiRefreshCcw, FiRepeat } from "react-icons/fi";
import { motion } from "motion/react";
import { MemberBalanceList } from "@/components/tabs/MemberBalanceList";
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
  onRefresh: () => void;
};

export function SettlementSummary({ detail, onRefresh }: SettlementSummaryProps) {
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
          Settlement
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
          description="Confirmed expenses will appear here when your group is ready."
          icon={<FiRepeat aria-hidden="true" />}
          title="No settlement yet."
        />
      </section>
    );
  }

  const isEven = result.settlementCount === 0;

  return (
    <section aria-labelledby="settlement-heading" className="grid gap-4">
      <div>
        <h2 id="settlement-heading" className="text-xl font-semibold text-foreground">
          Settlement
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Confirmed expenses become the final settlement your group can review.
        </p>
      </div>

      <motion.div
        key={`${result.rawIouCount}:${result.settlementCount}:${result.totalMovingBaseUnits}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <Card className="grid gap-5">
          <div className="flex items-start gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong">
              {isEven ? (
                <FiCheckCircle aria-hidden="true" />
              ) : (
                <FiRepeat aria-hidden="true" />
              )}
            </div>
            <div className="min-w-0">
              <motion.p
                key={result.summaryText}
                className="text-2xl font-semibold leading-8 text-foreground"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {isEven ? "Everyone is even." : result.summaryText}
              </motion.p>
              <p className="mt-1 text-sm leading-6 text-muted">
                {isEven
                  ? "The confirmed expenses cancel out, so there is nothing to settle."
                  : `${result.eligibleExpenseIds.length} confirmed ${
                      result.eligibleExpenseIds.length === 1 ? "expense is" : "expenses are"
                    } included.`}
              </p>
            </div>
          </div>

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

          {result.excludedExpenseIds.length > 0 ? (
            <p className="text-sm leading-6 text-muted">
              {result.excludedExpenseIds.length}{" "}
              {result.excludedExpenseIds.length === 1 ? "expense is" : "expenses are"} still
              outside settlement.
            </p>
          ) : null}
        </Card>
      </motion.div>
    </section>
  );
}
