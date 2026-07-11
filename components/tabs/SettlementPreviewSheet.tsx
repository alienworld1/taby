"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiRefreshCcw } from "react-icons/fi";
import { motion } from "motion/react";
import { createSettlementAccountClient, sendSettlementBatch } from "@/lib/account/zerodev/browser";
import { SettlementCountdown } from "@/components/tabs/SettlementCountdown";
import { SettlementExecutionPanel } from "@/components/tabs/SettlementExecutionPanel";
import { SettlementPreviewActionPanel } from "@/components/tabs/SettlementPreviewActionPanel";
import { SettlementPreviewBlockerPanel } from "@/components/tabs/SettlementPreviewBlockerPanel";
import { SettlementPreviewSafetyChecklist } from "@/components/tabs/SettlementPreviewSafetyChecklist";
import { SettlementPreviewSummary } from "@/components/tabs/SettlementPreviewSummary";
import { SettlementPreviewTechnicalDetails } from "@/components/tabs/SettlementPreviewTechnicalDetails";
import { SettlementPreviewTransferList } from "@/components/tabs/SettlementPreviewTransferList";
import { usePrefersReducedMotion } from "@/components/tabs/usePrefersReducedMotion";
import { Button } from "@/components/ui/Button";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { LoadingState } from "@/components/ui/LoadingState";
import { Sheet } from "@/components/ui/Sheet";
import {
  previewProposalRequest,
  confirmSettlementRequest,
  prepareSettlementRequest,
  reconcileSettlementRequest,
  recordSettlementUserOperationRequest,
  toTabClientError,
  type TabClientError,
} from "@/lib/tabs/client";
import type { Account } from "@/lib/account/types";
import type {
  SettlementBlocker,
  SettlementExecutionResponse,
  SettlementPreviewBlocker,
  SettlementPreviewSnapshot,
  SettlementPreviewThresholdResult,
  TabMemberResponse,
} from "@/lib/tabs/types";
import type { EIP1193Provider } from "viem";

type CountdownStatus = "idle" | "running" | "cancelled" | "invalidated" | "complete";
type ValidationStatus = "idle" | "loading" | "ready" | "blocked" | "error";
type ExecutionStatus =
  | "idle"
  | "preflighting"
  | "ready"
  | "opening_wallet"
  | "submitting"
  | "submitted"
  | "confirming"
  | "verifying"
  | "settled"
  | "retryable_failed"
  | "terminal_failed"
  | "unknown";

