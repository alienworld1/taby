import {
  encodeAbiParameters,
  isAddress,
  keccak256,
  stringToBytes,
  type Address,
  type Hex,
} from "viem";
import type { Expense, ExpenseSplit, TabMember } from "../db/schema";
import type { SettlementEngineResult, SettlementTransfer } from "./settlement";

export const FINAL_TAB_SCHEMA_VERSION = 1;
export const EMPTY_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export type FinalTabIncludedExpenseSnapshot = {
  amountBaseUnits: string;
  expenseId: string;
  payerMemberId: string;
  splitEntries: { memberId: string; shareBaseUnits: string }[];
  tokenAddress: Address;
};

export type FinalTabExcludedExpenseSnapshot = {
  expenseId: string;
  status: "pending" | "disputed" | "excluded" | "locked" | "settled";
};

export type FinalTabTransferSnapshot = {
  amountBaseUnits: string;
  fromMemberId: string;
  fromWalletAddress: Address;
  orderIndex: number;
  toMemberId: string;
  toWalletAddress: Address;
};

export type FinalTabPayload = {
  applicationTabIdHash: Hex;
  chainId: number;
  coordinatorWalletAddress: Address;
  excludedExpensesHash: Hex;
  excludedExpenses: FinalTabExcludedExpenseSnapshot[];
  expiresAt: number;
  includedExpensesHash: Hex;
  includedExpenses: FinalTabIncludedExpenseSnapshot[];
  proposalVersion: number;
  schemaVersion: 1;
  settlementContractAddress: Address;
  tabKey: Hex;
  tokenAddress: Address;
  totalSettlementAmountBaseUnits: string;
  transfersHash: Hex;
  transfers: FinalTabTransferSnapshot[];
};

export type FinalTabBuildResult = {
  excludedExpensesHash: Hex;
  includedExpensesHash: Hex;
  payload: FinalTabPayload;
  proposalHash: Hex;
  tabIdHash: Hex;
  tabKey: Hex;
  transfersHash: Hex;
};

export type FinalTabBuildInput = {
  chainId: number;
  coordinatorWalletAddress: string;
  excludedExpenses: Expense[];
  expiresAt: Date;
  includedExpenses: Expense[];
  members: TabMember[];
  proposalVersion: number;
  settlement: SettlementEngineResult;
  settlementContractAddress: string;
  splits: ExpenseSplit[];
  tabId: string;
  tokenAddress: string;
};

export function buildFinalTab(input: FinalTabBuildInput): FinalTabBuildResult {
  const tokenAddress = normalizeAddress(input.tokenAddress, "token address");
  const settlementContractAddress = normalizeAddress(
    input.settlementContractAddress,
    "settlement contract address",
  );
  const coordinatorWalletAddress = normalizeAddress(
    input.coordinatorWalletAddress,
    "coordinator wallet address",
  );
  const memberById = new Map(input.members.map((member) => [member.id, member]));
  const splitsByExpenseId = new Map<string, ExpenseSplit[]>();

  for (const split of input.splits) {
    const rows = splitsByExpenseId.get(split.expenseId) ?? [];
    rows.push(split);
    splitsByExpenseId.set(split.expenseId, rows);
  }

  const includedExpenses = input.includedExpenses
    .map((expense) => ({
      amountBaseUnits: expense.amountBaseUnits.toString(),
      expenseId: expense.id,
      payerMemberId: expense.payerMemberId,
      splitEntries: [...(splitsByExpenseId.get(expense.id) ?? [])]
        .map((split) => ({
          memberId: split.memberId,
          shareBaseUnits: split.shareBaseUnits.toString(),
        }))
        .sort((a, b) => a.memberId.localeCompare(b.memberId)),
      tokenAddress,
    }))
    .sort((a, b) => a.expenseId.localeCompare(b.expenseId));
  const excludedExpenses = input.excludedExpenses
    .map((expense) => ({
      expenseId: expense.id,
      status: expense.status as FinalTabExcludedExpenseSnapshot["status"],
    }))
    .sort((a, b) => a.expenseId.localeCompare(b.expenseId));
  const transfers = sortTransfers(input.settlement.transfers).map((transfer, orderIndex) => {
    const debtor = memberById.get(transfer.fromMemberId);
    const creditor = memberById.get(transfer.toMemberId);

    return {
      amountBaseUnits: transfer.amountBaseUnits,
      fromMemberId: transfer.fromMemberId,
      fromWalletAddress: normalizeAddress(debtor?.walletAddress, "debtor wallet address"),
      orderIndex,
      toMemberId: transfer.toMemberId,
      toWalletAddress: normalizeAddress(creditor?.walletAddress, "creditor wallet address"),
    };
  });

  const tabIdHash = keccak256(stringToBytes(input.tabId));
  const tabKey = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      [coordinatorWalletAddress, tabIdHash],
    ),
  );
  const includedExpensesHash = hashIncludedExpenses(includedExpenses);
  const excludedExpensesHash = hashExcludedExpenses(excludedExpenses);
  const transfersHash = hashTransfers(transfers);
  const expiresAt = Math.floor(input.expiresAt.getTime() / 1000);
  const payload = {
    applicationTabIdHash: tabIdHash,
    chainId: input.chainId,
    coordinatorWalletAddress,
    excludedExpenses,
    excludedExpensesHash,
    expiresAt,
    includedExpenses,
    includedExpensesHash,
    proposalVersion: input.proposalVersion,
    schemaVersion: FINAL_TAB_SCHEMA_VERSION,
    settlementContractAddress,
    tabKey,
    tokenAddress,
    totalSettlementAmountBaseUnits: input.settlement.totalMovingBaseUnits,
    transfers,
    transfersHash,
  } satisfies FinalTabPayload;
  const proposalHash = hashFinalTabPayload(payload);

  return {
    excludedExpensesHash,
    includedExpensesHash,
    payload,
    proposalHash,
    tabIdHash,
    tabKey,
    transfersHash,
  };
}

