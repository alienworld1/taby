import "server-only";

import { createHash } from "node:crypto";
import { type Address, type Hex } from "viem";
import { getZeroDevAccountConfig } from "@/lib/account/zerodev/config";
import { encodeAuthorizeFinalTabBatch } from "@/lib/tabs/contract";
import { TABY_CHAIN_ID, TABY_USDC_ADDRESS } from "@/lib/tabs/constants";

export type DelegatedAuthorizationPolicyInput = {
  exactAmountBaseUnits: bigint;
  expiresAtUnixSeconds: bigint;
  nonce: bigint;
  permissionSignerAddress: Address;
  proposalHash: Hex;
  settlementContractAddress: Address;
  tabKey: Hex;
};

/** Builds the only execution shape a delegated credential may authorize. */
export function buildDelegatedAuthorizationPolicy(input: DelegatedAuthorizationPolicyInput) {
  if (
    input.exactAmountBaseUnits <= BigInt(0) ||
    input.expiresAtUnixSeconds <= BigInt(Math.floor(Date.now() / 1000))
  ) {
    throw new Error("delegated_policy_invalid");
  }

  const calls = encodeAuthorizeFinalTabBatch({
    exactAmountBaseUnits: input.exactAmountBaseUnits.toString(),
    expiresAtUnixSeconds: input.expiresAtUnixSeconds.toString(),
    nonce: input.nonce.toString(),
    proposalHash: input.proposalHash,
    settlementContractAddress: input.settlementContractAddress,
    tabKey: input.tabKey,
    tokenAddress: TABY_USDC_ADDRESS as Address,
  });
  const config = getZeroDevAccountConfig();
  const canonical = JSON.stringify({
    accountType: config.accountType,
    calls: calls.map((call) => ({ data: call.data.toLowerCase(), to: call.to.toLowerCase(), value: "0" })),
    chainId: TABY_CHAIN_ID,
    entryPointVersion: config.entryPointVersion,
    kernelVersion: config.kernelVersion,
    paymasterPolicy: config.paymasterPolicy,
    permissionSignerAddress: input.permissionSignerAddress.toLowerCase(),
    validAfter: Math.floor(Date.now() / 1000),
    validUntil: input.expiresAtUnixSeconds.toString(),
  });

  return {
    calls,
    digest: `0x${createHash("sha256").update(canonical).digest("hex")}` as Hex,
    serialization: JSON.parse(canonical) as Record<string, unknown>,
  };
}
