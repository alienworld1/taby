"use client";

import { useMemo, useState } from "react";
import { FiFileText, FiInfo, FiPlus } from "react-icons/fi";
import { motion } from "motion/react";
import { AddExpenseSheet, type AddExpenseInput } from "@/components/tabs/AddExpenseSheet";
import { DisputeExpenseSheet } from "@/components/tabs/DisputeExpenseSheet";
import { ExpenseDetailSheet } from "@/components/tabs/ExpenseDetailSheet";
import { ExpenseGroup } from "@/components/tabs/ExpenseGroup";
import { RemoveExpenseSheet } from "@/components/tabs/RemoveExpenseSheet";
import type { ExpenseView } from "@/components/tabs/expenseTypes";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import {
  addExpenseRequest,
  confirmExpenseRequest,
  disputeExpenseRequest,
  removeExpenseRequest,
  toTabClientError,
  type AddExpenseResponse,
  type RemoveExpenseResponse,
  type ReviewExpenseResponse,
  type TabClientError,
} from "@/lib/tabs/client";
import type { TabDetailResponse, TabMemberResponse } from "@/lib/tabs/types";

type ExpenseWorkspaceProps = {
  currentMember: TabMemberResponse | null;
  detail: TabDetailResponse;
  getDidToken: () => Promise<string | null>;
  onDetailChange: (detail: TabDetailResponse) => void;
  onRefetch: () => void;
};

function canMutateTab(status: TabDetailResponse["tab"]["status"]) {
  return status === "active" || status === "review";
}

function buildExpenseViews(detail: TabDetailResponse) {
  const memberById = new Map(detail.members.map((member) => [member.id, member]));
  const splitsByExpense = new Map<string, typeof detail.splits>();
  const confirmationsByExpense = new Map<string, typeof detail.confirmations>();

  for (const split of detail.splits) {
    splitsByExpense.set(split.expenseId, [...(splitsByExpense.get(split.expenseId) ?? []), split]);
  }

  for (const confirmation of detail.confirmations) {
    confirmationsByExpense.set(confirmation.expenseId, [
      ...(confirmationsByExpense.get(confirmation.expenseId) ?? []),
      confirmation,
    ]);
  }

  return detail.expenses.map((expense) => {
    const confirmations = confirmationsByExpense.get(expense.id) ?? [];

    return {
      confirmations,
      expense,
      payer: memberById.get(expense.payerMemberId) ?? null,
      splits: (splitsByExpense.get(expense.id) ?? []).map((split) => ({
        confirmation:
          confirmations.find((confirmation) => confirmation.memberId === split.memberId) ?? null,
        member: memberById.get(split.memberId) ?? null,
        split,
      })),
    } satisfies ExpenseView;
  });
}

function mergeAddExpense(detail: TabDetailResponse, response: AddExpenseResponse) {
  return {
    ...detail,
    activity: [response.activity, ...detail.activity],
    confirmations: [...response.confirmations, ...detail.confirmations],
    expenses: [response.expense, ...detail.expenses],
    splits: [...response.splits, ...detail.splits],
  };
}

function mergeReviewExpense(detail: TabDetailResponse, response: ReviewExpenseResponse) {
  return {
    ...detail,
    activity: [
      response.activity,
      ...(response.allConfirmedActivity ? [response.allConfirmedActivity] : []),
      ...detail.activity,
    ],
    confirmations: detail.confirmations.map((confirmation) =>
      confirmation.id === response.confirmation.id ? response.confirmation : confirmation,
    ),
    expenses: detail.expenses.map((expense) =>
      expense.id === response.expense.id ? response.expense : expense,
    ),
  };
}

function mergeRemoveExpense(detail: TabDetailResponse, response: RemoveExpenseResponse) {
  return {
    ...detail,
    activity: [response.activity, ...detail.activity],
    confirmations: detail.confirmations.filter(
      (confirmation) => confirmation.expenseId !== response.expenseId,
    ),
    expenses: detail.expenses.filter((expense) => expense.id !== response.expenseId),
    splits: detail.splits.filter((split) => split.expenseId !== response.expenseId),
  };
}

