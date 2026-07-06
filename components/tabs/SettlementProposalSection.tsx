"use client";

import { useMemo, useState } from "react";
import { FiFileText, FiRefreshCcw } from "react-icons/fi";
import { motion } from "motion/react";
import { CancelProposalSheet } from "@/components/tabs/CancelProposalSheet";
import { ProposalActionPanel } from "@/components/tabs/ProposalActionPanel";
import { ProposalBlockerPanel } from "@/components/tabs/ProposalBlockerPanel";
import { ProposalExpenseList } from "@/components/tabs/ProposalExpenseList";
import { ProposalHashRow } from "@/components/tabs/ProposalHashRow";
import {
  buildProposalBlockers,
  isExpired,
  isMutableTab,
} from "@/components/tabs/proposalUtils";
import { SettlementProposalSummaryCard } from "@/components/tabs/SettlementProposalSummaryCard";
import { SettlementTransferList } from "@/components/tabs/SettlementTransferList";
import { useNowMs } from "@/components/tabs/useNowMs";
import { usePrefersReducedMotion } from "@/components/tabs/usePrefersReducedMotion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import {
  cancelProposalRequest,
  createProposalRequest,
  lockProposalRequest,
  toTabClientError,
  type TabClientError,
} from "@/lib/tabs/client";
import {
  calculateSettlement,
  createSettlementInputsFromTabDetail,
} from "@/lib/tabs/settlement";
import type { TabDetailResponse, TabMemberResponse } from "@/lib/tabs/types";

type SettlementProposalSectionProps = {
  currentMember: TabMemberResponse | null;
  detail: TabDetailResponse;
  getDidToken: () => Promise<string | null>;
  onRefetch: () => Promise<void> | void;
};

export function SettlementProposalSection({
  currentMember,
  detail,
  getDidToken,
  onRefetch,
}: SettlementProposalSectionProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<TabClientError | null>(null);
  const [loadingAction, setLoadingAction] = useState<"create" | "lock" | "cancel" | null>(
    null,
  );
  const nowMs = useNowMs();
  const proposal = detail.latestProposal;
  const membersById = useMemo(
    () => new Map(detail.members.map((member) => [member.id, member])),
    [detail.members],
  );
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
  const settlementResult = settlement.ok ? settlement.result : null;
  const blockers = useMemo(
    () =>
      buildProposalBlockers({
        authorizations: detail.authorizations,
        currentMember,
        detail,
        nowMs,
        proposal,
        settlement: settlementResult,
      }),
    [currentMember, detail, nowMs, proposal, settlementResult],
  );
  const includedExpenses = useMemo(() => {
    const includedIds = new Set(proposal?.includedExpenseIds ?? []);
    return detail.expenses.filter((expense) => includedIds.has(expense.id));
  }, [detail.expenses, proposal?.includedExpenseIds]);
  const excludedExpenses = useMemo(() => {
    const excludedIds = new Set(proposal?.excludedExpenseIds ?? []);
    return detail.expenses.filter((expense) => excludedIds.has(expense.id));
  }, [detail.expenses, proposal?.excludedExpenseIds]);
  const expired = isExpired(proposal, nowMs);

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

  async function runAction(action: "create" | "lock" | "cancel") {
    if ((action === "lock" || action === "cancel") && !proposal) {
      return;
    }

    setError(null);
    setLoadingAction(action);

    try {
      const didToken = await requireDidToken();

      if (action === "create") {
        await createProposalRequest(didToken, detail.tab.id);
      } else if (action === "lock" && proposal) {
        await lockProposalRequest(didToken, proposal.id);
      } else if (action === "cancel" && proposal) {
        await cancelProposalRequest(didToken, proposal.id);
        setCancelOpen(false);
      }

      await onRefetch();
    } catch (caught) {
      setError(toTabClientError(caught));
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <section aria-labelledby="settlement-proposal-heading" className="grid gap-4">
      <div>
        <h2 id="settlement-proposal-heading" className="text-xl font-semibold text-foreground">
          Settlement proposal
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Review the exact expenses and transfers before anyone authorizes settlement.
        </p>
      </div>

      {!settlement.ok ? (
        <ErrorCallout
          action={
            <Button icon={<FiRefreshCcw aria-hidden="true" />} onClick={onRefetch}>
              Refresh
            </Button>
          }
          message="Refresh the tab. If this keeps happening, one expense may need to be reviewed again."
          title="We could not prepare the proposal."
        />
      ) : null}

      {settlement.ok ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          transition={{ duration: reducedMotion ? 0 : 0.18 }}
        >
          <Card className="grid gap-5">
            {!proposal ? (
              <div className="grid gap-4">
                <div className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-low p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-primary-soft text-primary">
                      <FiFileText aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-foreground">
                        {detail.expenses.some((expense) => expense.status === "confirmed")
                          ? "Ready to review settlement?"
                          : "No proposal yet."}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        {detail.expenses.some((expense) => expense.status === "confirmed")
                          ? "Only confirmed expenses will be included. Anything pending or disputed stays outside settlement."
                          : "Confirmed expenses will appear here when your group is ready."}
                      </p>
                    </div>
                  </div>
                </div>
                <ProposalActionPanel
                  action="create"
                  blockers={blockers}
                  error={error}
                  hasActiveProposal={Boolean(proposal)}
                  loadingAction={loadingAction}
                  proposal={proposal}
                  onCancel={() => setCancelOpen(true)}
                  onCreate={() => void runAction("create")}
                  onLock={() => void runAction("lock")}
                  onRefresh={onRefetch}
                />
                <ProposalBlockerPanel blockers={blockers} reducedMotion={reducedMotion} />
                {!isMutableTab(detail.tab.status) ? (
                  <p className="text-sm leading-6 text-muted">
                    That change is no longer available.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-5">
                <SettlementProposalSummaryCard
                  excludedCount={excludedExpenses.length}
                  includedCount={includedExpenses.length}
                  nowMs={nowMs}
                  proposal={proposal}
                  reducedMotion={reducedMotion}
                />
                {expired ? (
                  <div className="rounded-md border border-outline-variant bg-secondary-soft px-4 py-3 text-sm leading-6 text-secondary">
                    This proposal expired. Cancel it and create a fresh one before settlement.
                  </div>
                ) : null}
                <ProposalActionPanel
                  action={proposal ? "lock" : "create"}
                  blockers={blockers}
                  error={error}
                  hasActiveProposal={Boolean(proposal)}
                  loadingAction={loadingAction}
                  proposal={proposal}
                  onCancel={() => {
                    setError(null);
                    setCancelOpen(true);
                  }}
                  onCreate={() => void runAction("create")}
                  onLock={() => void runAction("lock")}
                  onRefresh={onRefetch}
                />
                <ProposalBlockerPanel blockers={blockers} reducedMotion={reducedMotion} />
                <SettlementTransferList membersById={membersById} transfers={proposal.transfers} />
                <ProposalExpenseList
                  expenses={includedExpenses}
                  membersById={membersById}
                  reducedMotion={reducedMotion}
                  title="Included in settlement"
                />
                <ProposalExpenseList
                  expenses={excludedExpenses}
                  membersById={membersById}
                  reducedMotion={reducedMotion}
                  title="Outside settlement"
                />
                <ProposalHashRow hash={proposal.proposalHash} />
              </div>
            )}
          </Card>
        </motion.div>
      ) : null}

      <CancelProposalSheet
        error={error}
        loading={loadingAction === "cancel"}
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (open) {
            setError(null);
          }
        }}
        onSubmit={() => void runAction("cancel")}
      />
    </section>
  );
}
