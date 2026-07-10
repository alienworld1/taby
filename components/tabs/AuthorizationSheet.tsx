"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiRefreshCcw, FiShield, FiUnlock } from "react-icons/fi";
import { AuthorizationDetailRows } from "@/components/tabs/AuthorizationDetailRows";
import {
  decodeUint256,
  encodeAllowanceCall,
  encodeBalanceCall,
  getAuthorizationStatus,
  isUserRejectedError,
  type AllowanceRead,
  type AuthorizationStatusValue,
} from "@/components/tabs/authorizationUtils";
import { formatUsdc } from "@/lib/tabs/money";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { Sheet } from "@/components/ui/Sheet";
import { StatusChip } from "@/components/ui/StatusChip";
import { useNowMs } from "@/components/tabs/useNowMs";
import { createSettlementAccountClient, sendSettlementBatch } from "@/lib/account/zerodev/browser";
import {
  prepareAuthorizationRequest,
  prepareRevokeAuthorizationRequest,
  recordAuthorizationRequest,
  revokeAuthorizationRequest,
  toTabClientError,
  type TabClientError,
} from "@/lib/tabs/client";
import type {
  SettlementProposalResponse,
  TabAuthorizationResponse,
  TabDetailResponse,
  TabMemberResponse,
} from "@/lib/tabs/types";
import type { SettlementAccountType } from "@/lib/account/types";
import type { EIP1193Provider } from "viem";

type WalletRequest = <T = unknown>(payload: {
  method: string;
  params?: unknown[];
}) => Promise<T>;

type AuthorizationSheetProps = {
  accountType: SettlementAccountType;
  authorization: TabAuthorizationResponse | null;
  capBaseUnits: string;
  currentMember: TabMemberResponse;
  expiresAt: string;
  getDidToken: () => Promise<string | null>;
  getWalletProvider: () => EIP1193Provider | null;
  magicWalletAddress: string;
  maxSingleSettlementBaseUnits: string;
  onOpenChange: (open: boolean) => void;
  onRefetch: () => Promise<void> | void;
  open: boolean;
  owedBaseUnits: string;
  proposal: SettlementProposalResponse;
  requestWallet: WalletRequest;
  settlementContractAddress: string;
  tab: TabDetailResponse["tab"];
  walletAddress: string;
};

type ActionState =
  | "idle"
  | "checking"
  | "opening_wallet"
  | "authorizing"
  | "recording"
  | "revoking";