export function ExpenseWorkspace({
  currentMember,
  detail,
  getDidToken,
  onDetailChange,
  onRefetch,
}: ExpenseWorkspaceProps) {
  const [addError, setAddError] = useState<TabClientError | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [detailError, setDetailError] = useState<TabClientError | null>(null);
  const [disputeError, setDisputeError] = useState<TabClientError | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState<
    "add" | "confirm" | "dispute" | "remove" | null
  >(null);
  const [removeError, setRemoveError] = useState<TabClientError | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [selectedExpenseId, setSelectedExpenseId] = useState<string | null>(null);

  const joinedMembers = useMemo(
    () => detail.members.filter((member) => member.joinStatus === "joined"),
    [detail.members],
  );
  const expenseViews = useMemo(() => buildExpenseViews(detail), [detail]);
  const selectedExpense =
    expenseViews.find((expense) => expense.expense.id === selectedExpenseId) ?? null;
  const pendingExpenses = expenseViews.filter((expense) => expense.expense.status === "pending");
  const confirmedExpenses = expenseViews.filter((expense) => expense.expense.status === "confirmed");
  const disputedExpenses = expenseViews.filter((expense) => expense.expense.status === "disputed");
  const readOnlyExpenses = expenseViews.filter(
    (expense) => expense.expense.status === "locked" || expense.expense.status === "settled",
  );
  const canAdd =
    Boolean(currentMember && currentMember.joinStatus === "joined") &&
    joinedMembers.length >= 2 &&
    canMutateTab(detail.tab.status);
  const isOwner =
    Boolean(currentMember && currentMember.role === "owner" && currentMember.joinStatus === "joined") ||
    Boolean(currentMember?.userId && detail.tab.ownerUserId === currentMember.userId);
  const canRemoveSelectedExpense =
    Boolean(selectedExpense) &&
    isOwner &&
    canMutateTab(detail.tab.status) &&
    selectedExpense?.expense.status !== "locked" &&
    selectedExpense?.expense.status !== "settled";
  const disabledReason = !canMutateTab(detail.tab.status)
    ? "This tab is read-only, so new expenses cannot be added."
    : joinedMembers.length < 2
      ? "Another member needs to join before expenses can be added."
      : !currentMember || currentMember.joinStatus !== "joined"
        ? "Join this tab before adding expenses."
        : null;

  async function requireDidToken() {
    const didToken = await getDidToken();

    if (!didToken) {
      throw {
        code: "unauthenticated",
        message: "Sign in to continue.",
      } satisfies TabClientError;
    }

    return didToken;
  }

  async function handleAddExpense(input: AddExpenseInput) {
    setAddError(null);
    setLoadingAction("add");

    try {
      const didToken = await requireDidToken();
      const response = await addExpenseRequest(didToken, detail.tab.id, input);
      onDetailChange(mergeAddExpense(detail, response));
      return true;
    } catch (error) {
      setAddError(toTabClientError(error));
      return false;
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleConfirm() {
    if (!selectedExpense) {
      return;
    }

    setDetailError(null);
    setLoadingAction("confirm");

    try {
      const didToken = await requireDidToken();
      const response = await confirmExpenseRequest(didToken, selectedExpense.expense.id);
      onDetailChange(mergeReviewExpense(detail, response));
    } catch (error) {
      const clientError = toTabClientError(error);
      setDetailError(clientError);
      if (clientError.code === "invalid_transition" || clientError.code === "stale_record") {
        onRefetch();
      }
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleDispute(reason: string) {
    if (!selectedExpense) {
      return false;
    }

    setDisputeError(null);
    setLoadingAction("dispute");

    try {
      const didToken = await requireDidToken();
      const response = await disputeExpenseRequest(didToken, selectedExpense.expense.id, reason);
      onDetailChange(mergeReviewExpense(detail, response));
      return true;
    } catch (error) {
      const clientError = toTabClientError(error);
      setDisputeError(clientError);
      if (clientError.code === "invalid_transition" || clientError.code === "stale_record") {
        onRefetch();
      }
      return false;
    } finally {
      setLoadingAction(null);
    }
  }

  async function handleRemoveExpense() {
    if (!selectedExpense) {
      return;
    }

    setRemoveError(null);
    setLoadingAction("remove");

    try {
      const didToken = await requireDidToken();
      const response = await removeExpenseRequest(didToken, selectedExpense.expense.id);
      onDetailChange(mergeRemoveExpense(detail, response));
      setRemoveOpen(false);
      setSelectedExpenseId(null);
      setDetailError(null);
    } catch (error) {
      const clientError = toTabClientError(error);
      setRemoveError(clientError);
      if (clientError.code === "invalid_transition" || clientError.code === "stale_record") {
        onRefetch();
      }
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Expenses</h2>
          <p className="mt-1 flex items-center gap-2 text-sm leading-6 text-muted">
            <FiInfo aria-hidden="true" className="shrink-0" />
            Only confirmed expenses enter settlement.
          </p>
        </div>
        <Button
          disabled={!canAdd}
          icon={<FiPlus aria-hidden="true" />}
          onClick={() => {
            setAddError(null);
            setAddOpen(true);
          }}
        >
          Add expense
        </Button>
      </div>

      {disabledReason ? (
        <Card tone="soft">
          <p className="text-sm leading-6 text-muted">{disabledReason}</p>
        </Card>
      ) : null}

      {detail.expenses.length === 0 && joinedMembers.length >= 2 ? (
        <EmptyState
          action={
            <Button
              disabled={!canAdd}
              icon={<FiPlus aria-hidden="true" />}
              onClick={() => setAddOpen(true)}
            >
              Add expense
            </Button>
          }
          description="Add the first shared cost when your group is ready to review it."
          icon={<FiFileText aria-hidden="true" />}
          title="No expenses yet."
        />
      ) : null}

      {detail.expenses.length > 0 ? (
        <motion.div className="grid gap-5" layout>
          {pendingExpenses.length + disputedExpenses.length > 0 ? (
            <p className="rounded-md border border-outline-variant bg-surface-container-low p-3 text-sm leading-6 text-muted">
              These will stay out of settlement until resolved.
            </p>
          ) : null}
          <ExpenseGroup
            expenses={pendingExpenses}
            title="Needs review"
            onOpenExpense={(expenseId) => {
              setDetailError(null);
              setSelectedExpenseId(expenseId);
            }}
          />
          <ExpenseGroup
            expenses={confirmedExpenses}
            title="Confirmed"
            onOpenExpense={(expenseId) => {
              setDetailError(null);
              setSelectedExpenseId(expenseId);
            }}
          />
          <ExpenseGroup
            description="These will stay out of settlement until resolved."
            expenses={disputedExpenses}
            title="Disputed"
            onOpenExpense={(expenseId) => {
              setDetailError(null);
              setSelectedExpenseId(expenseId);
            }}
          />
          <ExpenseGroup
            expenses={readOnlyExpenses}
            title="Read-only"
            onOpenExpense={(expenseId) => {
              setDetailError(null);
              setSelectedExpenseId(expenseId);
            }}
          />
        </motion.div>
      ) : null}

      {detailError && !selectedExpense ? (
        <ErrorCallout
          action={<Button onClick={onRefetch}>Refresh</Button>}
          message={detailError.message}
        />
      ) : null}

      {addOpen ? (
        <AddExpenseSheet
          currentMember={currentMember}
          error={addError}
          joinedMembers={joinedMembers}
          loading={loadingAction === "add"}
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (open) {
              setAddError(null);
            }
          }}
          onSubmit={handleAddExpense}
        />
      ) : null}
      <ExpenseDetailSheet
        canRemove={canRemoveSelectedExpense}
        currentMember={currentMember}
        error={detailError}
        expense={selectedExpense}
        loadingAction={
          loadingAction === "confirm" || loadingAction === "remove" ? loadingAction : null
        }
        open={Boolean(selectedExpense)}
        tabStatus={detail.tab.status}
        onConfirm={handleConfirm}
        onDispute={() => {
          setDisputeError(null);
          setDisputeOpen(true);
        }}
        onRemove={() => {
          setRemoveError(null);
          setRemoveOpen(true);
        }}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedExpenseId(null);
            setDetailError(null);
            setRemoveOpen(false);
          }
        }}
      />
      {disputeOpen ? (
        <DisputeExpenseSheet
          error={disputeError}
          loading={loadingAction === "dispute"}
          open={disputeOpen}
          onOpenChange={(open) => {
            setDisputeOpen(open);
            if (open) {
              setDisputeError(null);
            }
          }}
          onSubmit={handleDispute}
        />
      ) : null}
      {removeOpen ? (
        <RemoveExpenseSheet
          error={removeError}
          loading={loadingAction === "remove"}
          open={removeOpen}
          onOpenChange={(open) => {
            setRemoveOpen(open);
            if (open) {
              setRemoveError(null);
            }
          }}
          onSubmit={handleRemoveExpense}
        />
      ) : null}
    </section>
  );
}
