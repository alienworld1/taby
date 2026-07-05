import type {
  ExpenseResponse,
  ExpenseSplitResponse,
  ExpenseStatus,
  MemberJoinStatus,
  TabMemberResponse,
} from "./types";

export type SettlementMemberInput = {
  displayName: string;
  id: string;
  joinStatus: MemberJoinStatus;
  walletAddress: string | null;
};

export type SettlementExpenseInput = {
  amountBaseUnits: string;
  id: string;
  payerMemberId: string;
  status: ExpenseStatus | string;
  title: string;
  tokenAddress: string;
};

export type SettlementSplitInput = {
  expenseId: string;
  memberId: string;
  shareBaseUnits: string;
};

export type RawIouEdge = {
  amountBaseUnits: string;
  expenseId: string;
  fromMemberId: string;
  id: string;
  reason: "expense_share";
  toMemberId: string;
};

export type MemberNetBalance = {
  direction: "receives" | "pays" | "settled";
  displayName: string;
  memberId: string;
  netBaseUnits: string;
  owedBaseUnits: string;
  paidBaseUnits: string;
};

export type SettlementTransfer = {
  algorithm: "exact-small-group" | "greedy";
  amountBaseUnits: string;
  fromMemberId: string;
  id: string;
  toMemberId: string;
};

export type SettlementEngineResult = {
  algorithm: "exact-small-group" | "greedy" | "none";
  balances: MemberNetBalance[];
  eligibleExpenseIds: string[];
  excludedExpenseIds: string[];
  rawIouCount: number;
  rawIous: RawIouEdge[];
  settlementCount: number;
  summaryText: string;
  totalMovingBaseUnits: string;
  transfers: SettlementTransfer[];
  warnings: string[];
};

export type SettlementEngineError = {
  code:
    | "invalid_member"
    | "invalid_expense"
    | "invalid_split_total"
    | "invalid_amount"
    | "token_mismatch"
    | "unbalanced_result";
  expenseId?: string | null;
  memberId?: string | null;
  message: string;
};

export type SettlementEngineOutput =
  | { ok: true; result: SettlementEngineResult }
  | { error: SettlementEngineError; ok: false };

export type SettlementEngineInput = {
  exactOperationLimit?: number;
  exactThreshold?: number;
  expenses: SettlementExpenseInput[];
  members: SettlementMemberInput[];
  splits: SettlementSplitInput[];
  tokenAddress: string;
};

type RunningBalance = {
  displayName: string;
  memberId: string;
  owed: bigint;
  paid: bigint;
};

type OptimizerMember = {
  memberId: string;
  net: bigint;
};

type OptimizerResult = {
  algorithm: "exact-small-group" | "greedy";
  transfers: SettlementTransfer[];
  warnings: string[];
};

const INTEGER_PATTERN = /^\d+$/;
const DEFAULT_EXACT_THRESHOLD = 8;
const DEFAULT_EXACT_OPERATION_LIMIT = 60_000;
const ZERO = BigInt(0);

export function createSettlementInputsFromTabDetail(input: {
  expenses: ExpenseResponse[];
  members: TabMemberResponse[];
  splits: ExpenseSplitResponse[];
  tokenAddress: string;
}): SettlementEngineInput {
  return {
    expenses: input.expenses,
    members: input.members,
    splits: input.splits,
    tokenAddress: input.tokenAddress,
  };
}