type SettlementPreviewSheetProps = {
  account: Account | null;
  getDidToken: () => Promise<string | null>;
  getWalletProvider: () => EIP1193Provider | null;
  membersById: Map<string, TabMemberResponse>;
  open: boolean;
  proposalHash: string;
  proposalId: string;
  onCountdownActiveChange?: (active: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onRefetch: () => Promise<void> | void;
};

function settlementAccountReady(account: Account | null) {
  return (
    account?.settlementAccount?.delegationStatus === "ready" &&
    account.settlementAccount.paymasterPolicyStatus === "available"
  );
}

export function SettlementPreviewSheet({
  account,
  getDidToken,
  getWalletProvider,
  membersById,
  open,
  proposalHash,
  proposalId,
  onCountdownActiveChange,
  onOpenChange,
  onRefetch,
}: SettlementPreviewSheetProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>("idle");
  const [countdownStatus, setCountdownStatus] = useState<CountdownStatus>("idle");
  const [snapshot, setSnapshot] = useState<SettlementPreviewSnapshot | null>(null);
  const [blockers, setBlockers] = useState<SettlementPreviewBlocker[]>([]);
  const [thresholdResult, setThresholdResult] =
    useState<SettlementPreviewThresholdResult | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(5);
  const [countdownEndsAtMs, setCountdownEndsAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [lastError, setLastError] = useState<TabClientError | null>(null);
  const [finalChecking, setFinalChecking] = useState(false);
  const [readyToSettle, setReadyToSettle] = useState(false);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>("idle");
  const [execution, setExecution] = useState<SettlementExecutionResponse | null>(null);
  const [executionBlockers, setExecutionBlockers] = useState<SettlementBlocker[]>([]);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const snapshotHashRef = useRef<string | null>(null);

  const secondsRemaining = useMemo(() => {
    if (!countdownEndsAtMs) {
      return countdownSeconds;
    }

    return Math.max(0, Math.ceil((countdownEndsAtMs - nowMs) / 1000));
  }, [countdownEndsAtMs, countdownSeconds, nowMs]);

  const resetPreview = useCallback(() => {
    setValidationStatus("idle");
    setCountdownStatus("idle");
    setSnapshot(null);
    setBlockers([]);
    setThresholdResult(null);
    setCountdownSeconds(5);
    setCountdownEndsAtMs(null);
    setLastError(null);
    setFinalChecking(false);
    setReadyToSettle(false);
    setExecutionStatus("idle");
    setExecution(null);
    setExecutionBlockers([]);
    setExecutionError(null);
    snapshotHashRef.current = null;
  }, []);

  const requireDidToken = useCallback(async () => {
    const didToken = await getDidToken();

    if (!didToken) {
      throw {
        code: "unauthenticated",
        message: "Sign in to continue.",
      } satisfies TabClientError;
    }

    return didToken;
  }, [getDidToken]);

  const runValidation = useCallback(
    async (
      phase: "open" | "countdown" | "final_precheck",
      options: { quiet?: boolean } = {},
    ) => {
      if (!options.quiet) {
        setValidationStatus("loading");
      }

      setLastError(null);

      try {
        const didToken = await requireDidToken();
        const response = await previewProposalRequest(didToken, proposalId, {
          expectedProposalHash: proposalHash,
          expectedSnapshotHash: snapshotHashRef.current ?? undefined,
          phase,
        });

        snapshotHashRef.current = response.snapshot?.snapshotHash ?? null;
        setSnapshot(response.snapshot);
        setBlockers(response.blockers);
        setThresholdResult(response.thresholdResult);
        setCountdownSeconds(response.countdownSeconds);

        if (response.blockers.length > 0 || !response.snapshot) {
          setCountdownEndsAtMs(null);
          setCountdownStatus(phase === "open" ? "idle" : "invalidated");
          setValidationStatus("blocked");
          setReadyToSettle(false);
          return response;
        }

        setValidationStatus("ready");
        return response;
      } catch (caught) {
        setLastError(toTabClientError(caught));
        setCountdownEndsAtMs(null);
        setCountdownStatus(phase === "open" ? "idle" : "invalidated");
        setValidationStatus("error");
        setReadyToSettle(false);
        return null;
      }
    },
    [proposalHash, proposalId, requireDidToken],
  );

  const runFinalPrecheck = useCallback(async () => {
    setFinalChecking(true);

    const response = await runValidation("final_precheck", { quiet: true });

    setFinalChecking(false);

    if (response?.canStartExecution) {
      setReadyToSettle(true);
      setCountdownStatus("complete");
    }
  }, [runValidation]);

  const applyExecutionResponse = useCallback((response: SettlementExecutionResponse) => {
    setExecution(response);
    setExecutionBlockers(response.blockers);
    setExecutionStatus(response.state === "ready" ? "ready" : response.state);
    setExecutionError(null);
  }, []);

  const handleRefreshStatus = useCallback(async (attemptId?: string) => {
    setExecutionStatus("verifying");
    setExecutionError(null);

    try {
      const didToken = await requireDidToken();
      const response = await reconcileSettlementRequest(didToken, proposalId, {
        attemptId,
      });
      applyExecutionResponse(response);

      if (response.state === "settled") {
        await onRefetch();
      }
    } catch (caught) {
      setExecutionStatus("unknown");
      setExecutionError(toTabClientError(caught).message);
    }
  }, [applyExecutionResponse, onRefetch, proposalId, requireDidToken]);

  const handleSettleTogether = useCallback(async () => {
    setExecutionStatus("preflighting");
    setExecutionBlockers([]);
    setExecutionError(null);

    try {
      const magicProvider = getWalletProvider();
      const settlementAccount = account?.settlementAccount;

      if (!settlementAccountReady(account) || !settlementAccount || !magicProvider) {
        setExecutionStatus("idle");
        setExecutionError("Preparing secure settlement. You will not need gas to continue.");
        return;
      }

      const didToken = await requireDidToken();
      const prepared = await prepareSettlementRequest(didToken, proposalId, {
        expectedProposalHash: proposalHash,
        expectedSnapshotHash: snapshotHashRef.current ?? undefined,
      });
      applyExecutionResponse(prepared);

      if (prepared.blockers.length > 0 || prepared.state !== "ready" || !prepared.calls?.length) {
        return;
      }

      setExecutionStatus("opening_wallet");

      const settlementClient = await createSettlementAccountClient({
        accountType: settlementAccount.accountType,
        didToken,
        magicProvider,
        magicWalletAddress: settlementAccount.magicWalletAddress,
        publicRpcUrl: process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL,
      });

      if (
        settlementClient.settlementAddress.toLowerCase() !==
        settlementAccount.settlementAddress.toLowerCase()
      ) {
        setExecutionStatus("idle");
        setExecutionError("Preparing secure settlement. Refresh your settlement account and try again.");
        return;
      }

      setExecutionStatus("submitting");

      const receipt = await sendSettlementBatch(
        settlementClient.kernelClient,
        prepared.calls,
        async (userOperationHash) => {
          setExecutionStatus("submitted");
          await recordSettlementUserOperationRequest(didToken, proposalId, {
            attemptId: prepared.attempt?.id ?? "",
            userOperationHash,
          });
        },
      );

      setExecutionStatus("confirming");

      const confirmed = await confirmSettlementRequest(didToken, proposalId, {
        attemptId: prepared.attempt?.id ?? "",
        transactionHash: receipt.transactionHash,
        userOperationHash: receipt.userOperationHash,
      });
      applyExecutionResponse(confirmed);

      if (confirmed.state === "settled") {
        await onRefetch();
      }
    } catch (caught) {
      const clientError = toTabClientError(caught);
      const rejected = /cancel|reject|denied/i.test(clientError.message);

      setExecutionStatus(rejected ? "idle" : "unknown");
      setExecutionError(
        rejected
          ? "You cancelled the request. No settlement was sent."
          : clientError.message,
      );
    }
  }, [
    account,
    applyExecutionResponse,
    getWalletProvider,
    onRefetch,
    proposalHash,
    proposalId,
    requireDidToken,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      onCountdownActiveChange?.(open && countdownStatus === "running");
    }, 0);

    return () => {
      window.clearTimeout(timeout);
      onCountdownActiveChange?.(false);
    };
  }, [countdownStatus, onCountdownActiveChange, open]);

  useEffect(() => {
    if (open) {
      void (async () => {
        const response = await runValidation("open");

        if (response?.canStartCountdown) {
          const startedAtMs = Date.now();
          setNowMs(startedAtMs);
          setCountdownStatus("running");
          setCountdownEndsAtMs(startedAtMs + response.countdownSeconds * 1000);
        }
      })();
    }
  }, [open, runValidation]);

  useEffect(() => {
    if (!open || !readyToSettle) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void handleRefreshStatus(execution?.attempt?.id);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [execution?.attempt?.id, handleRefreshStatus, open, readyToSettle]);

  useEffect(() => {
    if (!open || countdownStatus !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      const nextNowMs = Date.now();
      setNowMs(nextNowMs);

      if (countdownEndsAtMs && nextNowMs >= countdownEndsAtMs) {
        setCountdownEndsAtMs(null);
        setCountdownStatus("complete");

        if (!thresholdResult?.requiresExplicitConfirmation) {
          void runFinalPrecheck();
        }
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [
    countdownEndsAtMs,
    countdownStatus,
    open,
    runFinalPrecheck,
    thresholdResult?.requiresExplicitConfirmation,
  ]);

  useEffect(() => {
    if (!open || countdownStatus !== "running") {
      return;
    }

    const interval = window.setInterval(() => {
      void runValidation("countdown", { quiet: true });
    }, 2500);

    return () => window.clearInterval(interval);
  }, [countdownStatus, open, runValidation]);

  function handleCancel() {
    setCountdownEndsAtMs(null);
    setCountdownStatus("cancelled");
    setReadyToSettle(false);
  }

  async function handleRetry() {
    const response = await runValidation("open");
    await onRefetch();

    if (response?.canStartCountdown) {
      const restartedAtMs = Date.now();
      setNowMs(restartedAtMs);
      setCountdownStatus("running");
      setCountdownEndsAtMs(restartedAtMs + response.countdownSeconds * 1000);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && countdownStatus === "running") {
      handleCancel();
    }

    if (!nextOpen) {
      window.setTimeout(resetPreview, 0);
    }

    onOpenChange(nextOpen);
  }

  return (
    <Sheet
      description="You can cancel before settlement starts."
      open={open}
      panelClassName="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
      title="Review settlement"
      onOpenChange={handleOpenChange}
    >
      <div className="grid gap-5">
        {validationStatus === "loading" ? (
          <LoadingState label="Checking settlement" rows={2} />
        ) : null}

        {lastError ? (
          <ErrorCallout
            action={
              <Button
                icon={<FiRefreshCcw aria-hidden="true" />}
                loading={validationStatus === "loading"}
                onClick={() => void handleRetry()}
              >
                Retry
              </Button>
            }
            message={lastError.message}
            title="We could not check settlement."
          />
        ) : null}

        {blockers.length > 0 ? (
          <SettlementPreviewBlockerPanel
            blockers={blockers}
            loading={validationStatus === "loading"}
            onRetry={() => void handleRetry()}
          />
        ) : null}

        {snapshot ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="grid gap-5"
            initial={reducedMotion ? false : { opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.18 }}
          >
            <SettlementPreviewSummary reducedMotion={reducedMotion} snapshot={snapshot} />
            {countdownStatus === "running" ? (
              <SettlementCountdown
                durationSeconds={countdownSeconds}
                reducedMotion={reducedMotion}
                secondsRemaining={secondsRemaining}
              />
            ) : null}
            <SettlementPreviewSafetyChecklist reducedMotion={reducedMotion} />
            <SettlementPreviewTransferList
              membersById={membersById}
              reducedMotion={reducedMotion}
              snapshot={snapshot}
            />
            <SettlementPreviewTechnicalDetails snapshot={snapshot} />
            <SettlementPreviewActionPanel
              countdownStatus={countdownStatus}
              finalChecking={finalChecking}
              readyToSettle={readyToSettle}
              reducedMotion={reducedMotion}
              thresholdResult={thresholdResult}
              onCancel={handleCancel}
              onConfirm={() => void runFinalPrecheck()}
            />
            {readyToSettle ? (
              <SettlementExecutionPanel
                blockers={executionBlockers}
                errorMessage={executionError}
                reducedMotion={reducedMotion}
                state={executionStatus}
                transferCount={snapshot.transfers.length}
                onRefreshStatus={() => void handleRefreshStatus(execution?.attempt?.id)}
                onSettle={() => void handleSettleTogether()}
              />
            ) : null}
          </motion.div>
        ) : null}
      </div>
    </Sheet>
  );
}
