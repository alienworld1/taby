import type { EIP1193Provider } from "viem";
import { createSettlementAccountClient, sendDiagnosticBatch } from "@/lib/account/zerodev/browser";
import type { AccountErrorCode, SettlementAccountReadiness } from "@/lib/account/types";

type ZeroDevSafeConfig = {
  accountType: "magic_eoa_7702" | "zerodev_kernel";
  chainId: 421614;
  configHash: string;
  entryPointVersion: string;
  kernelVersion: string;
};

type PrepareSettlementAccountInput = {
  didToken: string;
  magicProvider: EIP1193Provider;
  magicWalletAddress: string;
};

type PrepareSettlementAccountResult =
  | { ok: true; readiness: SettlementAccountReadiness }
  | { code: AccountErrorCode; ok: false; readiness?: SettlementAccountReadiness };

export async function prepareSettlementAccount(
  input: PrepareSettlementAccountInput,
): Promise<PrepareSettlementAccountResult> {
  let config: ZeroDevSafeConfig | null = null;
  let settlementAddress = input.magicWalletAddress;

  try {
    const state = await getSettlementAccountState(input.didToken);

    if (!state.ok) {
      return state;
    }

    const activeConfig = state.config;
    config = activeConfig;

    if (isReadyForWallet(state.readiness, input.magicWalletAddress)) {
      return { ok: true, readiness: state.readiness };
    }

    const settlementClient = await createSettlementAccountClient({
      accountType: activeConfig.accountType,
      didToken: input.didToken,
      magicProvider: input.magicProvider,
      magicWalletAddress: input.magicWalletAddress,
    });
    settlementAddress = settlementClient.settlementAddress;

    await persistReadiness(input.didToken, activeConfig, {
      delegationStatus: "pending",
      paymasterPolicyStatus: "unknown",
      settlementAddress,
      magicWalletAddress: input.magicWalletAddress,
    });

    const receipt = await sendDiagnosticBatch(
      settlementClient.kernelClient,
      async (userOperationHash) => {
          await persistReadiness(input.didToken, activeConfig, {
          delegationStatus: "pending",
          magicWalletAddress: input.magicWalletAddress,
          paymasterPolicyStatus: "unknown",
          settlementAddress,
          userOperationHash,
        });
      },
    );

    const readiness = await persistReadiness(input.didToken, activeConfig, {
      delegationStatus: "ready",
      magicWalletAddress: input.magicWalletAddress,
      paymasterPolicyStatus: "available",
      settlementAddress,
      transactionHash: receipt.transactionHash,
      userOperationHash: receipt.userOperationHash,
    });

    return { ok: true, readiness };
  } catch (error) {
    const code = getPreparationErrorCode(error);
    let failedReadiness: SettlementAccountReadiness | undefined;

    if (config) {
      try {
        failedReadiness = await persistReadiness(input.didToken, config, {
          delegationStatus: "failed",
          lastErrorCode: code,
          magicWalletAddress: input.magicWalletAddress,
          paymasterPolicyStatus: code === "sponsorship_unavailable" ? "rejected" : "unknown",
          settlementAddress,
        });
      } catch {
        // The product remains safely blocked if recording the failure is unavailable.
      }
    }

    return { code, ok: false, readiness: failedReadiness };
  }
}

async function getSettlementAccountState(didToken: string) {
  const response = await fetch("/api/account/settlement-account", {
    headers: { Authorization: `Bearer ${didToken}` },
  });
  const payload = (await response.json()) as {
    code?: AccountErrorCode;
    config?: ZeroDevSafeConfig;
    readiness?: SettlementAccountReadiness | null;
  };

  if (!response.ok || !payload.config) {
    return { code: payload.code ?? "account_unavailable", ok: false as const };
  }

  return {
    config: payload.config,
    ok: true as const,
    readiness: payload.readiness ?? null,
  };
}

async function persistReadiness(
  didToken: string,
  config: ZeroDevSafeConfig,
  input: {
    delegationStatus: SettlementAccountReadiness["delegationStatus"];
    lastErrorCode?: string;
    magicWalletAddress: string;
    paymasterPolicyStatus: SettlementAccountReadiness["paymasterPolicyStatus"];
    settlementAddress: string;
    transactionHash?: string;
    userOperationHash?: string;
  },
) {
  const response = await fetch("/api/account/settlement-account", {
    body: JSON.stringify({
      accountType: config.accountType,
      chainId: config.chainId,
      configHash: config.configHash,
      didToken,
      entryPointVersion: config.entryPointVersion,
      kernelVersion: config.kernelVersion,
      ...input,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as {
    code?: AccountErrorCode;
    readiness?: SettlementAccountReadiness;
  };

  if (!response.ok || !payload.readiness) {
    throw new Error(payload.code ?? "account_unavailable");
  }

  return payload.readiness;
}

function isReadyForWallet(
  readiness: SettlementAccountReadiness | null,
  walletAddress: string,
): readiness is SettlementAccountReadiness {
  return (
    readiness?.delegationStatus === "ready" &&
    readiness.paymasterPolicyStatus === "available" &&
    readiness.magicWalletAddress.toLowerCase() === walletAddress.toLowerCase()
  );
}

function getPreparationErrorCode(error: unknown): AccountErrorCode {
  const message = error instanceof Error ? error.message : String(error);

  if (/paymaster|sponsor|gas policy/i.test(message)) {
    return "sponsorship_unavailable";
  }

  if (/settlement_account_mismatch/.test(message)) {
    return "settlement_account_mismatch";
  }

  if (/zerodev_config_mismatch/.test(message)) {
    return "zerodev_config_mismatch";
  }

  if (/wallet_unavailable/.test(message)) {
    return "wallet_unavailable";
  }

  if (/login_invalid/.test(message)) {
    return "login_invalid";
  }

  return "zerodev_not_ready";
}