export function AuthorizationSheet({
  accountType,
  authorization,
  capBaseUnits,
  currentMember,
  expiresAt,
  getDidToken,
  getWalletProvider,
  magicWalletAddress,
  maxSingleSettlementBaseUnits,
  onOpenChange,
  onRefetch,
  open,
  owedBaseUnits,
  proposal,
  requestWallet,
  settlementContractAddress,
  tab,
  walletAddress,
}: AuthorizationSheetProps) {
  const [actionState, setActionState] = useState<ActionState>("idle");
  const [allowanceRead, setAllowanceRead] = useState<AllowanceRead | null>(null);
  const [error, setError] = useState<TabClientError | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const nowMs = useNowMs();

  const status = useMemo<AuthorizationStatusValue>(
    () =>
      getAuthorizationStatus({
        allowanceBaseUnits: allowanceRead?.allowanceBaseUnits ?? null,
        authorization,
        nowMs,
        owedBaseUnits: BigInt(owedBaseUnits),
      }),
    [allowanceRead?.allowanceBaseUnits, authorization, nowMs, owedBaseUnits],
  );
  const balanceLow =
    allowanceRead?.balanceBaseUnits !== null &&
    allowanceRead?.balanceBaseUnits !== undefined &&
    BigInt(allowanceRead.balanceBaseUnits) < BigInt(owedBaseUnits);
  const isBusy = actionState !== "idle";

  const checkAllowance = useCallback(async () => {
    setActionState("checking");
    setError(null);

    try {
      const [allowanceHex, balanceHex] = await Promise.all([
        requestWallet<string>({
          method: "eth_call",
          params: [
            {
              data: encodeAllowanceCall(walletAddress, settlementContractAddress),
              to: tab.tokenAddress,
            },
            "latest",
          ],
        }),
        requestWallet<string>({
          method: "eth_call",
          params: [
            {
              data: encodeBalanceCall(walletAddress),
              to: tab.tokenAddress,
            },
            "latest",
          ],
        }),
      ]);

      setAllowanceRead({
        allowanceBaseUnits: decodeUint256(allowanceHex),
        balanceBaseUnits: decodeUint256(balanceHex),
        checkedAt: Date.now(),
      });
    } catch {
      setError({
        code: "database_unavailable",
        message: "We could not reach Arbitrum Sepolia. Try again.",
      });
    } finally {
      setActionState("idle");
    }
  }, [requestWallet, settlementContractAddress, tab.tokenAddress, walletAddress]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void checkAllowance();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [checkAllowance, open]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setConfirmingRevoke(false);
      setError(null);
    }

    onOpenChange(nextOpen);
  }

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

  async function createZeroDevClient(didToken: string) {
    const magicProvider = getWalletProvider();

    if (!magicProvider) {
      throw {
        code: "account_unavailable",
        message: "Preparing secure settlement. You will not need gas to continue.",
      } satisfies TabClientError;
    }

    const settlementClient = await createSettlementAccountClient({
      accountType,
      didToken,
      magicProvider,
      magicWalletAddress,
      publicRpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL,
    });

    if (settlementClient.settlementAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      throw {
        code: "account_unavailable",
        message: "Preparing secure settlement. Refresh your settlement account and try again.",
      } satisfies TabClientError;
    }

    return settlementClient;
  }

  async function handleAuthorize() {
    setError(null);
    setActionState("opening_wallet");

    try {
      const didToken = await requireDidToken();
      const prepared = await prepareAuthorizationRequest(didToken, tab.id, {
        memberId: currentMember.id,
        proposalHash: proposal.proposalHash,
        proposalId: proposal.id,
      });
      const settlementClient = await createZeroDevClient(didToken);

      setActionState("authorizing");
      const receipt = await sendSettlementBatch(settlementClient.kernelClient, prepared.calls);
      setActionState("recording");
      await recordAuthorizationRequest(didToken, tab.id, {
        action: "confirm",
        authorizationNonce: prepared.nonce ?? "",
        exactAmountBaseUnits: prepared.expectedAmountBaseUnits ?? owedBaseUnits,
        memberId: currentMember.id,
        proposalHash: proposal.proposalHash,
        proposalId: proposal.id,
        transactionHash: receipt.transactionHash,
        userOperationHash: receipt.userOperationHash,
      });
      await onRefetch();
      handleOpenChange(false);
    } catch (caught) {
      const clientError = isUserRejectedError(caught)
        ? ({
            code: "database_unavailable",
            message: "You cancelled the request. No approval was made.",
          } satisfies TabClientError)
        : toTabClientError(caught);
      setError({
        ...clientError,
        message:
          clientError.code === "database_unavailable"
            ? "Approval did not go through. Nothing changed. Try again."
            : clientError.message,
      });
    } finally {
      setActionState("idle");
    }
  }

  async function handleRevoke() {
    if (!authorization) {
      return;
    }

    setError(null);
    setActionState("revoking");

    try {
      const didToken = await requireDidToken();
      const prepared = await prepareRevokeAuthorizationRequest(didToken, authorization.id);
      const settlementClient = await createZeroDevClient(didToken);
      const receipt = await sendSettlementBatch(settlementClient.kernelClient, prepared.calls);
      await revokeAuthorizationRequest(didToken, authorization.id, {
        action: "confirm",
        transactionHash: receipt.transactionHash,
        userOperationHash: receipt.userOperationHash,
      });
      setConfirmingRevoke(false);
      await onRefetch();
      handleOpenChange(false);
    } catch (caught) {
      setError({
        code: "database_unavailable",
        message: isUserRejectedError(caught)
          ? "You cancelled the request. No approval was made."
          : "Approval did not go through. Nothing changed. Try again.",
      });
    } finally {
      setActionState("idle");
    }
  }

  return (
    <Sheet
      description="Review the amount, expiry, and Final Tab scope before approving."
      open={open}
      title="Approve your share"
      onOpenChange={handleOpenChange}
    >
      <div className="grid gap-5">
        {status === "authorized" ? (
          <div className="flex items-start gap-3 rounded-md border border-primary-fixed bg-primary-soft px-4 py-3 text-primary-strong">
            <FiCheckCircle aria-hidden="true" className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">Approved for this Final Tab</p>
              <p className="mt-1 text-sm leading-6">
                Your wallet needs enough USDC before settlement can finish.
              </p>
            </div>
          </div>
        ) : null}

        {balanceLow ? (
          <div className="rounded-md border border-outline-variant bg-surface-container-low px-3 py-2 text-sm leading-6 text-muted">
            Your wallet needs enough USDC before settlement can finish.
          </div>
        ) : null}

        <AuthorizationDetailRows
          authorization={authorization}
          capBaseUnits={authorization?.capBaseUnits ?? capBaseUnits}
          expiresAt={authorization?.expiresAt ?? expiresAt}
          maxSingleSettlementBaseUnits={
            authorization?.maxSingleSettlementBaseUnits ?? maxSingleSettlementBaseUnits
          }
          owedBaseUnits={owedBaseUnits}
          settlementContractAddress={settlementContractAddress}
          tabTitle={tab.title}
          tokenAddress={tab.tokenAddress}
        />

        {allowanceRead ? (
          <p className="text-xs leading-5 text-muted">
            Current approved amount: {formatUsdc(allowanceRead.allowanceBaseUnits)}
          </p>
        ) : (
          <StatusChip tone="pending">Checking permission</StatusChip>
        )}

        {error ? (
          <ErrorCallout
            action={
              <Button
                icon={<FiRefreshCcw aria-hidden="true" />}
                variant="secondary"
                onClick={() => void checkAllowance()}
              >
                Try again
              </Button>
            }
            message={error.message}
          />
        ) : null}

        {confirmingRevoke ? (
          <div className="grid gap-3 rounded-md border border-outline-variant bg-secondary-soft p-4">
            <p className="text-sm font-semibold text-secondary">
              Revoke approval for this Final Tab?
            </p>
            <p className="text-sm leading-6 text-secondary">
              Settlement will pause for your share until you approve again.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                loading={actionState === "revoking"}
                variant="danger"
                onClick={() => void handleRevoke()}
              >
                Revoke approval
              </Button>
              <Button
                disabled={isBusy}
                variant="secondary"
                onClick={() => setConfirmingRevoke(false)}
              >
                Keep approval
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            {status === "authorized" ? (
              <Button
                icon={<FiUnlock aria-hidden="true" />}
                variant="secondary"
                onClick={() => setConfirmingRevoke(true)}
              >
                Revoke approval
              </Button>
            ) : (
              <Button
                icon={<FiShield aria-hidden="true" />}
                loading={
                  actionState === "opening_wallet" ||
                  actionState === "authorizing" ||
                  actionState === "recording"
                }
                onClick={() => void handleAuthorize()}
              >
                {actionState === "recording" ? "Recording approval" : "Approve this Final Tab"}
              </Button>
            )}
            <Button
              icon={<FiRefreshCcw aria-hidden="true" />}
              loading={actionState === "checking"}
              variant="secondary"
              onClick={() => void checkAllowance()}
            >
              Refresh status
            </Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
