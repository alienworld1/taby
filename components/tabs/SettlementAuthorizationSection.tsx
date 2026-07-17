"use client";

import { useMemo, useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiRefreshCcw, FiShield } from "react-icons/fi";
import { motion } from "motion/react";
import { AuthorizationReadinessList } from "@/components/tabs/AuthorizationReadinessList";
import { AuthorizationSheet } from "@/components/tabs/AuthorizationSheet";
import { SettlementAccountStatusRow } from "@/components/account/SettlementAccountStatusRow";
import {
  buildReadinessItems,
  deriveDebtorAmounts,
  getDefaultExpiry,
  getLatestAuthorization,
  getVisibleCapBaseUnits,
  isExpectedToken,
  normalizeAddress,
} from "@/components/tabs/authorizationUtils";
import { formatUsdc } from "@/lib/tabs/money";
import { isExpired } from "@/components/tabs/proposalUtils";
import { useNowMs } from "@/components/tabs/useNowMs";
import { usePrefersReducedMotion } from "@/components/tabs/usePrefersReducedMotion";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import type { Account } from "@/lib/account/types";
import type { TabDetailResponse, TabMemberResponse } from "@/lib/tabs/types";
import type { EIP1193Provider } from "viem";

type WalletRequest = <T = unknown>(payload: {
  method: string;
  params?: unknown[];
}) => Promise<T>;

type SettlementAuthorizationSectionProps = {
  account: Account | null;
  currentMember: TabMemberResponse | null;
  detail: TabDetailResponse;
  getDidToken: () => Promise<string | null>;
  getWalletProvider: () => EIP1193Provider | null;
  onRefetch: () => Promise<void> | void;
  requestWallet: WalletRequest;
};

