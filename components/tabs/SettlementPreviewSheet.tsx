"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiRefreshCcw } from "react-icons/fi";
import { motion } from "motion/react";
import { SettlementCountdown } from "@/components/tabs/SettlementCountdown";
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
  toTabClientError,
  type TabClientError,
} from "@/lib/tabs/client";
import type {
  SettlementPreviewBlocker,
  SettlementPreviewSnapshot,
  SettlementPreviewThresholdResult,
  TabMemberResponse,
} from "@/lib/tabs/types";

type CountdownStatus = "idle" | "running" | "cancelled" | "invalidated" | "complete";
type ValidationStatus = "idle" | "loading" | "ready" | "blocked" | "error";

type SettlementPreviewSheetProps = {
  getDidToken: () => Promise<string | null>;
  membersById: Map<string, TabMemberResponse>;
  open: boolean;
  proposalHash: string;
  proposalId: string;
  onCountdownActiveChange?: (active: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onRefetch: () => Promise<void> | void;
};

export function SettlementPreviewSheet({
  getDidToken,
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
          </motion.div>
        ) : null}
      </div>
    </Sheet>
  );
}
