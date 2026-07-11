"use client";

import { useMemo, useState } from "react";
import { FiFileText, FiRefreshCcw, FiZap } from "react-icons/fi";
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
import { SettlementAuthorizationSection } from "@/components/tabs/SettlementAuthorizationSection";
import { SettlementPreviewSheet } from "@/components/tabs/SettlementPreviewSheet";
import { useNowMs } from "@/components/tabs/useNowMs";
import { usePrefersReducedMotion } from "@/components/tabs/usePrefersReducedMotion";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { createSettlementAccountClient, sendSettlementBatch } from "@/lib/account/zerodev/browser";
import {
  cancelProposalRequest,
  confirmCancelProposalRequest,
  confirmLockProposalRequest,
  createProposalRequest,
  prepareCancelProposalRequest,
  prepareLockProposalRequest,
  recordUserOperationStatusRequest,
  toTabClientError,
  type TabClientError,
} from "@/lib/tabs/client";
import { TABY_CHAIN_ID, TABY_USDC_ADDRESS } from "@/lib/tabs/constants";
import {
  calculateSettlement,
  createSettlementInputsFromTabDetail,
} from "@/lib/tabs/settlement";
import type { Account } from "@/lib/account/types";
import type { TabDetailResponse, TabMemberResponse } from "@/lib/tabs/types";
import type { EIP1193Provider } from "viem";

type SettlementProposalSectionProps = {
  account: Account | null;
  currentMember: TabMemberResponse | null;
  detail: TabDetailResponse;
  getDidToken: () => Promise<string | null>;
  getWalletProvider: () => EIP1193Provider | null;
  onCountdownActiveChange?: (active: boolean) => void;
  onRefetch: () => Promise<void> | void;
  requestWallet: <T = unknown>(payload: { method: string; params?: unknown[] }) => Promise<T>;
};