export function SettlementAuthorizationSection({
  account,
  currentMember,
  detail,
  getDidToken,
  getWalletProvider,
  onRefetch,
  requestWallet,
}: SettlementAuthorizationSectionProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
  const nowMs = useNowMs();
  const proposal = detail.latestProposal;
  const lockedProposal = proposal?.status === "locked" ? proposal : null;
  const debtorAmounts = useMemo(() => deriveDebtorAmounts(lockedProposal), [lockedProposal]);
  const membersById = useMemo(
    () => new Map(detail.members.map((member) => [member.id, member])),
    [detail.members],
  );
  const readinessItems = useMemo(
    () =>
      buildReadinessItems({
        authorizations: detail.authorizations,
        debtorAmounts,
        membersById,
        nowMs,
        proposal: lockedProposal,
        readiness: detail.authorizationReadiness,
      }),
    [
      debtorAmounts,
      detail.authorizationReadiness,
      detail.authorizations,
      lockedProposal,
      membersById,
      nowMs,
    ],
  );
  const currentOwed = currentMember ? debtorAmounts.get(currentMember.id) ?? BigInt(0) : BigInt(0);
  const currentAuthorization = currentMember
    ? getLatestAuthorization(
        detail.authorizations,
        currentMember.id,
        lockedProposal?.id,
        lockedProposal?.proposalHash,
      )
    : null;
  const currentReadiness = currentMember
    ? detail.authorizationReadiness.find((item) => item.memberId === currentMember.id)
    : null;
  const visibleCap = getVisibleCapBaseUnits(detail, currentOwed);
  const defaultExpiry = getDefaultExpiry(detail);
  const normalizedAccountWallet = normalizeAddress(account?.settlementAccount?.settlementAddress);
  const settlementContractAddress = normalizeAddress(detail.tab.settlementContractAddress);
  const tokenReady = isExpectedToken(detail.tab.tokenAddress);
  const settlementAccountReady =
    account?.settlementAccount?.delegationStatus === "ready" &&
    account.settlementAccount.configHash.length > 0;
  const proposalExpired = isExpired(lockedProposal, nowMs);
  const authorizationExpired =
    currentAuthorization &&
    nowMs !== null &&
    new Date(currentAuthorization.expiresAt).getTime() <= nowMs;
  const authorizationActive = currentReadiness?.status === "approved";
  const isDebtor = currentOwed > BigInt(0);
  const canOpenSheet =
    Boolean(lockedProposal) &&
    Boolean(currentMember) &&
    currentMember?.joinStatus === "joined" &&
    isDebtor &&
    Boolean(settlementContractAddress) &&
    tokenReady &&
    settlementAccountReady &&
    !proposalExpired &&
    Boolean(normalizedAccountWallet);
  const helperCopy = getHelperCopy({
    currentMember,
    isDebtor,
    lockedProposal: Boolean(lockedProposal),
    normalizedAccountWallet,
    authorizationExpired: Boolean(authorizationExpired),
    authorizationActive,
    authorizationRevoked: Boolean(currentAuthorization?.revokedAt),
    proposalExpired: Boolean(proposalExpired),
    settlementContractAddress,
    settlementAccountReady,
    tokenReady,
  });

  return (
    <motion.section
      aria-labelledby="settlement-authorization-heading"
      className="grid gap-4 rounded-md border border-outline-variant bg-surface-container-low p-4"
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.18 }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2
            id="settlement-authorization-heading"
            className="text-lg font-semibold text-foreground"
          >
            Final Tab approval
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted">
            Each person who owes approves their exact share for this locked Final Tab.
          </p>
        </div>
        {readinessItems.length > 0 && readinessItems.every((item) => !item.blocksSettlement) ? (
          <StatusChip tone="success">
            <span className="inline-flex items-center gap-1.5">
              <FiCheckCircle aria-hidden="true" />
              Approved
            </span>
          </StatusChip>
        ) : (
          <StatusChip tone="pending">
            <span className="inline-flex items-center gap-1.5">
              <FiAlertCircle aria-hidden="true" />
              Waiting
            </span>
          </StatusChip>
        )}
      </div>

      {!lockedProposal ? (
        <p className="rounded-md border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm font-semibold leading-6 text-muted">
          Lock the Final Tab before anyone approves settlement.
        </p>
      ) : (
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-md border border-outline-variant bg-surface-container-lowest p-4">
            {!settlementAccountReady ? (
              <SettlementAccountStatusRow readiness={account?.settlementAccount ?? null} />
            ) : null}
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="text-sm font-semibold text-muted">
                  {isDebtor ? "You owe" : "Your share"}
                </p>
                <p className="mt-1 text-2xl font-semibold text-foreground">
                  {formatUsdc(currentOwed)}
                </p>
              </div>
              {isDebtor ? (
                <div className="text-left sm:text-right">
                  <p className="text-sm font-semibold text-muted">Maximum</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    {formatUsdc(
                      currentReadiness?.contractAuthorizationAmountBaseUnits ??
                        currentReadiness?.authorizationAmountBaseUnits ??
                        currentAuthorization?.capBaseUnits ??
                        visibleCap,
                    )}
                  </p>
                </div>
              ) : null}
            </div>
            <p className="text-sm leading-6 text-muted">{helperCopy}</p>
            {canOpenSheet ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                <p className="text-sm font-semibold leading-6 text-primary-strong">
                  Applies only to this Final Tab. Maximum: {formatUsdc(currentOwed)}.
                </p>
                <Button
                  icon={<FiShield aria-hidden="true" />}
                  onClick={() => setSheetOpen(true)}
                >
                  {authorizationActive
                    ? "Review approval"
                    : "Approve this Final Tab"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  icon={<FiRefreshCcw aria-hidden="true" />}
                  variant="secondary"
                  onClick={onRefetch}
                >
                  Refresh status
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <h3 className="text-sm font-semibold text-foreground">Group approval</h3>
            <AuthorizationReadinessList
              items={readinessItems}
              reducedMotion={reducedMotion}
            />
          </div>
        </div>
      )}

      {canOpenSheet &&
      currentMember &&
      lockedProposal &&
      normalizedAccountWallet &&
      settlementContractAddress &&
      account?.settlementAccount ? (
        <AuthorizationSheet
          accountType={account.settlementAccount.accountType}
          authorization={currentAuthorization}
          capBaseUnits={currentOwed.toString()}
          currentMember={currentMember}
          expiresAt={lockedProposal.expiresAt ?? defaultExpiry}
          getDidToken={getDidToken}
          getWalletProvider={getWalletProvider}
          magicWalletAddress={account.settlementAccount.magicWalletAddress}
          maxSingleSettlementBaseUnits={currentOwed.toString()}
          open={sheetOpen}
          owedBaseUnits={currentOwed.toString()}
          proposal={lockedProposal}
          readiness={currentReadiness ?? null}
          requestWallet={requestWallet}
          settlementContractAddress={settlementContractAddress}
          tab={detail.tab}
          walletAddress={normalizedAccountWallet}
          onOpenChange={setSheetOpen}
          onRefetch={onRefetch}
        />
      ) : null}
    </motion.section>
  );
}

function getHelperCopy(input: {
  currentMember: TabMemberResponse | null;
  isDebtor: boolean;
  lockedProposal: boolean;
  normalizedAccountWallet: string | null;
  authorizationActive: boolean;
  authorizationExpired: boolean;
  authorizationRevoked: boolean;
  proposalExpired: boolean;
  settlementContractAddress: string | null;
  settlementAccountReady: boolean;
  tokenReady: boolean;
}) {
  if (!input.lockedProposal) {
    return "Lock the Final Tab before anyone approves settlement.";
  }

  if (!input.currentMember || input.currentMember.joinStatus !== "joined") {
    return "Join this tab before approving settlement.";
  }

  if (!input.isDebtor) {
    return "You do not owe anything in this Final Tab.";
  }

  if (input.proposalExpired) {
    return "This Final Tab expired. Create a fresh one before approving.";
  }

  if (input.authorizationRevoked) {
    return "You revoked this approval. Approve again when you are ready.";
  }

  if (input.authorizationExpired) {
    return "Your approval expired. Approve again to continue.";
  }

  if (input.authorizationActive) {
    return "Approved for this Final Tab.";
  }

  if (!input.settlementContractAddress || !input.tokenReady) {
    return "Settlement is not configured yet.";
  }

  if (!input.settlementAccountReady) {
    return "Preparing settlement. Try again in a moment.";
  }

  if (!input.normalizedAccountWallet) {
    return "We could not load your settlement account. Try again in a moment.";
  }

  return "Only this Final Tab can use this approval.";
}
