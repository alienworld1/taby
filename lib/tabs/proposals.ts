import { createHash } from "node:crypto";
import type { SettlementProposal } from "../db/schema";
import type {
  MemberNetBalance,
  SettlementEngineResult,
  SettlementTransfer,
} from "./settlement";
import type { SettlementProposalResponse } from "./types";

export type ProposalHashPayload = {
  excludedExpenseIds: string[];
  includedExpenseIds: string[];
  netBalances: MemberNetBalance[];
  networkChainId: number;
  schemaVersion: 1;
  tabId: string;
  tokenAddress: string;
  totalAmountBaseUnits: string;
  transfers: SettlementTransfer[];
};

export function buildDebtorAmounts(transfers: SettlementTransfer[]) {
  const amounts = new Map<string, bigint>();

  for (const transfer of transfers) {
    amounts.set(
      transfer.fromMemberId,
      (amounts.get(transfer.fromMemberId) ?? BigInt(0)) +
        BigInt(transfer.amountBaseUnits),
    );
  }

  return Object.fromEntries(
    [...amounts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([memberId, amount]) => [memberId, amount.toString()]),
  );
}

export function buildProposalHashPayload(input: {
  excludedExpenseIds: string[];
  includedExpenseIds: string[];
  networkChainId: number;
  settlement: SettlementEngineResult;
  tabId: string;
  tokenAddress: string;
}): ProposalHashPayload {
  return {
    excludedExpenseIds: [...input.excludedExpenseIds].sort(),
    includedExpenseIds: [...input.includedExpenseIds].sort(),
    netBalances: [...input.settlement.balances].sort((a, b) =>
      a.memberId.localeCompare(b.memberId),
    ),
    networkChainId: input.networkChainId,
    schemaVersion: 1,
    tabId: input.tabId,
    tokenAddress: input.tokenAddress.toLowerCase(),
    totalAmountBaseUnits: input.settlement.totalMovingBaseUnits,
    transfers: [...input.settlement.transfers].sort(compareTransferForHash),
  };
}

export function hashProposalPayload(payload: ProposalHashPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function proposalDto(proposal: SettlementProposal): SettlementProposalResponse {
  const transfers = normalizeTransfers(proposal.transfersJson);

  return {
    canonicalPayload: proposal.canonicalPayloadJson,
    chainId: proposal.chainId,
    coordinatorWalletAddress: proposal.coordinatorWalletAddress,
    createdAt: proposal.createdAt.toISOString(),
    createdByUserId: proposal.createdByUserId,
    cancelledAt: proposal.cancelledAt?.toISOString() ?? null,
    debtorAmountsBaseUnits: buildDebtorAmounts(transfers),
    executedAt: proposal.executedAt?.toISOString() ?? null,
    excludedExpenseIds: proposal.excludedExpenseIds,
    excludedExpensesHash: proposal.excludedExpensesHash,
    expiresAt: proposal.expiresAt.toISOString(),
    id: proposal.id,
    includedExpenseIds: proposal.includedExpenseIds,
    includedExpensesHash: proposal.includedExpensesHash,
    lockedAt: proposal.lockedAt?.toISOString() ?? null,
    netBalances: normalizeBalances(proposal.netBalancesJson),
    proposalHash: proposal.proposalHash,
    proposalVersion: proposal.proposalVersion,
    schemaVersion: proposal.schemaVersion,
    settlementContractAddress: proposal.settlementContractAddress,
    status: proposal.status,
    tabId: proposal.tabId,
    tabIdHash: proposal.tabIdHash,
    tabKey: proposal.tabKey,
    tokenAddress: proposal.tokenAddress,
    totalAmountBaseUnits: proposal.totalAmountBaseUnits.toString(),
    transfersHash: proposal.transfersHash,
    transfers,
    updatedAt: proposal.updatedAt.toISOString(),
  };
}

function compareTransferForHash(a: SettlementTransfer, b: SettlementTransfer) {
  return (
    a.id.localeCompare(b.id) ||
    a.fromMemberId.localeCompare(b.fromMemberId) ||
    a.toMemberId.localeCompare(b.toMemberId) ||
    a.amountBaseUnits.localeCompare(b.amountBaseUnits)
  );
}

function normalizeBalances(value: unknown): MemberNetBalance[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isMemberNetBalance);
}

function normalizeTransfers(value: unknown): SettlementTransfer[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isSettlementTransfer);
}

function isMemberNetBalance(value: unknown): value is MemberNetBalance {
  if (!isRecord(value)) {
    return false;
  }

  return (
    "memberId" in value &&
    typeof value.memberId === "string" &&
    "displayName" in value &&
    typeof value.displayName === "string" &&
    "netBaseUnits" in value &&
    typeof value.netBaseUnits === "string" &&
    "owedBaseUnits" in value &&
    typeof value.owedBaseUnits === "string" &&
    "paidBaseUnits" in value &&
    typeof value.paidBaseUnits === "string" &&
    "direction" in value &&
    (value.direction === "receives" || value.direction === "pays" || value.direction === "settled")
  );
}

function isSettlementTransfer(value: unknown): value is SettlementTransfer {
  if (!isRecord(value)) {
    return false;
  }

  return (
    "id" in value &&
    typeof value.id === "string" &&
    "fromMemberId" in value &&
    typeof value.fromMemberId === "string" &&
    "toMemberId" in value &&
    typeof value.toMemberId === "string" &&
    "amountBaseUnits" in value &&
    typeof value.amountBaseUnits === "string" &&
    "algorithm" in value &&
    (value.algorithm === "exact-small-group" || value.algorithm === "greedy")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