export function calculateSettlement(input: SettlementEngineInput): SettlementEngineOutput {
  const exactThreshold = input.exactThreshold ?? DEFAULT_EXACT_THRESHOLD;
  const exactOperationLimit = input.exactOperationLimit ?? DEFAULT_EXACT_OPERATION_LIMIT;
  const joinedMembers = [...input.members]
    .filter((member) => member.joinStatus === "joined")
    .sort(compareMemberInput);
  const memberById = new Map(joinedMembers.map((member) => [member.id, member]));
  const balancesByMember = new Map<string, RunningBalance>();

  for (const member of joinedMembers) {
    balancesByMember.set(member.id, {
      displayName: member.displayName,
      memberId: member.id,
      owed: ZERO,
      paid: ZERO,
    });
  }

  const eligibleExpenses = [...input.expenses]
    .filter((expense) => expense.status === "confirmed")
    .sort((a, b) => a.id.localeCompare(b.id));
  const excludedExpenseIds = input.expenses
    .filter((expense) => expense.status !== "confirmed")
    .map((expense) => expense.id)
    .sort();
  const splitsByExpenseId = new Map<string, SettlementSplitInput[]>();

  for (const split of input.splits) {
    const splits = splitsByExpenseId.get(split.expenseId) ?? [];
    splits.push(split);
    splitsByExpenseId.set(split.expenseId, splits);
  }

  const rawIous: RawIouEdge[] = [];

  for (const expense of eligibleExpenses) {
    const amount = parsePositiveInteger(expense.amountBaseUnits);

    if (amount === null) {
      return engineError("invalid_amount", expense.id, null, "Confirmed expense amount is invalid.");
    }

    if (expense.tokenAddress !== input.tokenAddress) {
      return engineError("token_mismatch", expense.id, null, "Confirmed expense token differs from the tab token.");
    }

    if (!memberById.has(expense.payerMemberId)) {
      return engineError("invalid_member", expense.id, expense.payerMemberId, "Confirmed expense payer is not a joined member.");
    }

    const expenseSplits = [...(splitsByExpenseId.get(expense.id) ?? [])].sort(compareSplitInput);

    if (expenseSplits.length === 0) {
      return engineError("invalid_expense", expense.id, null, "Confirmed expense has no split rows.");
    }

    let splitTotal = ZERO;
    let rawIndex = 0;

    for (const split of expenseSplits) {
      const share = parseNonNegativeInteger(split.shareBaseUnits);

      if (share === null) {
        return engineError("invalid_amount", expense.id, split.memberId, "Confirmed expense split share is invalid.");
      }

      if (!memberById.has(split.memberId)) {
        return engineError("invalid_member", expense.id, split.memberId, "Confirmed expense split member is not joined.");
      }

      splitTotal += share;
      balancesByMember.get(split.memberId)!.owed += share;

      if (share > ZERO && split.memberId !== expense.payerMemberId) {
        rawIous.push({
          amountBaseUnits: share.toString(),
          expenseId: expense.id,
          fromMemberId: split.memberId,
          id: `${expense.id}:${split.memberId}:${expense.payerMemberId}:${rawIndex}`,
          reason: "expense_share",
          toMemberId: expense.payerMemberId,
        });
        rawIndex += 1;
      }
    }

    if (splitTotal !== amount) {
      return engineError("invalid_split_total", expense.id, null, "Confirmed expense splits do not equal the expense amount.");
    }

    balancesByMember.get(expense.payerMemberId)!.paid += amount;
  }

  const balances = joinedMembers.map((member) => {
    const balance = balancesByMember.get(member.id)!;
    const net = balance.paid - balance.owed;

    return {
      direction: net > ZERO ? "receives" : net < ZERO ? "pays" : "settled",
      displayName: balance.displayName,
      memberId: balance.memberId,
      netBaseUnits: net.toString(),
      owedBaseUnits: balance.owed.toString(),
      paidBaseUnits: balance.paid.toString(),
    } satisfies MemberNetBalance;
  });

  const totalNet = balances.reduce(
    (sum, balance) => sum + BigInt(balance.netBaseUnits),
    ZERO,
  );

  if (totalNet !== ZERO) {
    return engineError("unbalanced_result", null, null, "Settlement balances do not sum to zero.");
  }

  const nonZeroMembers = balances
    .filter((balance) => BigInt(balance.netBaseUnits) !== ZERO)
    .map((balance) => ({
      memberId: balance.memberId,
      net: BigInt(balance.netBaseUnits),
    }))
    .sort(compareOptimizerMember);
  const optimizerResult =
    nonZeroMembers.length === 0
      ? { algorithm: "none" as const, transfers: [], warnings: [] }
      : optimizeTransfers(nonZeroMembers, exactThreshold, exactOperationLimit);
  const verified =
    optimizerResult.algorithm === "none" ||
    verifyTransfers(nonZeroMembers, optimizerResult.transfers);

  if (!verified) {
    return engineError("unbalanced_result", null, null, "Settlement transfers do not satisfy member balances.");
  }

  const transfers = optimizerResult.transfers.map((transfer, index) => ({
    ...transfer,
    id: `${transfer.fromMemberId}:${transfer.toMemberId}:${transfer.amountBaseUnits}:${index}`,
  }));
  const totalMovingBaseUnits = transfers
    .reduce((sum, transfer) => sum + BigInt(transfer.amountBaseUnits), ZERO)
    .toString();

  return {
    ok: true,
    result: {
      algorithm: optimizerResult.algorithm,
      balances,
      eligibleExpenseIds: eligibleExpenses.map((expense) => expense.id),
      excludedExpenseIds,
      rawIouCount: rawIous.length,
      rawIous: rawIous.sort(compareRawIou),
      settlementCount: transfers.length,
      summaryText: buildSummaryText(rawIous.length, transfers.length),
      totalMovingBaseUnits,
      transfers,
      warnings: optimizerResult.warnings,
    },
  };
}

