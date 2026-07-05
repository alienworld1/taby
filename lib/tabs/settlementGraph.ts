import { formatUsdc } from "@/lib/tabs/money";
import type {
  MemberNetBalance,
  RawIouEdge,
  SettlementEngineResult,
  SettlementTransfer,
} from "@/lib/tabs/settlement";
import type { ExpenseResponse, TabDetailResponse, TabMemberResponse } from "@/lib/tabs/types";

export type SettlementGraphMode = "before" | "after";

export type SettlementGraphMember = {
  balanceDirection: MemberNetBalance["direction"];
  displayName: string;
  id: string;
  initials: string;
  joinStatus: TabMemberResponse["joinStatus"];
  netBaseUnits: string;
  readinessStatus: string;
  role: TabMemberResponse["role"];
  statusText: string;
  walletAddress: string | null;
};

export type SettlementGraphEdge = {
  amountBaseUnits: string;
  expenseIds: string[];
  fromMemberId: string;
  id: string;
  isAggregated: boolean;
  label: string;
  mode: SettlementGraphMode;
  subtitle: string;
  toMemberId: string;
};

export type ExcludedExpenseSummaryItem = {
  amountBaseUnits: string;
  id: string;
  payerMemberId: string;
  status: ExpenseResponse["status"];
  title: string;
};

export type SettlementGraphData = {
  afterEdges: SettlementGraphEdge[];
  beforeEdges: SettlementGraphEdge[];
  excludedExpenses: ExcludedExpenseSummaryItem[];
  members: SettlementGraphMember[];
};

export type SettlementGraphBuildResult =
  | { data: SettlementGraphData; ok: true }
  | { error: string; fallbackData: SettlementGraphData; ok: false };

const ZERO = BigInt(0);

export function buildSettlementGraphData(
  detail: TabDetailResponse,
  settlement: SettlementEngineResult,
): SettlementGraphBuildResult {
  const balancesByMemberId = new Map(
    settlement.balances.map((balance) => [balance.memberId, balance]),
  );
  const joinedMembers = detail.members.filter((member) => member.joinStatus === "joined");
  const graphMembers = joinedMembers.map((member) => {
    const balance = balancesByMemberId.get(member.id);

    return {
      balanceDirection: balance?.direction ?? "settled",
      displayName: member.displayName,
      id: member.id,
      initials: getInitials(member.displayName),
      joinStatus: member.joinStatus,
      netBaseUnits: balance?.netBaseUnits ?? "0",
      readinessStatus: member.readinessStatus,
      role: member.role,
      statusText: balance ? getMemberStatusText(balance) : "Settled",
      walletAddress: member.walletAddress,
    } satisfies SettlementGraphMember;
  });
  const memberIds = new Set(graphMembers.map((member) => member.id));
  const beforeEdges = aggregateRawIous(settlement.rawIous).filter((edge) =>
    isValidGraphEdge(edge, memberIds),
  );
  const afterEdges = settlement.transfers
    .map(toAfterGraphEdge)
    .filter((edge) => isValidGraphEdge(edge, memberIds));
  const excludedExpenses = detail.expenses
    .filter((expense) => settlement.excludedExpenseIds.includes(expense.id))
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((expense) => ({
      amountBaseUnits: expense.amountBaseUnits,
      id: expense.id,
      payerMemberId: expense.payerMemberId,
      status: expense.status,
      title: expense.title,
    }));
  const data = {
    afterEdges,
    beforeEdges,
    excludedExpenses,
    members: graphMembers,
  } satisfies SettlementGraphData;
  const hasInvalidBeforeEdge = beforeEdges.length !== aggregateRawIous(settlement.rawIous).length;
  const hasInvalidAfterEdge = afterEdges.length !== settlement.transfers.length;

  if (hasInvalidBeforeEdge || hasInvalidAfterEdge) {
    return {
      error: "Graph endpoints must match joined tab members.",
      fallbackData: data,
      ok: false,
    };
  }

  return { data, ok: true };
}

function aggregateRawIous(rawIous: RawIouEdge[]) {
  const edgesByPair = new Map<string, SettlementGraphEdge>();

  for (const rawIou of rawIous) {
    if (BigInt(rawIou.amountBaseUnits) <= ZERO) {
      continue;
    }

    const key = `${rawIou.fromMemberId}->${rawIou.toMemberId}`;
    const existing = edgesByPair.get(key);

    if (!existing) {
      edgesByPair.set(key, {
        amountBaseUnits: rawIou.amountBaseUnits,
        expenseIds: [rawIou.expenseId],
        fromMemberId: rawIou.fromMemberId,
        id: rawIou.id,
        isAggregated: false,
        label: formatUsdc(rawIou.amountBaseUnits),
        mode: "before",
        subtitle: "1 expense",
        toMemberId: rawIou.toMemberId,
      });
      continue;
    }

    const amount = BigInt(existing.amountBaseUnits) + BigInt(rawIou.amountBaseUnits);
    const expenseIds = [...existing.expenseIds, rawIou.expenseId];

    edgesByPair.set(key, {
      ...existing,
      amountBaseUnits: amount.toString(),
      expenseIds,
      id: `before:${rawIou.fromMemberId}:${rawIou.toMemberId}`,
      isAggregated: true,
      label: formatUsdc(amount),
      subtitle: `${expenseIds.length} expenses`,
    });
  }

  return [...edgesByPair.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function toAfterGraphEdge(transfer: SettlementTransfer) {
  return {
    amountBaseUnits: transfer.amountBaseUnits,
    expenseIds: [],
    fromMemberId: transfer.fromMemberId,
    id: transfer.id,
    isAggregated: false,
    label: formatUsdc(transfer.amountBaseUnits),
    mode: "after",
    subtitle: "Final transfer",
    toMemberId: transfer.toMemberId,
  } satisfies SettlementGraphEdge;
}

function isValidGraphEdge(edge: SettlementGraphEdge, memberIds: Set<string>) {
  return (
    BigInt(edge.amountBaseUnits) > ZERO &&
    memberIds.has(edge.fromMemberId) &&
    memberIds.has(edge.toMemberId)
  );
}

function getMemberStatusText(balance: MemberNetBalance) {
  const net = BigInt(balance.netBaseUnits);

  if (balance.direction === "receives") {
    return `Receives ${formatUsdc(net)}`;
  }

  if (balance.direction === "pays") {
    return `Pays ${formatUsdc(-net)}`;
  }

  return "Settled";
}

function getInitials(displayName: string) {
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.at(0)?.toUpperCase() ?? "")
    .join("");

  return initials || "T";
}
