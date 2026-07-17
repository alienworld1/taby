"use client";

import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
  getUserOperationGasPrice,
  type KernelSmartAccountImplementation,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_3 } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { arbitrumSepolia } from "viem/chains";
import { createPublicClient, encodeFunctionData, erc20Abi, http, zeroAddress, type EIP1193Provider } from "viem";
import type { SmartAccount } from "viem/account-abstraction";
import {
  PUBLIC_ZERODEV_ENTRY_POINT_VERSION,
  PUBLIC_ZERODEV_KERNEL_VERSION,
  PUBLIC_ZERODEV_RPC_PROXY_PATH,
} from "@/lib/account/zerodev/public-config";
import type { SettlementAccountType } from "@/lib/account/types";
import { TABY_USDC_ADDRESS } from "@/lib/tabs/constants";

type CreateSettlementAccountClientInput = {
  accountType: SettlementAccountType;
  didToken: string;
  magicProvider: EIP1193Provider;
  magicWalletAddress: string;
  publicRpcUrl?: string | null;
};

type SettlementAccountClient = {
  accountType: SettlementAccountType;
  entryPointVersion: typeof PUBLIC_ZERODEV_ENTRY_POINT_VERSION;
  kernelClient: ReturnType<typeof createKernelAccountClient>;
  kernelVersion: typeof PUBLIC_ZERODEV_KERNEL_VERSION;
  settlementAddress: string;
};

export type SettlementEncodedCall = {
  data: `0x${string}`;
  to: `0x${string}`;
  value?: bigint | number | string;
};

export async function createSettlementAccountClient({
  accountType,
  didToken,
  magicProvider,
  magicWalletAddress,
  publicRpcUrl,
}: CreateSettlementAccountClientInput): Promise<SettlementAccountClient> {
  if (!didToken) {
    throw new Error("zerodev_config_mismatch");
  }

  const zeroDevTransport = http(PUBLIC_ZERODEV_RPC_PROXY_PATH, {
    fetchOptions: {
      headers: {
        Authorization: `Bearer ${didToken}`,
      },
    },
  });
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(publicRpcUrl ?? process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL),
  });
  const entryPoint = getEntryPoint(PUBLIC_ZERODEV_ENTRY_POINT_VERSION);
  const kernelVersion = KERNEL_V3_3;
  const account =
    accountType === "magic_eoa_7702"
      ? await createKernelAccount(publicClient, {
          eip7702Account: magicProvider,
          entryPoint,
          kernelVersion,
        })
      : await createFallbackKernelAccount({
          entryPoint,
          kernelVersion,
          magicProvider,
          publicClient,
        });
  const settlementAddress = account.address.toLowerCase();

  if (
    accountType === "magic_eoa_7702" &&
    settlementAddress !== magicWalletAddress.toLowerCase()
  ) {
    throw new Error("settlement_account_mismatch");
  }

  const paymasterClient = createZeroDevPaymasterClient({
    chain: arbitrumSepolia,
    transport: zeroDevTransport,
  });
  const kernelClient = createKernelAccountClient({
    account,
    bundlerTransport: zeroDevTransport,
    chain: arbitrumSepolia,
    client: publicClient,
    paymaster: {
      getPaymasterData: (userOperation) =>
        paymasterClient.sponsorUserOperation({ userOperation }),
    },
    userOperation: {
      estimateFeesPerGas: async ({ bundlerClient }) =>
        getUserOperationGasPrice(bundlerClient),
    },
  });

  return {
    accountType,
    entryPointVersion: PUBLIC_ZERODEV_ENTRY_POINT_VERSION,
    kernelClient,
    kernelVersion: PUBLIC_ZERODEV_KERNEL_VERSION,
    settlementAddress,
  };
}