function optimizeTransfers(
  members: OptimizerMember[],
  exactThreshold: number,
  operationLimit: number,
): OptimizerResult {
  if (members.length <= exactThreshold) {
    const exactGroups = findExactZeroSumGroups(members, operationLimit);

    if (exactGroups) {
      return {
        algorithm: "exact-small-group",
        transfers: exactGroups
          .flatMap((group) => greedySettle(group, "exact-small-group"))
          .sort(compareTransfer),
        warnings: [],
      };
    }
  }

  return {
    algorithm: "greedy",
    transfers: greedySettle(members, "greedy").sort(compareTransfer),
    warnings:
      members.length <= exactThreshold
        ? ["exact_optimizer_guard_reached"]
        : ["exact_optimizer_skipped_for_group_size"],
  };
}

function findExactZeroSumGroups(
  members: OptimizerMember[],
  operationLimit: number,
): OptimizerMember[][] | null {
  const count = members.length;
  const fullMask = (1 << count) - 1;
  const sums = new Map<number, bigint>();
  const memo = new Map<number, { groups: number[][]; score: number }>();
  let operations = 0;

  function subsetSum(mask: number) {
    const cached = sums.get(mask);

    if (cached !== undefined) {
      return cached;
    }

    let sum = ZERO;

    for (let index = 0; index < count; index += 1) {
      if ((mask & (1 << index)) !== 0) {
        sum += members[index].net;
      }
    }

    sums.set(mask, sum);
    return sum;
  }

  function solve(mask: number): { groups: number[][]; score: number } | null {
    operations += 1;

    if (operations > operationLimit) {
      return null;
    }

    if (mask === 0) {
      return { groups: [], score: 0 };
    }

    const cached = memo.get(mask);

    if (cached) {
      return cached;
    }

    let best: { groups: number[][]; score: number } | null = null;
    let submask = mask;

    while (submask > 0) {
      if (subsetSum(submask) === ZERO) {
        const rest = solve(mask ^ submask);

        if (!rest) {
          return null;
        }

        const candidate = {
          groups: [maskToIndexes(submask, count), ...rest.groups],
          score: rest.score + 1,
        };

        if (!best || comparePartition(candidate, best) < 0) {
          best = candidate;
        }
      }

      submask = (submask - 1) & mask;
    }

    if (!best) {
      return null;
    }

    memo.set(mask, best);
    return best;
  }

  const partition = solve(fullMask);

  if (!partition) {
    return null;
  }

  return partition.groups
    .map((group) => group.map((index) => members[index]).sort(compareOptimizerMember))
    .sort(compareOptimizerGroup);
}

function greedySettle(
  members: OptimizerMember[],
  algorithm: SettlementTransfer["algorithm"],
): SettlementTransfer[] {
  const debtors = members
    .filter((member) => member.net < ZERO)
    .map((member) => ({ memberId: member.memberId, remaining: -member.net }))
    .sort(compareRemaining);
  const creditors = members
    .filter((member) => member.net > ZERO)
    .map((member) => ({ memberId: member.memberId, remaining: member.net }))
    .sort(compareRemaining);
  const transfers: SettlementTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = debtor.remaining < creditor.remaining ? debtor.remaining : creditor.remaining;

    transfers.push({
      algorithm,
      amountBaseUnits: amount.toString(),
      fromMemberId: debtor.memberId,
      id: "",
      toMemberId: creditor.memberId,
    });

    debtor.remaining -= amount;
    creditor.remaining -= amount;

    if (debtor.remaining === ZERO) {
      debtorIndex += 1;
    }

    if (creditor.remaining === ZERO) {
      creditorIndex += 1;
    }
  }

  return transfers;
}

