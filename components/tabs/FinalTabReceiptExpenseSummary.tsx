import { FiCheck, FiMinusCircle } from "react-icons/fi";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUsdc } from "@/lib/tabs/money";
import type { FinalTabReceiptResponse } from "@/lib/tabs/types";

const RECEIPT_ROW_PREVIEW_LIMIT = 20;

type FinalTabReceiptExpenseSummaryProps = {
  receipt: Extract<FinalTabReceiptResponse, { status: "confirmed" }>;
};

export function FinalTabReceiptExpenseSummary({
  receipt,
}: FinalTabReceiptExpenseSummaryProps) {
  const visibleIncludedExpenses = receipt.includedExpenses.slice(0, RECEIPT_ROW_PREVIEW_LIMIT);
  const hiddenIncludedExpenses = receipt.includedExpenses.slice(RECEIPT_ROW_PREVIEW_LIMIT);
  const visibleExcludedExpenses = receipt.excludedExpenses.slice(0, RECEIPT_ROW_PREVIEW_LIMIT);
  const hiddenExcludedExpenses = receipt.excludedExpenses.slice(RECEIPT_ROW_PREVIEW_LIMIT);

  return (
    <section className="grid gap-4 rounded-md border border-outline-variant bg-surface-container-lowest p-5 shadow-soft">
      <div>
        <h2 className="text-xl font-semibold leading-7 text-foreground">What counted</h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          The receipt follows the locked Final Tab, including what stayed outside.
        </p>
      </div>

      <div className="grid gap-3">
        {visibleIncludedExpenses.map((expense) => (
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
            {expense.amountBaseUnits ? (
              <p className="font-semibold text-foreground sm:text-right">
                {formatUsdc(expense.amountBaseUnits)}
              </p>
            ) : null}
          </div>
        ))}
        {hiddenIncludedExpenses.length > 0 ? (
          <details className="rounded-md border border-outline-variant bg-surface-container-low p-3">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">
              Show {hiddenIncludedExpenses.length} more included expenses
            </summary>
            <div className="mt-3 grid gap-2">
              {hiddenIncludedExpenses.map((expense) => (
                <div
                  className="grid gap-2 rounded-md border border-outline-variant bg-surface-container-lowest p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                  key={expense.id}
                >
                  <p className="break-words font-semibold text-foreground">{expense.title}</p>
                  {expense.amountBaseUnits ? (
                    <p className="font-semibold text-foreground sm:text-right">
                      {formatUsdc(expense.amountBaseUnits)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>

      {receipt.excludedExpenses.length > 0 ? (
        <div className="grid gap-3 border-t border-outline-variant pt-4">
          {visibleExcludedExpenses.map((expense) => (
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
              {expense.amountBaseUnits ? (
                <p className="font-semibold text-foreground sm:text-right">
                  {formatUsdc(expense.amountBaseUnits)}
                </p>
              ) : null}
            </div>
          ))}
          {hiddenExcludedExpenses.length > 0 ? (
            <details className="rounded-md border border-secondary-soft bg-secondary-soft/45 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Show {hiddenExcludedExpenses.length} more items outside settlement
              </summary>
              <div className="mt-3 grid gap-2">
                {hiddenExcludedExpenses.map((expense) => (
                  <div
                    className="rounded-md border border-secondary-soft bg-surface-container-lowest p-3"
                    key={expense.id}
                  >
                    <p className="break-words font-semibold text-foreground">{expense.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {expense.note ?? "Disputed item kept outside settlement"}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
