import type { SettlementTransaction, TabAuthorization } from "../db/schema";
import type { FinalTabReceiptResponse } from "./types";

export type ReceiptIncludedSnapshot = {
  amountBaseUnits: string;
  expenseId: string;
};

export type ReceiptExcludedSnapshot = {
  expenseId: string;
  status: string;
};

export type ReceiptTransferSnapshot = {
  amountBaseUnits: string;
  fromMemberId: string;
  id?: string;
  toMemberId: string;
};

export type ReceiptNetBalanceSnapshot = {
  direction?: string;
  displayName?: string;
  memberId: string;
  netBaseUnits: string;
};

type ParsedReceiptSnapshots =
  | {
      includedSnapshots: ReceiptIncludedSnapshot[];
      excludedSnapshots: ReceiptExcludedSnapshot[];
      netBalances: ReceiptNetBalanceSnapshot[];
      ok: true;
      transferSnapshots: ReceiptTransferSnapshot[];
    }
  | { ok: false };

type ReceiptAccessInput = {
  currentMember: { joinStatus: string } | null;
  isOwner: boolean;
};

type ReceiptVerificationInput = {
  expectedChainId: number;
  expectedSettlementContractAddress: string;
  expectedTokenAddress: string;
  proposal: {
    chainId: number;
    executedAt: Date | null;
    proposalHash: string;
    settlementContractAddress: string;
    status: string;
    tabKey: string;
    tokenAddress: string;
    totalAmountBaseUnits: bigint | number | string;
    transfersHash: string;
  };
  tab: {
    networkChainId: number;
    status: string;
    tokenAddress: string;
  };
  transaction: {
    chainId: number;
    confirmedBlockNumber: bigint | null;
    eventName: string | null;
    eventProposalHash: string | null;
    eventTabKey: string | null;
    eventTotalAmountBaseUnits: bigint | number | string | null;
    eventTransferCount: number | null;
    eventTransfersHash: string | null;
    settlementContractAddress: string;
    status: string;
    tokenAddress: string;
    txHash: string | null;
  };
  transferCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonNegativeIntegerString(value: string) {
  try {
    return BigInt(value) >= BigInt(0);
  } catch {
    return false;
  }
}

function sameIdSet(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightSet = new Set(right);

  return left.every((value) => rightSet.has(value));
}

function equalText(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function parseIncludedSnapshots(value: unknown): ReceiptIncludedSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const snapshots: ReceiptIncludedSnapshot[] = [];

  for (const expense of value) {
    if (
      !isRecord(expense) ||
      typeof expense.expenseId !== "string" ||
      typeof expense.amountBaseUnits !== "string" ||
      !isNonNegativeIntegerString(expense.amountBaseUnits)
    ) {
      return null;
    }

    snapshots.push({
      amountBaseUnits: expense.amountBaseUnits,
      expenseId: expense.expenseId,
    });
  }

  return snapshots;
}

function parseExcludedSnapshots(value: unknown): ReceiptExcludedSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const snapshots: ReceiptExcludedSnapshot[] = [];

  for (const expense of value) {
    if (!isRecord(expense) || typeof expense.expenseId !== "string") {
      return null;
    }

    snapshots.push({
      expenseId: expense.expenseId,
      status: typeof expense.status === "string" ? expense.status : "disputed",
    });
  }

  return snapshots;
}

function parseTransferSnapshots(value: unknown): ReceiptTransferSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const snapshots: ReceiptTransferSnapshot[] = [];

  for (const [index, transfer] of value.entries()) {
    if (
      !isRecord(transfer) ||
      typeof transfer.fromMemberId !== "string" ||
      typeof transfer.toMemberId !== "string" ||
      typeof transfer.amountBaseUnits !== "string" ||
      !isNonNegativeIntegerString(transfer.amountBaseUnits)
    ) {
      return null;
    }

    snapshots.push({
      amountBaseUnits: transfer.amountBaseUnits,
      fromMemberId: transfer.fromMemberId,
      id: typeof transfer.id === "string" ? transfer.id : `transfer-${index}`,
      toMemberId: transfer.toMemberId,
    });
  }

  return snapshots;
}

function parseNetBalanceSnapshots(value: unknown): ReceiptNetBalanceSnapshot[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const snapshots: ReceiptNetBalanceSnapshot[] = [];

  for (const balance of value) {
    if (
      !isRecord(balance) ||
      typeof balance.memberId !== "string" ||
      typeof balance.netBaseUnits !== "string" ||
      !isNonNegativeIntegerString(
        balance.netBaseUnits.startsWith("-") ? balance.netBaseUnits.slice(1) : balance.netBaseUnits,
      )
    ) {
      return null;
    }

    snapshots.push({
      direction: typeof balance.direction === "string" ? balance.direction : undefined,
      displayName: typeof balance.displayName === "string" ? balance.displayName : undefined,
      memberId: balance.memberId,
      netBaseUnits: balance.netBaseUnits,
    });
  }

  return snapshots;
}