function verifyTransfers(members: OptimizerMember[], transfers: SettlementTransfer[]) {
  const deltas = new Map(members.map((member) => [member.memberId, ZERO]));

  for (const transfer of transfers) {
    const amount = parsePositiveInteger(transfer.amountBaseUnits);

    if (amount === null || !deltas.has(transfer.fromMemberId) || !deltas.has(transfer.toMemberId)) {
      return false;
    }

    deltas.set(transfer.fromMemberId, deltas.get(transfer.fromMemberId)! - amount);
    deltas.set(transfer.toMemberId, deltas.get(transfer.toMemberId)! + amount);
  }

  return members.every((member) => deltas.get(member.memberId) === member.net);
}

function parsePositiveInteger(value: string) {
  const parsed = parseNonNegativeInteger(value);

  return parsed && parsed > ZERO ? parsed : null;
}

function parseNonNegativeInteger(value: string) {
  if (!INTEGER_PATTERN.test(value)) {
    return null;
  }

  return BigInt(value);
}

function buildSummaryText(rawIouCount: number, settlementCount: number) {
  if (rawIouCount === 0 && settlementCount === 0) {
    return "No settlement is needed yet.";
  }

  if (settlementCount === 0) {
    return "Everyone is even.";
  }

  if (rawIouCount === settlementCount) {
    return `${rawIouCount} IOUs are already as simple as they can be.`;
  }

  return `${rawIouCount} IOUs became ${settlementCount} ${
    settlementCount === 1 ? "settlement" : "settlements"
  }.`;
}

function engineError(
  code: SettlementEngineError["code"],
  expenseId: string | null,
  memberId: string | null,
  message: string,
): SettlementEngineOutput {
  return {
    error: {
      code,
      expenseId,
      memberId,
      message,
    },
    ok: false,
  };
}

function maskToIndexes(mask: number, count: number) {
  const indexes: number[] = [];

  for (let index = 0; index < count; index += 1) {
    if ((mask & (1 << index)) !== 0) {
      indexes.push(index);
    }
  }

  return indexes;
}

function comparePartition(
  a: { groups: number[][]; score: number },
  b: { groups: number[][]; score: number },
) {
  if (a.score !== b.score) {
    return b.score - a.score;
  }

  return JSON.stringify(a.groups).localeCompare(JSON.stringify(b.groups));
}

function compareMemberInput(a: SettlementMemberInput, b: SettlementMemberInput) {
  return a.id.localeCompare(b.id);
}

function compareSplitInput(a: SettlementSplitInput, b: SettlementSplitInput) {
  return a.memberId.localeCompare(b.memberId) || a.expenseId.localeCompare(b.expenseId);
}

function compareOptimizerMember(a: OptimizerMember, b: OptimizerMember) {
  return a.memberId.localeCompare(b.memberId);
}

function compareOptimizerGroup(a: OptimizerMember[], b: OptimizerMember[]) {
  return a.map((member) => member.memberId).join(":").localeCompare(
    b.map((member) => member.memberId).join(":"),
  );
}

function compareRemaining(
  a: { memberId: string; remaining: bigint },
  b: { memberId: string; remaining: bigint },
) {
  if (a.remaining !== b.remaining) {
    return a.remaining > b.remaining ? -1 : 1;
  }

  return a.memberId.localeCompare(b.memberId);
}

function compareRawIou(a: RawIouEdge, b: RawIouEdge) {
  return (
    a.expenseId.localeCompare(b.expenseId) ||
    a.fromMemberId.localeCompare(b.fromMemberId) ||
    a.toMemberId.localeCompare(b.toMemberId) ||
    a.amountBaseUnits.localeCompare(b.amountBaseUnits)
  );
}

function compareTransfer(a: SettlementTransfer, b: SettlementTransfer) {
  const memberComparison =
    a.fromMemberId.localeCompare(b.fromMemberId) ||
    a.toMemberId.localeCompare(b.toMemberId);

  if (memberComparison !== 0) {
    return memberComparison;
  }

  const aAmount = BigInt(a.amountBaseUnits);
  const bAmount = BigInt(b.amountBaseUnits);

  if (aAmount !== bAmount) {
    return aAmount < bAmount ? -1 : 1;
  }

  return 0;
}
