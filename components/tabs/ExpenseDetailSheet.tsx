"use client";

import {
  FiAlertCircle,
  FiCheckCircle,
  FiClock,
  FiDollarSign,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import { ConfirmationProgress } from "@/components/tabs/ConfirmationProgress";
import type { ExpenseView } from "@/components/tabs/expenseTypes";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { Sheet } from "@/components/ui/Sheet";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatUsdc } from "@/lib/tabs/money";
import type { TabClientError } from "@/lib/tabs/client";
import type { TabMemberResponse, TabStatus } from "@/lib/tabs/types";

type ExpenseDetailSheetProps = {
  currentMember: TabMemberResponse | null;
  error: TabClientError | null;
  expense: ExpenseView | null;
  canRemove: boolean;
  loadingAction: "confirm" | "dispute" | "remove" | null;
  open: boolean;
  tabStatus: TabStatus;
  onConfirm: () => void;
  onDispute: () => void;
  onRemove: () => void;
  onOpenChange: (open: boolean) => void;
};

function statusCopy(status: ExpenseView["expense"]["status"]) {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "disputed":
      return "Disputed";
    case "pending":
      return "Needs review";
    case "locked":
    case "settled":
      return "Read-only";
    default:
      return "Excluded";
  }
}

function tabAllowsReview(status: TabStatus) {
  return status === "active" || status === "review";
}

export function ExpenseDetailSheet({
  currentMember,
  error,
  expense,
  canRemove,
  loadingAction,
  open,
  tabStatus,
  onConfirm,
  onDispute,
  onRemove,
  onOpenChange,
}: ExpenseDetailSheetProps) {
  const currentConfirmation =
    currentMember && expense
      ? expense.confirmations.find((confirmation) => confirmation.memberId === currentMember.id)
      : null;
  const canConfirm =
    Boolean(currentConfirmation) &&
    (currentConfirmation?.status === "pending" || currentConfirmation?.status === "disputed") &&
    (expense?.expense.status === "pending" || expense?.expense.status === "disputed") &&
    tabAllowsReview(tabStatus);
  const canReview =
    Boolean(currentConfirmation) &&
    currentConfirmation?.status === "pending" &&
    expense?.expense.status === "pending" &&
    tabAllowsReview(tabStatus);
  const disputeReason = expense?.confirmations.find(
    (confirmation) => confirmation.status === "disputed" && confirmation.reason,
  )?.reason;

  return (
    <Sheet open={open} title={expense?.expense.title ?? "Expense"} onOpenChange={onOpenChange}>
      {expense ? (
        <div className="grid max-h-[72vh] gap-5 overflow-y-auto pr-1">
          {error ? (
            <ErrorCallout message={error.message} title="We could not update this expense" />
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusChip
              className="gap-1.5"
              tone={
                expense.expense.status === "confirmed"
                  ? "success"
                  : expense.expense.status === "disputed"
                    ? "error"
                    : "neutral"
              }
            >
              {expense.expense.status === "confirmed" ? (
                <FiCheckCircle aria-hidden="true" />
              ) : expense.expense.status === "disputed" ? (
                <FiAlertCircle aria-hidden="true" />
              ) : (
                <FiClock aria-hidden="true" />
              )}
              {statusCopy(expense.expense.status)}
            </StatusChip>
            <div className="flex items-center gap-2 font-semibold tabular-nums text-foreground">
              <FiDollarSign aria-hidden="true" />
              {formatUsdc(expense.expense.amountBaseUnits)}
            </div>
          </div>

          <dl className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-low p-4">
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-muted">Paid by</dt>
              <dd className="text-right font-semibold">
                {expense.payer?.displayName ?? "A member"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-muted">Split</dt>
              <dd className="text-right font-semibold">
                {expense.expense.splitMethod === "equal" ? "Equal" : "Custom"}
              </dd>
            </div>
          </dl>

          {expense.expense.note ? (
            <div>
              <h3 className="text-sm font-semibold text-foreground">Note</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">
                {expense.expense.note}
              </p>
            </div>
          ) : null}

          <section className="grid gap-3">
            <div className="flex items-center gap-2">
              <FiUsers aria-hidden="true" className="text-muted" />
              <h3 className="text-sm font-semibold text-foreground">Split details</h3>
            </div>
            <div className="grid gap-2">
              {expense.splits.map(({ confirmation, member, split }) => (
                <div
                  className="grid gap-2 rounded-md border border-outline-variant bg-surface-container-lowest p-3 sm:grid-cols-[1fr_auto] sm:items-center"
                  key={split.id}
                >
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{member?.displayName ?? "Member"}</p>
                    <p className="text-sm text-muted">
                      {confirmation?.status === "confirmed"
                        ? "Confirmed"
                        : confirmation?.status === "disputed"
                          ? "Disputed"
                          : "Needs review"}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-foreground">
                    {formatUsdc(split.shareBaseUnits)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <ConfirmationProgress expense={expense} />

          {expense.expense.status === "disputed" ? (
            <div className="rounded-md border border-error-container bg-error-container/45 p-4 text-on-error-container">
              <h3 className="font-semibold">Excluded from settlement</h3>
              <p className="mt-1 text-sm leading-6">
                {disputeReason ||
                  "A member disputed this expense, so it will stay out of settlement."}
              </p>
            </div>
          ) : null}

          {canConfirm ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                disabled={loadingAction !== null && loadingAction !== "confirm"}
                icon={<FiCheckCircle aria-hidden="true" />}
                loading={loadingAction === "confirm"}
                onClick={onConfirm}
              >
                Confirm my share
              </Button>
              {canReview ? (
                <Button
                  disabled={loadingAction !== null && loadingAction !== "dispute"}
                  icon={<FiAlertCircle aria-hidden="true" />}
                  loading={loadingAction === "dispute"}
                  onClick={onDispute}
                  variant="secondary"
                >
                  Dispute
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm leading-6 text-muted">
              {currentConfirmation
                ? "Your review for this expense is already recorded."
                : "Only members included in this expense can confirm it."}
            </p>
          )}

          {canRemove ? (
            <div className="border-t border-outline-variant pt-4">
              <Button
                className="w-full sm:w-auto"
                disabled={loadingAction !== null && loadingAction !== "remove"}
                icon={<FiTrash2 aria-hidden="true" />}
                loading={loadingAction === "remove"}
                onClick={onRemove}
                variant="danger"
              >
                Remove expense
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Sheet>
  );
}
