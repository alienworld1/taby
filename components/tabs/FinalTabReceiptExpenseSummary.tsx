import { FiCheck, FiMinusCircle } from "react-icons/fi";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUsdc } from "@/lib/tabs/money";
import type { FinalTabReceiptResponse } from "@/lib/tabs/types";

type FinalTabReceiptExpenseSummaryProps = {
  receipt: Extract<FinalTabReceiptResponse, { status: "confirmed" }>;
};

export function FinalTabReceiptExpenseSummary({
  receipt,
}: FinalTabReceiptExpenseSummaryProps) {
  return (
    <section className="grid gap-4 rounded-md border border-outline-variant bg-surface-container-lowest p-5 shadow-soft">
      <div>
        <h2 className="text-xl font-semibold leading-7 text-foreground">What counted</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          The receipt follows the locked Final Tab, including what stayed outside.
        </p>
      </div>

      <div className="grid gap-3">
        {receipt.includedExpenses.map((expense) => (
          <div
            className="grid gap-2 rounded-md border border-outline-variant bg-surface-container-low p-3 sm:grid-cols-[1fr_auto] sm:items-center"
            key={expense.id}
          >
            <div className="flex min-w-0 items-start gap-2">
              <FiCheck aria-hidden="true" className="mt-1 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="break-words font-semibold text-foreground">{expense.title}</p>
                <p className="text-sm text-muted">Included in settlement</p>
              </div>
            </div>
            <p className="font-semibold text-foreground sm:text-right">
              {formatUsdc(expense.amountBaseUnits)}
            </p>
          </div>
        ))}
      </div>

      {receipt.excludedExpenses.length > 0 ? (
        <div className="grid gap-3 border-t border-outline-variant pt-4">
          {receipt.excludedExpenses.map((expense) => (
            <div
              className="grid gap-2 rounded-md border border-secondary-soft bg-secondary-soft/45 p-3 sm:grid-cols-[1fr_auto] sm:items-center"
              key={expense.id}
            >
              <div className="flex min-w-0 items-start gap-2">
                <FiMinusCircle aria-hidden="true" className="mt-1 shrink-0 text-secondary" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words font-semibold text-foreground">{expense.title}</p>
                    <StatusChip tone="warning">Outside settlement</StatusChip>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    {expense.note ?? "Disputed item kept outside settlement"}
                  </p>
                </div>
              </div>
              {expense.amountBaseUnits !== "0" ? (
                <p className="font-semibold text-foreground sm:text-right">
                  {formatUsdc(expense.amountBaseUnits)}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