export function hashFinalTabPayload(payload: FinalTabPayload): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      [
        BigInt(payload.schemaVersion),
        payload.applicationTabIdHash,
        payload.tabKey,
        payload.coordinatorWalletAddress,
        BigInt(payload.proposalVersion),
        BigInt(payload.chainId),
        payload.tokenAddress,
        payload.settlementContractAddress,
        BigInt(payload.expiresAt),
        payload.includedExpensesHash,
        payload.excludedExpensesHash,
        payload.transfersHash,
        BigInt(payload.totalSettlementAmountBaseUnits),
      ],
    ),
  );
}

export function hashIncludedExpenses(expenses: FinalTabIncludedExpenseSnapshot[]): Hex {
  return hashBytes32Array(
    expenses.map((expense) => {
      const splitHash = hashBytes32Array(
        expense.splitEntries.map((split) =>
          keccak256(
            encodeAbiParameters(
              [{ type: "bytes32" }, { type: "uint256" }],
              [idHash(split.memberId), BigInt(split.shareBaseUnits)],
            ),
          ),
        ),
      );

      return keccak256(
        encodeAbiParameters(
          [
            { type: "bytes32" },
            { type: "bytes32" },
            { type: "uint256" },
            { type: "address" },
            { type: "bytes32" },
          ],
          [
            idHash(expense.expenseId),
            idHash(expense.payerMemberId),
            BigInt(expense.amountBaseUnits),
            expense.tokenAddress,
            splitHash,
          ],
        ),
      );
    }),
  );
}

export function hashExcludedExpenses(expenses: FinalTabExcludedExpenseSnapshot[]): Hex {
  return hashBytes32Array(
    expenses.map((expense) =>
      keccak256(
        encodeAbiParameters(
          [{ type: "bytes32" }, { type: "bytes32" }],
          [idHash(expense.expenseId), idHash(expense.status)],
        ),
      ),
    ),
  );
}

export function hashTransfers(transfers: FinalTabTransferSnapshot[]): Hex {
  return hashBytes32Array(
    transfers.map((transfer) =>
      keccak256(
        encodeAbiParameters(
          [
            { type: "bytes32" },
            { type: "bytes32" },
            { type: "uint256" },
            { type: "address" },
            { type: "address" },
            { type: "uint256" },
          ],
          [
            idHash(transfer.fromMemberId),
            idHash(transfer.toMemberId),
            BigInt(transfer.amountBaseUnits),
            transfer.fromWalletAddress,
            transfer.toWalletAddress,
            BigInt(transfer.orderIndex),
          ],
        ),
      ),
    ),
  );
}

function hashBytes32Array(values: Hex[]): Hex {
  if (values.length === 0) {
    return keccak256(encodeAbiParameters([{ type: "bytes32[]" }], [[]]));
  }

  return keccak256(encodeAbiParameters([{ type: "bytes32[]" }], [values]));
}

function idHash(value: string): Hex {
  return keccak256(stringToBytes(value));
}

function normalizeAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new Error(`Invalid ${label}.`);
  }

  return value.toLowerCase() as Address;
}

function sortTransfers(transfers: SettlementTransfer[]) {
  return [...transfers].sort((a, b) => {
    const amountDelta =
      BigInt(a.amountBaseUnits) > BigInt(b.amountBaseUnits)
        ? 1
        : BigInt(a.amountBaseUnits) < BigInt(b.amountBaseUnits)
          ? -1
          : 0;

    return (
      a.fromMemberId.localeCompare(b.fromMemberId) ||
      a.toMemberId.localeCompare(b.toMemberId) ||
      amountDelta ||
      a.id.localeCompare(b.id)
    );
  });
}
