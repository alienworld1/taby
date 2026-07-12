import { and, eq, gt, ne, sql } from "drizzle-orm";
import { createPublicClient, decodeEventLog, erc20Abi, http } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { getDb } from "@/lib/db/client";
import {
  settlementProposals,
  tabMembers,
  userOperationRecords,
  userSettlementAccounts,
  withdrawalTransactions,
} from "@/lib/db/schema";
import { getVerifiedUserFromDidToken } from "@/lib/account/server";
import { isValidEvmAddress } from "@/lib/account/validation";
import { getServerZeroDevRpcUrl, getZeroDevAccountConfig } from "@/lib/account/zerodev/config";
import type { SettlementFundingSnapshot, WithdrawalResponse } from "@/lib/account/types";
import { TABY_USDC_ADDRESS } from "@/lib/tabs/constants";
import { parseUsdcToBaseUnits } from "@/lib/tabs/money";

const DEFAULT_RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";
const HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

type KernelContext = {
  account: typeof userSettlementAccounts.$inferSelect;
  user: { id: string; walletAddress: string };
};

function publicClient() {
  return createPublicClient({
    chain: arbitrumSepolia,
    transport: http(
      process.env.ARBITRUM_SEPOLIA_RPC_URL ??
        process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL ??
        DEFAULT_RPC_URL,
    ),
  });
}

function dto(row: typeof withdrawalTransactions.$inferSelect): WithdrawalResponse {
  return {
    amountBaseUnits: row.amountBaseUnits.toString(),
    id: row.id,
    recipientAddress: row.recipientAddress,
    status: row.status,
    transactionHash: row.txHash,
    userOperationHash: row.userOperationHash,
  };
}

async function kernelContext(didToken: unknown): Promise<
  { ok: true; data: KernelContext } | { ok: false; code: string; status: number }
> {
  const verified = await getVerifiedUserFromDidToken(didToken);
  if (!verified.ok) return verified;

  const config = getZeroDevAccountConfig();
  const [account] = await getDb()
    .select()
    .from(userSettlementAccounts)
    .where(
      and(
        eq(userSettlementAccounts.userId, verified.user.id),
        eq(userSettlementAccounts.configHash, config.configHash),
      ),
    )
    .limit(1);

  if (
    !account ||
    account.accountType !== "zerodev_kernel" ||
    account.delegationStatus !== "ready"
  ) {
    return { code: "account_unavailable", ok: false, status: 409 };
  }

  return { data: { account, user: verified.user }, ok: true };
}

async function reservedObligations(input: KernelContext) {
  const now = new Date();
  const db = getDb();
  const memberRows = await db
    .select({ id: tabMembers.id })
    .from(tabMembers)
    .where(eq(tabMembers.userId, input.user.id));
  const currentMemberIds = memberRows.map((member) => member.id);
  if (currentMemberIds.length === 0) return BigInt(0);

  const proposals = await db
    .select({ transfersJson: settlementProposals.transfersJson })
    .from(settlementProposals)
    .where(
      and(
        eq(settlementProposals.status, "locked"),
        gt(settlementProposals.expiresAt, now),
        ne(settlementProposals.status, "cancelled"),
      ),
    );
  // Proposal transfers are keyed by member ID. The ready account selected above is the
  // authoritative address for this signed-in member, matching settlement orchestration.
  const currentIds = new Set(currentMemberIds);
  let reserved = BigInt(0);

  for (const proposal of proposals) {
    if (!Array.isArray(proposal.transfersJson)) continue;
    for (const transfer of proposal.transfersJson) {
      if (!transfer || typeof transfer !== "object") continue;
      const value = transfer as Record<string, unknown>;
      if (
        typeof value.fromMemberId === "string" &&
        currentIds.has(value.fromMemberId) &&
        typeof value.amountBaseUnits === "string" &&
        /^\d+$/.test(value.amountBaseUnits)
      ) {
        reserved += BigInt(value.amountBaseUnits);
      }
    }
  }

  return reserved;
}

async function fundingFromContext(input: KernelContext): Promise<SettlementFundingSnapshot> {
  const [balance, reserved] = await Promise.all([
    publicClient().readContract({
      abi: erc20Abi,
      address: TABY_USDC_ADDRESS,
      functionName: "balanceOf",
      args: [input.account.settlementAddress as `0x${string}`],
    }),
    reservedObligations(input),
  ]);
  const available = balance > reserved ? balance - reserved : BigInt(0);

  return {
    availableToWithdrawBaseUnits: available.toString(),
    balanceBaseUnits: balance.toString(),
    lastRefreshedAt: new Date().toISOString(),
    networkLabel: "Arbitrum Sepolia",
    reservedForFinalTabsBaseUnits: reserved.toString(),
    settlementAddress: input.account.settlementAddress,
    tokenLabel: "USDC",
  };
}

