"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FiCheckCircle, FiRefreshCcw, FiShield, FiUnlock } from "react-icons/fi";
import { AuthorizationDetailRows } from "@/components/tabs/AuthorizationDetailRows";
import {
  decodeUint256,
  encodeAllowanceCall,
  encodeApproveCall,
  encodeBalanceCall,
  getAuthorizationStatus,
  isGasError,
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
import {
  recordAuthorizationRequest,
  revokeAuthorizationRequest,
  toTabClientError,
  type TabClientError,
} from "@/lib/tabs/client";
import type {
  TabAuthorizationResponse,
  TabDetailResponse,
  TabMemberResponse,
} from "@/lib/tabs/types";

type WalletRequest = <T = unknown>(payload: {
  method: string;
  params?: unknown[];
}) => Promise<T>;

type AuthorizationSheetProps = {
  authorization: TabAuthorizationResponse | null;
  capBaseUnits: string;
  currentMember: TabMemberResponse;
  expiresAt: string;
  getDidToken: () => Promise<string | null>;
  maxSingleSettlementBaseUnits: string;
  onOpenChange: (open: boolean) => void;
  onRefetch: () => Promise<void> | void;
  open: boolean;
  owedBaseUnits: string;
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
  authorization,
  capBaseUnits,
  currentMember,
  expiresAt,
  getDidToken,
  maxSingleSettlementBaseUnits,
  onOpenChange,
  onRefetch,
  open,
  owedBaseUnits,
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

  async function handleAuthorize() {
    setError(null);
    setActionState("opening_wallet");

    let txHash: string;

    try {
      setActionState("authorizing");
      txHash = await requestWallet<string>({
        method: "eth_sendTransaction",
        params: [
          {
            data: encodeApproveCall(settlementContractAddress, capBaseUnits),
            from: walletAddress,
            to: tab.tokenAddress,
          },
        ],
      });
    } catch (caught) {
      setError({
        code: "database_unavailable",
        message: isUserRejectedError(caught)
          ? "You cancelled the wallet request. No authorization was made."
          : isGasError(caught)
            ? "Your wallet needs a little Arbitrum Sepolia ETH to send this transaction."
            : "We could not reach Arbitrum Sepolia. Try again.",
      });
      setActionState("idle");
      return;
    }

    try {
      setActionState("recording");
      const didToken = await requireDidToken();
      await recordAuthorizationRequest(didToken, tab.id, {
        allowanceTxHash: txHash,
        authorizationMethod: "erc20_allowance",
        capBaseUnits,
        expiresAt,
        maxSingleSettlementBaseUnits,
        memberId: currentMember.id,
        settlementContractAddress,
        tokenAddress: tab.tokenAddress,
        walletAddress,
      });
      await onRefetch();
      handleOpenChange(false);
    } catch (caught) {
      const clientError = toTabClientError(caught);
      setError({
        ...clientError,
        message:
          clientError.code === "database_unavailable"
            ? "The wallet request was sent, but we could not save the authorization. Refresh status before trying again."
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

    let txHash: string | null = null;

    try {
      if (!allowanceRead || BigInt(allowanceRead.allowanceBaseUnits) > BigInt(0)) {
        txHash = await requestWallet<string>({
          method: "eth_sendTransaction",
          params: [
            {
              data: encodeApproveCall(settlementContractAddress, "0"),
              from: walletAddress,
              to: tab.tokenAddress,
            },
          ],
        });
      }

      const didToken = await requireDidToken();
      await revokeAuthorizationRequest(didToken, authorization.id, { revokeTxHash: txHash });
      setConfirmingRevoke(false);
      await onRefetch();
      handleOpenChange(false);
    } catch (caught) {
      setError({
        code: "database_unavailable",
        message: isUserRejectedError(caught)
          ? "You cancelled the wallet request. No authorization was made."
          : isGasError(caught)
            ? "Your wallet needs a little Arbitrum Sepolia ETH to send this transaction."
            : "We could not revoke authorization. Try again.",
      });
    } finally {
      setActionState("idle");
    }
  }

  return (
    <Sheet
      description="Review the cap, expiry, and tab scope before granting permission."
      open={open}
      title="Authorize your share"
      onOpenChange={handleOpenChange}
    >
      <div className="grid gap-5">
        {status === "authorized" ? (
          <div className="flex items-start gap-3 rounded-md border border-primary-fixed bg-primary-soft px-4 py-3 text-primary-strong">
            <FiCheckCircle aria-hidden="true" className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">You are authorized for this Final Tab.</p>
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
            Current wallet permission: {formatUsdc(allowanceRead.allowanceBaseUnits)}
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
              Revoke authorization for this tab?
            </p>
            <p className="text-sm leading-6 text-secondary">
              Settlement will pause for your share until you authorize again.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                loading={actionState === "revoking"}
                variant="danger"
                onClick={() => void handleRevoke()}
              >
                Revoke authorization
              </Button>
              <Button
                disabled={isBusy}
                variant="secondary"
                onClick={() => setConfirmingRevoke(false)}
              >
                Keep authorization
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
                Revoke authorization
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
                {actionState === "recording" ? "Recording authorization" : "Authorize settlement"}
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
