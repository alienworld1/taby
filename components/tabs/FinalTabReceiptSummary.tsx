import { FiCheckCircle } from "react-icons/fi";
import { motion } from "motion/react";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUsdc } from "@/lib/tabs/money";
import type { FinalTabReceiptResponse } from "@/lib/tabs/types";

type FinalTabReceiptSummaryProps = {
  receipt: Extract<FinalTabReceiptResponse, { status: "confirmed" }>;
};

function formatReceiptDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function FinalTabReceiptSummary({ receipt }: FinalTabReceiptSummaryProps) {
  const excludedCopy =
    receipt.excludedExpenseCount === 1
      ? "1 disputed item outside settlement"
      : `${receipt.excludedExpenseCount} items outside settlement`;

  return (
    <motion.header
      animate={{ opacity: 1, y: 0 }}
      className="overflow-hidden rounded-md border border-primary-fixed bg-surface-container-lowest shadow-soft"
      initial={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.22 }}
    >
      <div className="border-b border-outline-variant bg-primary-soft/55 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full bg-primary text-on-primary">
            <FiCheckCircle aria-hidden="true" />
          </span>
          <StatusChip tone="success">Verified</StatusChip>
        </div>
        <h1 className="mt-4 text-3xl font-semibold leading-9 text-foreground">
          Final Tab settled
        </h1>
        <p className="mt-1 text-base text-muted">Everyone is looking at the same receipt.</p>
      </div>

      <div className="grid gap-5 p-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-muted">Tab</p>
          <p className="mt-1 break-words text-xl font-semibold leading-7 text-foreground">
            {receipt.tab.title}
          </p>
        </div>

        <div className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-low p-4">
          <p className="text-sm font-semibold text-muted">Total settled</p>
          <p className="text-3xl font-semibold leading-9 text-primary-strong">
            {formatUsdc(receipt.totalSettledBaseUnits)}
          </p>
          <p className="text-sm text-muted">{formatReceiptDate(receipt.settledAt)}</p>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-outline-variant bg-surface-container-low p-3">
            <dt className="text-sm text-muted">
              {receipt.includedExpenseCount} expenses included
            </dt>
            <dd className="mt-1 font-semibold text-foreground">
              {formatUsdc(receipt.includedExpenseTotalBaseUnits)}
            </dd>
          </div>
          <div className="rounded-md border border-outline-variant bg-surface-container-low p-3">
            <dt className="text-sm text-muted">{excludedCopy}</dt>
            <dd className="mt-1 font-semibold text-secondary">
              {receipt.excludedExpenseCount}
            </dd>
          </div>
          <div className="rounded-md border border-outline-variant bg-surface-container-low p-3">
            <dt className="text-sm text-muted">
              {receipt.transferCount} transfers closed the tab
            </dt>
            <dd className="mt-1 font-semibold text-foreground">
              {formatUsdc(receipt.totalSettledBaseUnits)}
            </dd>
          </div>
        </dl>
      </div>
    </motion.header>
  );
}
