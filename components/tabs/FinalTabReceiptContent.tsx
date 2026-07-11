"use client";

import { useCallback, useEffect, useState } from "react";
import { FiArrowLeft, FiFileText, FiRefreshCcw } from "react-icons/fi";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { useAuth } from "@/components/auth/useAuth";
import { FinalTabReceipt } from "@/components/tabs/FinalTabReceipt";
import { Button } from "@/components/ui/Button";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { LoadingState } from "@/components/ui/LoadingState";
import { fetchFinalTabReceipt, toTabClientError, type TabClientError } from "@/lib/tabs/client";
import type { FinalTabReceiptResponse } from "@/lib/tabs/types";

type FinalTabReceiptContentProps = {
  tabId: string;
};

function isAccessError(error: TabClientError | null) {
  return error?.code === "not_found" || error?.code === "validation_failed";
}

function stateTitle(status: Exclude<FinalTabReceiptResponse["status"], "confirmed">) {
  switch (status) {
    case "pending":
      return "Settlement is still confirming";
    case "failed":
      return "No receipt yet";
    case "reconciliation_needed":
      return "We are still verifying this receipt";
    case "inaccessible":
      return "We couldn't find that receipt";
    case "empty":
    default:
      return "No receipt yet";
  }
}

export function FinalTabReceiptContent({ tabId }: FinalTabReceiptContentProps) {
  const { getDidToken, status } = useAuth();
  const [receipt, setReceipt] = useState<FinalTabReceiptResponse | null>(null);
  const [fetchError, setFetchError] = useState<TabClientError | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReceipt = useCallback(async () => {
    if (status !== "signedIn") {
      return;
    }

    setLoading(true);
    setFetchError(null);

    const didToken = await getDidToken();

    if (!didToken) {
      setFetchError({
        code: "unauthenticated",
        message: "Sign in to view this receipt.",
      });
      setLoading(false);
      return;
    }

    try {
      setReceipt(await fetchFinalTabReceipt(didToken, tabId));
    } catch (error) {
      setFetchError(toTabClientError(error));
    } finally {
      setLoading(false);
    }
  }, [getDidToken, status, tabId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadReceipt();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [loadReceipt]);

  if (status === "initializing" || status === "onboarding") {
    return <LoadingState label="Opening receipt" rows={4} />;
  }

  if (status !== "signedIn") {
    return (
      <SignInPrompt
        description="Sign in to view this receipt."
        title="Sign in to view this receipt."
      />
    );
  }

  if (loading && !receipt) {
    return <LoadingState label="Opening receipt" rows={4} />;
  }

  if (isAccessError(fetchError)) {
    return (
      <EmptyState
        description="The receipt may belong to another tab or another account."
        icon={<FiFileText aria-hidden="true" />}
        title="We couldn't find that receipt"
      />
    );
  }

  if (fetchError && !receipt) {
    return (
      <ErrorCallout
        action={
          <Button icon={<FiRefreshCcw aria-hidden="true" />} onClick={loadReceipt}>
            Try again
          </Button>
        }
        message={fetchError.message}
        title="We couldn't open this receipt"
      />
    );
  }

  if (!receipt) {
    return <LoadingState label="Opening receipt" rows={4} />;
  }

  if (receipt.status === "confirmed") {
    return <FinalTabReceipt receipt={receipt} />;
  }

  return (
    <EmptyState
      action={
        <div className="grid gap-2 sm:flex sm:justify-center">
          <ButtonLink
            href={`/tabs/${tabId}`}
            icon={<FiArrowLeft aria-hidden="true" />}
            variant="secondary"
          >
            Back to tab
          </ButtonLink>
          {receipt.status === "pending" || receipt.status === "reconciliation_needed" ? (
            <Button
              icon={<FiRefreshCcw aria-hidden="true" />}
              loading={loading}
              onClick={loadReceipt}
              variant="secondary"
            >
              Refresh status
            </Button>
          ) : null}
        </div>
      }
      description={receipt.message}
      icon={<FiFileText aria-hidden="true" />}
      title={stateTitle(receipt.status)}
    />
  );
}
