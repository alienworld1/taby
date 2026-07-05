"use client";

import { FiAlertCircle } from "react-icons/fi";
import { motion } from "motion/react";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUsdc } from "@/lib/tabs/money";
import type { ExcludedExpenseSummaryItem } from "@/lib/tabs/settlementGraph";

type ExcludedExpensesSummaryProps = {
  expenses: ExcludedExpenseSummaryItem[];
  reducedMotion: boolean;
};

export function ExcludedExpensesSummary({
  expenses,
  reducedMotion,
}: ExcludedExpensesSummaryProps) {
  if (expenses.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FiAlertCircle aria-hidden="true" className="text-neutral" />
          Outside settlement
        </h3>
        <p className="mt-1 text-sm leading-6 text-muted">
          {expenses.length} {expenses.length === 1 ? "expense is" : "expenses are"} still
          waiting, disputed, or excluded.
        </p>
      </div>
      <div className="divide-y divide-outline-variant rounded-md border border-outline-variant bg-surface-container-low">
        {expenses.map((expense) => (
          <motion.div
            key={expense.id}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            initial={reducedMotion ? false : { opacity: 0, y: 6 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-foreground">{expense.title}</p>
              <p className="mt-0.5 text-sm text-muted">{formatUsdc(expense.amountBaseUnits)}</p>
            </div>
            <StatusChip tone={getStatusTone(expense.status)}>
              {getStatusLabel(expense.status)}
            </StatusChip>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function getStatusLabel(status: ExcludedExpenseSummaryItem["status"]) {
  if (status === "pending") {
    return "Waiting";
  }

  if (status === "disputed") {
    return "Disputed";
  }

  if (status === "excluded") {
    return "Excluded";
  }

  return "Outside";
}

function getStatusTone(status: ExcludedExpenseSummaryItem["status"]) {
  if (status === "disputed") {
    return "error";
  }

  if (status === "excluded") {
    return "neutral";
  }

  return "pending";
}
