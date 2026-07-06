"use client";

import { FiAlertCircle, FiCheckCircle, FiChevronRight, FiClock } from "react-icons/fi";
import { motion } from "motion/react";
import { ConfirmationProgress } from "@/components/tabs/ConfirmationProgress";
import type { ExpenseView } from "@/components/tabs/expenseTypes";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUsdc } from "@/lib/tabs/money";

type ExpenseCardProps = {
  expense: ExpenseView;
  onOpen: () => void;
};

export function ExpenseCard({ expense, onOpen }: ExpenseCardProps) {
  const status = expense.expense.status;
  const statusCopy =
    status === "confirmed"
      ? "Confirmed"
      : status === "disputed"
        ? "Excluded"
        : status === "pending"
          ? "Needs review"
          : status === "locked"
            ? "Locked"
            : "Read-only";
  const statusTone =
    status === "confirmed" ? "success" : status === "disputed" ? "error" : "neutral";
  const StatusIcon =
    status === "confirmed" ? FiCheckCircle : status === "disputed" ? FiAlertCircle : FiClock;

  return (
    <motion.button
      className="w-full rounded-md border border-outline-variant bg-surface-container-lowest p-4 text-left shadow-soft transition hover:border-outline focus-visible:outline-primary"
      initial={{ opacity: 0, y: 6 }}
      layout
      onClick={onOpen}
      type="button"
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-semibold text-foreground">
              {expense.expense.title}
            </h3>
            <StatusChip className="gap-1.5" tone={statusTone}>
              <StatusIcon aria-hidden="true" />
              {statusCopy}
            </StatusChip>
          </div>
          <p className="mt-1 text-sm leading-5 text-muted">
            Paid by {expense.payer?.displayName ?? "a member"}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:justify-end sm:text-right">
          <span className="font-semibold tabular-nums text-foreground">
            {formatUsdc(expense.expense.amountBaseUnits)}
          </span>
          <FiChevronRight aria-hidden="true" className="text-muted" />
        </div>
      </div>
      <div className="mt-3">
        <ConfirmationProgress expense={expense} />
      </div>
    </motion.button>
  );
}