export function parseReceiptSnapshots(input: {
  canonicalPayloadJson: unknown;
  excludedExpenseIds: string[];
  includedExpenseIds: string[];
  netBalancesJson: unknown;
  transfersJson: unknown;
}): ParsedReceiptSnapshots {
  if (!isRecord(input.canonicalPayloadJson)) {
    return { ok: false };
  }

  const includedSnapshots = parseIncludedSnapshots(input.canonicalPayloadJson.includedExpenses);
  const excludedSnapshots = parseExcludedSnapshots(input.canonicalPayloadJson.excludedExpenses);
  const transferSnapshots = parseTransferSnapshots(input.transfersJson);
  const netBalances = parseNetBalanceSnapshots(input.netBalancesJson);

  if (!includedSnapshots || !excludedSnapshots || !transferSnapshots || !netBalances) {
    return { ok: false };
  }

  if (
    !sameIdSet(
      includedSnapshots.map((expense) => expense.expenseId),
      input.includedExpenseIds,
    ) ||
    !sameIdSet(
      excludedSnapshots.map((expense) => expense.expenseId),
      input.excludedExpenseIds,
    )
  ) {
    return { ok: false };
  }

  return { excludedSnapshots, includedSnapshots, netBalances, ok: true, transferSnapshots };
}

export function shortReceiptId(value: string) {
  return value.length > 8 ? value.slice(0, 8) : value;
}

export function canViewFinalTabReceipt(input: ReceiptAccessInput) {
  return input.isOwner || input.currentMember?.joinStatus === "joined";
}

export function receiptVerificationPassed(input: ReceiptVerificationInput) {
  return (
    input.tab.status === "settled" &&
    input.proposal.status === "executed" &&
    input.transaction.status === "confirmed" &&
    Boolean(input.proposal.executedAt) &&
    Boolean(input.transaction.txHash) &&
    Boolean(input.transaction.confirmedBlockNumber) &&
    input.transaction.eventName === "FinalTabSettled" &&
    equalText(input.transaction.eventProposalHash, input.proposal.proposalHash) &&
    equalText(input.transaction.eventTabKey, input.proposal.tabKey) &&
    equalText(input.transaction.eventTransfersHash, input.proposal.transfersHash) &&
    input.transaction.eventTotalAmountBaseUnits?.toString() ===
      input.proposal.totalAmountBaseUnits.toString() &&
    input.transaction.eventTransferCount === input.transferCount &&
    input.proposal.chainId === input.expectedChainId &&
    input.tab.networkChainId === input.expectedChainId &&
    input.transaction.chainId === input.expectedChainId &&
    equalText(input.proposal.tokenAddress, input.expectedTokenAddress) &&
    equalText(input.tab.tokenAddress, input.expectedTokenAddress) &&
    equalText(input.transaction.tokenAddress, input.expectedTokenAddress) &&
    equalText(input.proposal.settlementContractAddress, input.expectedSettlementContractAddress) &&
    equalText(
      input.transaction.settlementContractAddress,
      input.expectedSettlementContractAddress,
    )
  );
}

export function receiptLifecycleState(
  attempt: Pick<SettlementTransaction, "status" | "txHash"> | null,
): Exclude<FinalTabReceiptResponse["status"], "confirmed"> {
  if (!attempt) {
    return "empty";
  }

  if (attempt.status === "failed" || attempt.status === "reverted") {
    return "failed";
  }

  if (["submitted", "userop_submitted", "included", "unknown", "created"].includes(attempt.status)) {
    return attempt.txHash && attempt.status === "unknown" ? "reconciliation_needed" : "pending";
  }

  return "reconciliation_needed";
}

export function receiptStateMessage(
  status: Exclude<FinalTabReceiptResponse["status"], "confirmed">,
) {
  switch (status) {
    case "pending":
      return "Settlement is still confirming. Check the tab for the latest status.";
    case "failed":
      return "Settlement did not go through. Nothing moved.";
    case "reconciliation_needed":
      return "We couldn't verify this receipt yet. Refresh status from the tab.";
    case "inaccessible":
      return "We couldn't find that receipt.";
    case "empty":
    default:
      return "No receipt yet. Settle the Final Tab first.";
  }
}

export function debtorRequiredAmounts(transfers: ReceiptTransferSnapshot[]) {
  const requiredAmounts = new Map<string, bigint>();

  for (const transfer of transfers) {
    requiredAmounts.set(
      transfer.fromMemberId,
      (requiredAmounts.get(transfer.fromMemberId) ?? BigInt(0)) +
        BigInt(transfer.amountBaseUnits),
    );
  }

  return requiredAmounts;
}

export function validReceiptAuthorizations(input: {
  authorizationRows: Pick<
    TabAuthorization,
    "authorizationAmountBaseUnits" | "expiresAt" | "memberId" | "proposalHash" | "revokedAt"
  >[];
  proposalExecutedAt: Date;
  proposalHash: string;
  transfers: ReceiptTransferSnapshot[];
}) {
  const requiredAmounts = debtorRequiredAmounts(input.transfers);

  return input.authorizationRows.filter((authorization) => {
    const requiredAmount = requiredAmounts.get(authorization.memberId);

    return (
      Boolean(requiredAmount) &&
      !authorization.revokedAt &&
      authorization.authorizationAmountBaseUnits !== null &&
      authorization.authorizationAmountBaseUnits >= requiredAmount! &&
      authorization.expiresAt >= input.proposalExecutedAt &&
      authorization.proposalHash?.toLowerCase() === input.proposalHash.toLowerCase()
    );
  });
}