export async function getSettlementFunding(didToken: unknown) {
  const context = await kernelContext(didToken);
  if (!context.ok) return context;
  try {
    return { funding: await fundingFromContext(context.data), ok: true as const };
  } catch {
    return { code: "chain_unavailable", ok: false as const, status: 503 };
  }
}

export async function prepareWithdrawal(input: {
  amount: unknown;
  didToken: unknown;
  idempotencyKey: unknown;
  recipientAddress?: unknown;
}) {
  const context = await kernelContext(input.didToken);
  if (!context.ok) return context;
  const amount = typeof input.amount === "string" ? parseUsdcToBaseUnits(input.amount) : null;
  const recipient =
    typeof input.recipientAddress === "string" && input.recipientAddress.trim()
      ? input.recipientAddress.trim().toLowerCase()
      : context.data.user.walletAddress.toLowerCase();
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";

  if (!amount || !isValidEvmAddress(recipient) || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
    return { code: "validation_failed", ok: false as const, status: 422 };
  }

  try {
    const funding = await fundingFromContext(context.data);
    if (amount > BigInt(funding.availableToWithdrawBaseUnits)) {
      return { code: "insufficient_withdrawable_balance", ok: false as const, status: 422 };
    }
    const db = getDb();
    const [existing] = await db
      .select()
      .from(withdrawalTransactions)
      .where(
        and(
          eq(withdrawalTransactions.userId, context.data.user.id),
          eq(withdrawalTransactions.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      if (existing.amountBaseUnits !== amount || existing.recipientAddress !== recipient) {
        return { code: "idempotency_conflict", ok: false as const, status: 409 };
      }
      return { funding, ok: true as const, withdrawal: dto(existing) };
    }

    const [withdrawal] = await db
      .insert(withdrawalTransactions)
      .values({
        amountBaseUnits: amount,
        idempotencyKey,
        recipientAddress: recipient,
        reservedAmountBaseUnits: BigInt(funding.reservedForFinalTabsBaseUnits),
        settlementAccountId: context.data.account.id,
        status: "created",
        userId: context.data.user.id,
      })
      .returning();
    return { funding, ok: true as const, withdrawal: dto(withdrawal) };
  } catch {
    return { code: "chain_unavailable", ok: false as const, status: 503 };
  }
}

export async function submitWithdrawal(input: { didToken: unknown; id: unknown; userOperationHash: unknown }) {
  const context = await kernelContext(input.didToken);
  if (!context.ok) return context;
  const userOperationHash = typeof input.userOperationHash === "string" ? input.userOperationHash.toLowerCase() : "";
  if (typeof input.id !== "string" || !HASH_PATTERN.test(userOperationHash)) {
    return { code: "validation_failed", ok: false as const, status: 422 };
  }
  try {
    const db = getDb();
    const [existing] = await db.select().from(withdrawalTransactions).where(
      and(eq(withdrawalTransactions.id, input.id), eq(withdrawalTransactions.userId, context.data.user.id), eq(withdrawalTransactions.status, "created")),
    ).limit(1);
    const funding = await fundingFromContext(context.data);
    if (!existing || BigInt(funding.availableToWithdrawBaseUnits) < existing.amountBaseUnits) {
      return { code: "insufficient_withdrawable_balance", ok: false as const, status: 422 };
    }
    const [withdrawal] = await db
      .update(withdrawalTransactions)
      .set({ status: "submitted", updatedAt: new Date(), userOperationHash })
      .where(
        and(
          eq(withdrawalTransactions.id, input.id),
          eq(withdrawalTransactions.userId, context.data.user.id),
          eq(withdrawalTransactions.status, "created"),
        ),
      )
      .returning();
    if (!withdrawal) return { code: "validation_failed", ok: false as const, status: 422 };
    await db.insert(userOperationRecords).values({
      purpose: "settlement_withdrawal",
      settlementAccountId: context.data.account.id,
      status: "submitted",
      userId: context.data.user.id,
      userOperationHash,
    }).onConflictDoUpdate({
      set: { purpose: "settlement_withdrawal", status: "submitted", updatedAt: new Date() },
      target: userOperationRecords.userOperationHash,
    });
    return { ok: true as const, withdrawal: dto(withdrawal) };
  } catch {
    return { code: "account_unavailable", ok: false as const, status: 503 };
  }
}

export async function rejectWithdrawal(input: { didToken: unknown; errorMessage?: unknown; id: unknown }) {
  const context = await kernelContext(input.didToken);
  if (!context.ok) return context;
  if (typeof input.id !== "string") return { code: "validation_failed", ok: false as const, status: 422 };
  const message = typeof input.errorMessage === "string" ? input.errorMessage.slice(0, 180) : "Gas sponsorship was not available.";
  const [withdrawal] = await getDb().update(withdrawalTransactions).set({
    errorMessage: message,
    failureCode: "submission_rejected",
    status: "rejected",
    updatedAt: new Date(),
  }).where(and(eq(withdrawalTransactions.id, input.id), eq(withdrawalTransactions.userId, context.data.user.id), eq(withdrawalTransactions.status, "created"))).returning();
  return withdrawal ? { ok: true as const, withdrawal: dto(withdrawal) } : { code: "validation_failed", ok: false as const, status: 422 };
}

export async function reconcileWithdrawal(input: { didToken: unknown; id: unknown }) {
  const context = await kernelContext(input.didToken);
  if (!context.ok) return context;
  if (typeof input.id !== "string") return { code: "validation_failed", ok: false as const, status: 422 };
  const db = getDb();
  const [withdrawal] = await db.select().from(withdrawalTransactions).where(and(eq(withdrawalTransactions.id, input.id), eq(withdrawalTransactions.userId, context.data.user.id))).limit(1);
  if (!withdrawal) return { code: "validation_failed", ok: false as const, status: 422 };
  if (!withdrawal.userOperationHash || !["submitted", "unknown"].includes(withdrawal.status)) return { ok: true as const, withdrawal: dto(withdrawal) };

  try {
    const receipt = await resolveUserOperationReceipt(withdrawal.userOperationHash);
    if (!receipt) {
      const [updated] = await db.update(withdrawalTransactions).set({ lastReconciledAt: new Date(), lastReconcileErrorCode: "receipt_pending", reconcileAttemptCount: sql`${withdrawalTransactions.reconcileAttemptCount} + 1`, status: "unknown", updatedAt: new Date() }).where(eq(withdrawalTransactions.id, withdrawal.id)).returning();
      return { ok: true as const, withdrawal: dto(updated) };
    }
    const txHash = receipt.transactionHash;
    const transactionReceipt = await publicClient().getTransactionReceipt({ hash: txHash as `0x${string}` });
    const matches = receipt.success && transactionReceipt.status === "success" && transactionReceipt.logs.some((log) => {
      if (log.address.toLowerCase() !== TABY_USDC_ADDRESS.toLowerCase()) return false;
      try {
        const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        return decoded.eventName === "Transfer" &&
          decoded.args.from?.toLowerCase() === context.data.account.settlementAddress.toLowerCase() &&
          decoded.args.to?.toLowerCase() === withdrawal.recipientAddress.toLowerCase() &&
          decoded.args.value === withdrawal.amountBaseUnits;
      } catch { return false; }
    });
    const [updated] = await db.update(withdrawalTransactions).set(matches ? {
      failureCode: null, errorMessage: null, lastReconciledAt: new Date(), lastReconcileErrorCode: null, reconcileAttemptCount: sql`${withdrawalTransactions.reconcileAttemptCount} + 1`, status: "confirmed", txHash, updatedAt: new Date(),
    } : {
      failureCode: receipt.success ? "transfer_mismatch" : "transaction_reverted", errorMessage: receipt.success ? "We could not verify this withdrawal. Refresh status." : "Withdrawal did not go through. Nothing moved.", lastReconciledAt: new Date(), lastReconcileErrorCode: receipt.success ? "transfer_mismatch" : "transaction_reverted", reconcileAttemptCount: sql`${withdrawalTransactions.reconcileAttemptCount} + 1`, status: receipt.success ? "unknown" : "reverted", txHash, updatedAt: new Date(),
    }).where(eq(withdrawalTransactions.id, withdrawal.id)).returning();
    await db
      .update(userOperationRecords)
      .set({
        confirmedAt: matches ? new Date() : null,
        failureCode: matches ? null : (receipt.success ? "transfer_mismatch" : "transaction_reverted"),
        failureMessage: matches ? null : (receipt.success ? "We could not verify this withdrawal." : "Withdrawal did not go through. Nothing moved."),
        status: matches ? "confirmed" : receipt.success ? "submitted" : "failed",
        transactionHash: txHash,
        updatedAt: new Date(),
      })
      .where(eq(userOperationRecords.userOperationHash, withdrawal.userOperationHash));
    return { ok: true as const, withdrawal: dto(updated) };
  } catch {
    return { code: "chain_unavailable", ok: false as const, status: 503 };
  }
}

async function resolveUserOperationReceipt(userOperationHash: string) {
  const rpcUrl = getServerZeroDevRpcUrl();
  if (!rpcUrl) return null;
  const response = await fetch(rpcUrl, {
    body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "eth_getUserOperationReceipt", params: [userOperationHash] }),
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as { result?: unknown };
  if (!payload.result || typeof payload.result !== "object") return null;
  const result = payload.result as { success?: boolean; receipt?: { transactionHash?: string } };
  if (!result.receipt?.transactionHash || !HASH_PATTERN.test(result.receipt.transactionHash)) return null;
  return { success: result.success !== false, transactionHash: result.receipt.transactionHash };
}
