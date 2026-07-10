import { createHash } from "node:crypto";
import { TABY_CHAIN_ID, TABY_USDC_ADDRESS, getSettlementContractAddress } from "@/lib/tabs/constants";
import type { SettlementAccountType } from "@/lib/account/types";
import {
  PUBLIC_ZERODEV_CHAIN_NAME,
  PUBLIC_ZERODEV_ENTRY_POINT_VERSION,
  PUBLIC_ZERODEV_KERNEL_VERSION,
} from "@/lib/account/zerodev/public-config";

export const ZERODEV_CHAIN_NAME = PUBLIC_ZERODEV_CHAIN_NAME;
export const ZERODEV_KERNEL_VERSION = PUBLIC_ZERODEV_KERNEL_VERSION;
export const ZERODEV_ENTRY_POINT_VERSION = PUBLIC_ZERODEV_ENTRY_POINT_VERSION;
export const ZERODEV_SELECTED_ACCOUNT_TYPE: SettlementAccountType =
  process.env.ZERODEV_ACCOUNT_TYPE === "zerodev_kernel"
    ? "zerodev_kernel"
    : "magic_eoa_7702";

export type ZeroDevAccountConfig = {
  accountType: SettlementAccountType;
  chain: typeof ZERODEV_CHAIN_NAME;
  chainId: typeof TABY_CHAIN_ID;
  configHash: string;
  entryPointVersion: typeof ZERODEV_ENTRY_POINT_VERSION;
  kernelVersion: typeof ZERODEV_KERNEL_VERSION;
  paymasterPolicy: string | null;
  settlementContractAddress: string;
  tokenAddress: typeof TABY_USDC_ADDRESS;
  zeroDevProjectIdHash: string;
};

export function getServerZeroDevRpcUrl() {
  const explicit = process.env.ZERODEV_RPC_URL;

  if (explicit) {
    return explicit;
  }

  const projectId = process.env.ZERODEV_PROJECT_ID;

  if (!projectId) {
    return null;
  }

  return `https://rpc.zerodev.app/api/v3/${projectId}/chain/${TABY_CHAIN_ID}`;
}

export function getZeroDevProjectIdHash() {
  const projectIdentity =
    process.env.ZERODEV_PROJECT_ID ??
    process.env.ZERODEV_RPC_URL ??
    "missing";

  return sha256(projectIdentity);
}

export function getZeroDevAccountConfig(): ZeroDevAccountConfig {
  const settlementContractAddress = getSettlementContractAddress().toLowerCase();
  const zeroDevProjectIdHash = getZeroDevProjectIdHash();
  const paymasterPolicy = process.env.ZERODEV_PAYMASTER_POLICY_ID ?? null;
  const configHash = sha256(
    JSON.stringify({
      accountType: ZERODEV_SELECTED_ACCOUNT_TYPE,
      chainId: TABY_CHAIN_ID,
      entryPointVersion: ZERODEV_ENTRY_POINT_VERSION,
      kernelVersion: ZERODEV_KERNEL_VERSION,
      paymasterPolicy,
      settlementContractAddress,
      tokenAddress: TABY_USDC_ADDRESS.toLowerCase(),
      zeroDevProjectIdHash,
    }),
  );

  return {
    accountType: ZERODEV_SELECTED_ACCOUNT_TYPE,
    chain: ZERODEV_CHAIN_NAME,
    chainId: TABY_CHAIN_ID,
    configHash,
    entryPointVersion: ZERODEV_ENTRY_POINT_VERSION,
    kernelVersion: ZERODEV_KERNEL_VERSION,
    paymasterPolicy,
    settlementContractAddress,
    tokenAddress: TABY_USDC_ADDRESS,
    zeroDevProjectIdHash,
  };
}

export function assertZeroDevServerConfig() {
  const config = getZeroDevAccountConfig();
  const hasRpc = Boolean(getServerZeroDevRpcUrl());

  if (!hasRpc) {
    throw new Error("ZeroDev RPC configuration is missing.");
  }

  if (config.accountType === "zerodev_kernel" && process.env.ZERODEV_ALLOW_KERNEL_FALLBACK !== "true") {
    throw new Error("Kernel fallback requires an explicit engineering decision.");
  }

  return config;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
