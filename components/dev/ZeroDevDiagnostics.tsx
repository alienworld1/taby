"use client";

import { useCallback, useMemo, useState } from "react";
import { FiCheckCircle, FiLogIn, FiPlay, FiRefreshCcw, FiXCircle } from "react-icons/fi";
import { useAuth } from "@/components/auth/useAuth";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorCallout } from "@/components/ui/ErrorCallout";
import { ReceiptBlock } from "@/components/ui/ReceiptBlock";
import { StatusChip } from "@/components/ui/StatusChip";
import {
  createSettlementAccountClient,
  sendDiagnosticBatch,
} from "@/lib/account/zerodev/browser";
import type { SettlementAccountReadiness } from "@/lib/account/types";

type ZeroDevSafeConfig = {
  accountType: "magic_eoa_7702" | "zerodev_kernel";
  chain: "arbitrumSepolia";
  chainId: 421614;
  configHash: string;
  entryPointVersion: string;
  kernelVersion: string;
  settlementContractAddress: string;
  tokenAddress: string;
  zeroDevProjectIdHash: string;
};

type DiagnosticsState = "idle" | "loading" | "submitted" | "ready" | "failed";
type SmokeStage =
  | "idle"
  | "loading_config"
  | "creating_account"
  | "persisting_pending"
  | "submitting_user_operation"
  | "waiting_for_receipt"
  | "persisting_ready";