export function SettlementProposalSection({
  account,
  currentMember,
  detail,
  getDidToken,
  getWalletProvider,
  onCountdownActiveChange,
  onRefetch,
  requestWallet,
}: SettlementProposalSectionProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<TabClientError | null>(null);
  const [loadingAction, setLoadingAction] = useState<"create" | "lock" | "cancel" | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
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
  const settlementPreviewBlocker = blockers.find((blocker) => blocker.blocksFutureSettlement);
  const settlementConfigBlocker =
    !detail.tab.settlementContractAddress
      ? "Settlement is not configured yet."
      : detail.tab.networkChainId !== TABY_CHAIN_ID
        ? "Settlement is configured for Arbitrum Sepolia."
        : detail.tab.tokenAddress.toLowerCase() !== TABY_USDC_ADDRESS.toLowerCase()
          ? "Settlement is configured for USDC only."
          : null;
  const canOpenSettlementPreview =
    proposal?.status === "locked" &&
    !expired &&
    !settlementPreviewBlocker &&
    !settlementConfigBlocker;

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
        if (!account?.settlementAccount) {
          throw {
            code: "account_unavailable",
            message: "Preparing secure settlement. You will not need gas to continue.",
          } satisfies TabClientError;
        }

        const magicProvider = getWalletProvider();

        if (!magicProvider) {
          throw {
            code: "account_unavailable",
            message: "Preparing secure settlement. You will not need gas to continue.",
          } satisfies TabClientError;
        }

        const prepared = await prepareLockProposalRequest(didToken, proposal.id);

        if (!Array.isArray(prepared.calls)) {
          await onRefetch();
          return;
        }

        const settlementClient = await createSettlementAccountClient({
          accountType: account.settlementAccount.accountType,
          didToken,
          magicProvider,
          magicWalletAddress: account.settlementAccount.magicWalletAddress,
          publicRpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL,
        });

        if (
          settlementClient.settlementAddress.toLowerCase() !==
          account.settlementAccount.settlementAddress.toLowerCase()
        ) {
          throw {
            code: "account_unavailable",
            message: "Preparing secure settlement. Refresh your settlement account and try again.",
          } satisfies TabClientError;
        }

        const receipt = await sendSettlementBatch(
          settlementClient.kernelClient,
          prepared.calls,
          async (userOperationHash) => {
            await recordUserOperationStatusRequest(didToken, {
              purpose: "final_tab_registration",
              status: "submitted",
              userOperationHash,
            });
          },
        );

        await confirmLockProposalRequest(didToken, proposal.id, receipt);
      } else if (action === "cancel" && proposal) {
        if (proposal.status === "locked" || proposal.registrationTxHash) {
          if (!account?.settlementAccount) {
            throw {
              code: "account_unavailable",
              message: "We could not cancel this Final Tab onchain. Try again before creating a fresh one.",
            } satisfies TabClientError;
          }

          const magicProvider = getWalletProvider();

          if (!magicProvider) {
            throw {
              code: "account_unavailable",
              message: "We could not cancel this Final Tab onchain. Try again before creating a fresh one.",
            } satisfies TabClientError;
          }

          const prepared = await prepareCancelProposalRequest(didToken, proposal.id);

          if (!Array.isArray(prepared.calls)) {
            await onRefetch();
            setCancelOpen(false);
            return;
          }

          const settlementClient = await createSettlementAccountClient({
            accountType: account.settlementAccount.accountType,
            didToken,
            magicProvider,
            magicWalletAddress: account.settlementAccount.magicWalletAddress,
            publicRpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL,
          });

          if (
            settlementClient.settlementAddress.toLowerCase() !==
            account.settlementAccount.settlementAddress.toLowerCase()
          ) {
            throw {
              code: "account_unavailable",
              message: "Preparing secure settlement. Refresh your settlement account and try again.",
            } satisfies TabClientError;
          }

          const receipt = await sendSettlementBatch(
            settlementClient.kernelClient,
            prepared.calls,
            async (userOperationHash) => {
              await recordUserOperationStatusRequest(didToken, {
                purpose: "final_tab_cancellation",
                status: "submitted",
                userOperationHash,
              });
            },
          );

          await confirmCancelProposalRequest(didToken, proposal.id, receipt);
        } else {
          await cancelProposalRequest(didToken, proposal.id);
        }
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
          Final Tab
        </h2>
        <p className="mt-1 text-sm leading-6 text-muted">
          Review the exact expenses and transfers before anyone approves settlement.
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
          title="We could not prepare the Final Tab."
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
                          ? "Ready to make this final?"
                          : "No Final Tab yet."}
                      </h3>
                      <p className="mt-1 text-sm leading-6 text-muted">
                        {detail.expenses.some((expense) => expense.status === "confirmed")
                          ? "Only confirmed expenses will be included. Anything pending or disputed stays outside."
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
                <SettlementAuthorizationSection
                  account={account}
                  currentMember={currentMember}
                  detail={detail}
                  getDidToken={getDidToken}
                  getWalletProvider={getWalletProvider}
                  requestWallet={requestWallet}
                  onRefetch={onRefetch}
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
                <SettlementAuthorizationSection
                  account={account}
                  currentMember={currentMember}
                  detail={detail}
                  getDidToken={getDidToken}
                  getWalletProvider={getWalletProvider}
                  requestWallet={requestWallet}
                  onRefetch={onRefetch}
                />
                {proposal.status === "locked" ? (
                  <div className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-low p-4">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-foreground">
                          Preview settlement
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-muted">
                          Review the final transfers and cancel window before settlement starts.
                        </p>
                      </div>
                      <Button
                        className="w-full sm:w-auto"
                        disabled={!canOpenSettlementPreview}
                        icon={<FiZap aria-hidden="true" />}
                        onClick={() => setPreviewOpen(true)}
                      >
                        Settle tab
                      </Button>
                    </div>
                    {!canOpenSettlementPreview ? (
                      <p className="text-sm leading-6 text-muted">
                        {expired
                          ? "This Final Tab expired. Create a fresh one before settling."
                          : settlementConfigBlocker ??
                            settlementPreviewBlocker?.message ??
                            "Lock the Final Tab before previewing settlement."}
                      </p>
                    ) : null}
                  </div>
                ) : proposal.status === "open" ? (
                  <p className="rounded-md border border-outline-variant bg-surface-container-low px-4 py-3 text-sm leading-6 text-muted">
                    Lock the Final Tab before previewing settlement.
                  </p>
                ) : null}
                {expired ? (
                  <div className="rounded-md border border-outline-variant bg-secondary-soft px-4 py-3 text-sm leading-6 text-secondary">
                    This Final Tab expired. Create a fresh one before settling.
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
      {proposal?.status === "locked" ? (
        <SettlementPreviewSheet
          getDidToken={getDidToken}
          membersById={membersById}
          open={previewOpen}
          proposalHash={proposal.proposalHash}
          proposalId={proposal.id}
          onCountdownActiveChange={onCountdownActiveChange}
          onOpenChange={setPreviewOpen}
          onRefetch={onRefetch}
        />
      ) : null}
    </section>
  );
}
