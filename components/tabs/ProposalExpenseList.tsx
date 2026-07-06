"use client";

import { FiCheckCircle, FiXCircle } from "react-icons/fi";
import { motion } from "motion/react";
import { getExpenseReason } from "@/components/tabs/proposalUtils";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUsdc } from "@/lib/tabs/money";
import type { ExpenseResponse, TabMemberResponse } from "@/lib/tabs/types";

type ProposalExpenseListProps = {
  expenses: ExpenseResponse[];
  membersById: Map<string, TabMemberResponse>;
  reducedMotion: boolean;
  title: "Included in settlement" | "Outside settlement";
};

export function ProposalExpenseList({
  expenses,
  membersById,
  reducedMotion,
  title,
}: ProposalExpenseListProps) {
  const included = title === "Included in settlement";
  const Icon = included ? FiCheckCircle : FiXCircle;

  return (
    <div className="grid gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon aria-hidden="true" className={included ? "text-primary-strong" : "text-neutral"} />
        {title}
      </h3>
      {expenses.length === 0 ? (
        <p className="rounded-md border border-outline-variant bg-surface-container-low px-4 py-3 text-sm leading-6 text-muted">
          {included
            ? "Confirmed expenses will appear here when your group is ready."
            : "Nothing is outside this proposal right now."}
        </p>
      ) : (
        <div className="divide-y divide-outline-variant rounded-md border border-outline-variant bg-surface-container-lowest">
          {expenses.map((expense) => (
            <motion.div
              key={expense.id}
              animate={{ opacity: 1, y: 0 }}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              initial={reducedMotion ? false : { opacity: 0, y: 5 }}
              transition={{ duration: reducedMotion ? 0 : 0.16 }}
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">
                  {expense.title}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  Paid by {membersById.get(expense.payerMemberId)?.displayName ?? "a member"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {formatUsdc(expense.amountBaseUnits)}
                </span>
                <StatusChip
                  tone={included ? "success" : expense.status === "disputed" ? "error" : "neutral"}
                >
                  {getExpenseReason(expense)}
                </StatusChip>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