export async function sendDiagnosticBatch(
  kernelClient: SettlementAccountClient["kernelClient"],
  onSubmitted?: (userOperationHash: string) => Promise<void> | void,
) {
  if (!kernelClient.account) {
    throw new Error("account_unavailable");
  }

  const userOperationHash = await kernelClient.sendUserOperation({
    callData: await kernelClient.account.encodeCalls([
      {
        data: "0x",
        to: zeroAddress,
        value: BigInt(0),
      },
      {
        data: "0x",
        to: zeroAddress,
        value: BigInt(0),
      },
    ]),
  });
  await onSubmitted?.(userOperationHash);
  const receipt = await kernelClient.waitForUserOperationReceipt({
    hash: userOperationHash,
    timeout: 90_000,
  });

  return {
    transactionHash: receipt.receipt.transactionHash,
    userOperationHash,
  };
}

export async function sendSettlementBatch(
  kernelClient: SettlementAccountClient["kernelClient"],
  calls: SettlementEncodedCall[],
  onSubmitted?: (userOperationHash: string) => Promise<void> | void,
) {
  if (!kernelClient.account) {
    throw new Error("account_unavailable");
  }

  let userOperationHash: `0x${string}`;

  try {
    userOperationHash = await kernelClient.sendUserOperation({
      callData: await kernelClient.account.encodeCalls(
        calls.map((call) => ({
          data: call.data,
          to: call.to,
          value: BigInt(call.value ?? 0),
        })),
      ),
    });
  } catch (error) {
    throw normalizeSettlementBatchError(error);
  }

  await onSubmitted?.(userOperationHash);

  let receipt: Awaited<ReturnType<typeof kernelClient.waitForUserOperationReceipt>>;

  try {
    receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOperationHash,
      timeout: 90_000,
    });
  } catch (error) {
    throw normalizeSettlementBatchError(error);
  }

  return {
    transactionHash: receipt.receipt.transactionHash,
    userOperationHash,
  };
}

export async function sendSponsoredUsdcWithdrawal(
  kernelClient: SettlementAccountClient["kernelClient"],
  input: { amountBaseUnits: bigint; recipientAddress: `0x${string}` },
  onSubmitted?: (userOperationHash: string) => Promise<void> | void,
) {
  return sendSettlementBatch(
    kernelClient,
    [{
      data: encodeFunctionData({
        abi: erc20Abi,
        args: [input.recipientAddress, input.amountBaseUnits],
        functionName: "transfer",
      }),
      to: TABY_USDC_ADDRESS,
    }],
    onSubmitted,
  );
}

function normalizeSettlementBatchError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const revertData = message.match(/0x[a-fA-F0-9]{8,}/)?.[0] ?? "";
  const selector = revertData.slice(0, 10).toLowerCase();
  const normalized = new Error(
    selector === "0xdb111a96"
      ? "This Final Tab is no longer active. Refresh status."
      : selector === "0x9f4b444f"
        ? "This Final Tab is already registered. Refresh status."
        : /revert|execution|simulation/i.test(message)
      ? "Approval did not go through. Nothing changed. Try again."
      : /sponsor|paymaster|gas/i.test(message)
        ? "Settlement is not available right now. Try again in a moment."
        : "We could not confirm the settlement request. Try again.",
  );

  return normalized;
}

async function createFallbackKernelAccount(input: {
  entryPoint: ReturnType<typeof getEntryPoint<"0.7">>;
  kernelVersion: typeof KERNEL_V3_3;
  magicProvider: EIP1193Provider;
  publicClient: KernelSmartAccountImplementation["client"];
}): Promise<SmartAccount> {
  const ecdsaValidator = await signerToEcdsaValidator(input.publicClient, {
    entryPoint: input.entryPoint,
    kernelVersion: input.kernelVersion,
    signer: input.magicProvider,
  });

  return createKernelAccount(input.publicClient, {
    entryPoint: input.entryPoint,
    kernelVersion: input.kernelVersion,
    plugins: {
      sudo: ecdsaValidator,
    },
  });
}