export function ZeroDevDiagnostics() {
  const { account, getDidToken, getWalletProvider, signIn, signOut } = useAuth();
  const [accountLabel, setAccountLabel] = useState("Account A");
  const [config, setConfig] = useState<ZeroDevSafeConfig | null>(null);
  const [readiness, setReadiness] = useState<SettlementAccountReadiness | null>(null);
  const [diagnosticsState, setDiagnosticsState] = useState<DiagnosticsState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [smokeStage, setSmokeStage] = useState<SmokeStage>("idle");

  const addressPreserved = useMemo(() => {
    if (!account || !readiness) {
      return null;
    }

    return account.walletAddress.toLowerCase() === readiness.settlementAddress.toLowerCase();
  }, [account, readiness]);

  const refreshReadiness = useCallback(async () => {
    setError(null);
    const didToken = await getDidToken();

    if (!didToken) {
      setError("Sign in before checking diagnostics.");
      return null;
    }

    const response = await fetch("/api/account/settlement-account", {
      headers: { Authorization: `Bearer ${didToken}` },
    });
    const payload = (await response.json()) as {
      code?: string;
      config?: ZeroDevSafeConfig;
      readiness?: SettlementAccountReadiness | null;
    };

    if (!response.ok || !payload.config) {
      setError(mapDiagnosticsError(payload.code));
      return null;
    }

    setConfig(payload.config);
    setReadiness(payload.readiness ?? null);
    setDiagnosticsState(payload.readiness?.delegationStatus === "ready" ? "ready" : "idle");
    return payload.config;
  }, [getDidToken]);

  async function persistReadiness(input: {
    delegationStatus: SettlementAccountReadiness["delegationStatus"];
    lastErrorCode?: string;
    lastErrorMessage?: string;
    paymasterPolicyStatus?: SettlementAccountReadiness["paymasterPolicyStatus"];
    settlementAddress: string;
    transactionHash?: string;
    userOperationHash?: string;
  }) {
    if (!account || !config) {
      return null;
    }

    const didToken = await getDidToken();

    if (!didToken) {
      throw new Error("login_invalid");
    }

    const response = await fetch("/api/account/settlement-account", {
      body: JSON.stringify({
        accountType: config.accountType,
        chainId: config.chainId,
        configHash: config.configHash,
        delegationStatus: input.delegationStatus,
        didToken,
        entryPointVersion: config.entryPointVersion,
        kernelVersion: config.kernelVersion,
        lastErrorCode: input.lastErrorCode,
        lastErrorMessage: input.lastErrorMessage,
        magicWalletAddress: account.walletAddress,
        paymasterPolicyStatus: input.paymasterPolicyStatus ?? "unknown",
        settlementAddress: input.settlementAddress,
        transactionHash: input.transactionHash,
        userOperationHash: input.userOperationHash,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as {
      code?: string;
      readiness?: SettlementAccountReadiness;
    };

    if (!response.ok || !payload.readiness) {
      throw new Error(payload.code ?? "account_unavailable");
    }

    setReadiness(payload.readiness);
    return payload.readiness;
  }

  async function runSmokeTest() {
    setError(null);
    setDiagnosticsState("loading");
    let currentStage: SmokeStage = "loading_config";
    const advanceStage = (stage: SmokeStage) => {
      currentStage = stage;
      setSmokeStage(stage);
    };

    advanceStage("loading_config");

    try {
      if (!account) {
        await signIn({ redirectToDashboard: false });
        setDiagnosticsState("idle");
        return;
      }

      let activeConfig = config;

      if (!activeConfig) {
        activeConfig = await refreshReadiness();
      }

      if (!activeConfig) {
        throw new Error("zerodev_config_mismatch");
      }

      const didToken = await getDidToken();

      if (!didToken) {
        throw new Error("login_invalid");
      }

      const magicProvider = getWalletProvider();

      if (!magicProvider) {
        throw new Error("wallet_unavailable");
      }

      advanceStage("creating_account");
      const settlementClient = await createSettlementAccountClient({
        accountType: activeConfig.accountType,
        didToken,
        magicProvider,
        magicWalletAddress: account.walletAddress,
      });

      advanceStage("persisting_pending");
      await persistReadiness({
        delegationStatus: "pending",
        paymasterPolicyStatus: "unknown",
        settlementAddress: settlementClient.settlementAddress,
      });

      advanceStage("submitting_user_operation");
      const result = await sendDiagnosticBatch(
        settlementClient.kernelClient,
        async (userOperationHash) => {
          setDiagnosticsState("submitted");
          advanceStage("waiting_for_receipt");
          await persistReadiness({
            delegationStatus: "pending",
            paymasterPolicyStatus: "unknown",
            settlementAddress: settlementClient.settlementAddress,
            userOperationHash,
          });
        },
      );

      advanceStage("persisting_ready");
      await persistReadiness({
        delegationStatus: "ready",
        paymasterPolicyStatus: "available",
        settlementAddress: settlementClient.settlementAddress,
        transactionHash: result.transactionHash,
        userOperationHash: result.userOperationHash,
      });
      setDiagnosticsState("ready");
      advanceStage("idle");
    } catch (caught) {
      const code = mapCaughtError(caught);
      const diagnosticsError = formatDiagnosticsError(code, currentStage, caught);
      setDiagnosticsState("failed");
      setError(diagnosticsError);

      if (account?.walletAddress && config) {
        try {
          await persistReadiness({
            delegationStatus: code === "fallback_required" ? "fallback_required" : "failed",
            lastErrorCode: code,
            lastErrorMessage: diagnosticsError,
            paymasterPolicyStatus:
              code === "sponsorship_unavailable" ? "rejected" : "unknown",
            settlementAddress: readiness?.settlementAddress ?? account.walletAddress,
          });
        } catch {
          setError("The smoke test failed, and we could not save the diagnostic result.");
        }
      }
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-5">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
            Development diagnostics
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Magic to ZeroDev account bridge</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Use two real Magic test users here before Module 14 relies on sponsored account
            execution.
          </p>
        </div>

        {error ? <ErrorCallout title="Diagnostics need attention" message={error} /> : null}

        <Card>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
            <div>
              <label className="text-sm font-semibold" htmlFor="account-label">
                Test account label
              </label>
              <input
                id="account-label"
                className="mt-2 w-full rounded-md border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm outline-none focus:border-primary"
                value={accountLabel}
                onChange={(event) => setAccountLabel(event.target.value)}
              />
              {smokeStage !== "idle" ? (
                <p className="mt-2 text-sm leading-6 text-muted">
                  Current step: {formatSmokeStage(smokeStage)}.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {account ? (
                <Button icon={<FiXCircle aria-hidden="true" />} variant="secondary" onClick={signOut}>
                  Sign out
                </Button>
              ) : (
                <Button
                  icon={<FiLogIn aria-hidden="true" />}
                  onClick={() => signIn({ redirectToDashboard: false })}
                >
                  Sign in
                </Button>
              )}
              <Button
                icon={<FiRefreshCcw aria-hidden="true" />}
                variant="secondary"
                onClick={refreshReadiness}
              >
                Refresh
              </Button>
              <Button
                disabled={diagnosticsState === "loading" || diagnosticsState === "submitted"}
                icon={<FiPlay aria-hidden="true" />}
                onClick={runSmokeTest}
              >
                Run smoke test
              </Button>
            </div>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card tone="soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{accountLabel || "Test account"}</h2>
                <p className="mt-1 text-sm text-muted">Current Magic session</p>
              </div>
              <StatusChip tone={account ? "success" : "pending"}>
                {account ? "Signed in" : "Signed out"}
              </StatusChip>
            </div>
            <div className="mt-4 grid gap-3">
              <ReceiptBlock label="Magic wallet">
                <p className="break-all">{account?.walletAddress ?? "Not connected"}</p>
              </ReceiptBlock>
              <ReceiptBlock label="Settlement address">
                <p className="break-all">{readiness?.settlementAddress ?? "Not initialized"}</p>
              </ReceiptBlock>
              <ReceiptBlock label="Address preserved">
                <p>{addressPreserved === null ? "Not checked" : addressPreserved ? "Yes" : "No"}</p>
              </ReceiptBlock>
            </div>
          </Card>

          <Card tone="soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">Readiness</h2>
                <p className="mt-1 text-sm text-muted">Persisted account execution state</p>
              </div>
              <StatusChip tone={readiness?.delegationStatus === "ready" ? "success" : "pending"}>
                {readiness?.delegationStatus ?? diagnosticsState}
              </StatusChip>
            </div>
            <div className="mt-4 grid gap-3">
              <ReceiptBlock label="Account type">
                <p className="break-all">{readiness?.accountType ?? config?.accountType ?? "Unknown"}</p>
              </ReceiptBlock>
              <ReceiptBlock label="Kernel / EntryPoint">
                <p className="break-all">
                  {(readiness?.kernelVersion ?? config?.kernelVersion ?? "?") +
                    " / " +
                    (readiness?.entryPointVersion ?? config?.entryPointVersion ?? "?")}
                </p>
              </ReceiptBlock>
              <ReceiptBlock label="Config hash">
                <p className="break-all">{readiness?.configHash ?? config?.configHash ?? "Unknown"}</p>
              </ReceiptBlock>
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">UserOperation receipt</h2>
              <p className="mt-1 text-sm text-muted">
                The final transaction hash must resolve before readiness becomes ready.
              </p>
            </div>
            <StatusChip tone={readiness?.lastTransactionHash ? "success" : "neutral"}>
              {readiness?.lastTransactionHash ? (
                <span className="inline-flex items-center gap-1.5">
                  <FiCheckCircle aria-hidden="true" />
                  Resolved
                </span>
              ) : (
                "Pending"
              )}
            </StatusChip>
          </div>
          <div className="mt-4 grid gap-3">
            <ReceiptBlock label="UserOperation hash">
              <p className="break-all">{readiness?.lastUserOperationHash ?? "No hash yet"}</p>
            </ReceiptBlock>
            <ReceiptBlock label="Transaction hash">
              <p className="break-all">{readiness?.lastTransactionHash ?? "No receipt yet"}</p>
            </ReceiptBlock>
            <ReceiptBlock label="Permission compatibility">
              <p>
                Package decision recorded for Module 14.5; no permission credential is stored here.
              </p>
            </ReceiptBlock>
          </div>
        </Card>
      </div>
    </main>
  );
}

function mapCaughtError(caught: unknown) {
  const message = getCaughtMessage(caught);

  if (
    message.includes("signAuthorization") ||
    message.includes("JSON-RPC Accounts") ||
    message.includes('Account type "json-rpc" is not supported')
  ) {
    return "fallback_required";
  }

  if (
    message.includes("paymaster") ||
    message.includes("sponsor") ||
    message.includes("gas policy")
  ) {
    return "sponsorship_unavailable";
  }

  if (message.includes("settlement_account_mismatch")) {
    return "settlement_account_mismatch";
  }

  if (message.includes("zerodev_config_mismatch")) {
    return "zerodev_config_mismatch";
  }

  if (message.includes("User rejected") || message.includes("denied")) {
    return "user_rejected";
  }

  return "zerodev_not_ready";
}

function formatDiagnosticsError(code: string | undefined, stage: SmokeStage, caught: unknown) {
  const base = mapDiagnosticsError(code);
  const detail = sanitizeDiagnosticDetail(getCaughtMessage(caught));

  return detail
    ? `${base} Stage: ${formatSmokeStage(stage)}. Detail: ${detail}`
    : `${base} Stage: ${formatSmokeStage(stage)}.`;
}

function mapDiagnosticsError(code: string | undefined) {
  switch (code) {
    case "wallet_unavailable":
      return "Magic did not return a wallet address for this user.";
    case "settlement_account_mismatch":
      return "The selected EIP-7702 path did not preserve the Magic wallet address.";
    case "zerodev_config_mismatch":
      return "ZeroDev, chain, token, or settlement contract configuration does not match the pinned setup.";
    case "sponsorship_unavailable":
      return "The ZeroDev paymaster rejected the smoke test. Check the Arbitrum Sepolia gas policy.";
    case "fallback_required":
      return "Magic cannot sign the EIP-7702 authorization with this SDK path. Switch diagnostics to the fallback Kernel account path.";
    case "user_rejected":
      return "The Magic signing prompt was cancelled. Nothing was changed.";
    case "login_invalid":
      return "Sign in again before running diagnostics.";
    default:
      return "The account bridge is not ready yet. Check configuration and retry.";
  }
}

function formatSmokeStage(stage: SmokeStage) {
  switch (stage) {
    case "loading_config":
      return "loading server configuration";
    case "creating_account":
      return "creating the ZeroDev account";
    case "persisting_pending":
      return "saving pending readiness";
    case "submitting_user_operation":
      return "submitting the smoke-test UserOperation";
    case "waiting_for_receipt":
      return "waiting for the UserOperation receipt";
    case "persisting_ready":
      return "saving ready status";
    default:
      return "starting diagnostics";
  }
}

function getCaughtMessage(caught: unknown) {
  if (caught instanceof Error) {
    const extra = [
      readStringProperty(caught, "shortMessage"),
      readStringProperty(caught, "details"),
      readStringProperty(caught, "message"),
    ].filter(Boolean);

    return extra.join(" ");
  }

  return String(caught);
}

function readStringProperty(value: object, key: string) {
  const record = value as Record<string, unknown>;
  return typeof record[key] === "string" ? record[key] : null;
}

function sanitizeDiagnosticDetail(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();

  if (!compact || compact === "undefined") {
    return null;
  }

  return compact
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/api\/v3\/[^/\s]+\/chain/g, "api/v3/[redacted]/chain")
    .slice(0, 360);
}
