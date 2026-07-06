import type {
  ExpenseResponse,
  SettlementProposalResponse,
  TabAuthorizationResponse,
  TabDetailResponse,
  TabMemberResponse,
} from "@/lib/tabs/types";
import type { SettlementEngineResult } from "@/lib/tabs/settlement";

export type ProposalBlocker = {
  blocksCreate: boolean;
  blocksFutureSettlement: boolean;
  blocksLock: boolean;
  id: string;
  kind:
    | "no_confirmed_expenses"
    | "zero_transfers"
    | "disputed_expense"
    | "missing_wallet"
    | "missing_authorization"
    | "expired_proposal"
    | "stale_proposal"
    | "invalid_state";
  message: string;
  severity: "info" | "warning" | "blocking";
};

export function isMutableTab(status: TabDetailResponse["tab"]["status"]) {
  return status === "active" || status === "review";
}

export function isExpired(proposal: SettlementProposalResponse | null, nowMs: number | null) {
  return proposal && nowMs !== null ? new Date(proposal.expiresAt).getTime() <= nowMs : false;
}

export function formatExpiry(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function shortHash(hash: string) {
  if (hash.length <= 18) {
    return hash;
  }

  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export function buildProposalBlockers(input: {
  authorizations: TabAuthorizationResponse[];
  currentMember: TabMemberResponse | null;
  detail: TabDetailResponse;
  nowMs: number | null;
  proposal: SettlementProposalResponse | null;
  settlement: SettlementEngineResult | null;
}) {
  const blockers: ProposalBlocker[] = [];
  const confirmedCount = input.detail.expenses.filter(
    (expense) => expense.status === "confirmed",
  ).length;
  const proposal = input.proposal;
  const transfers = proposal?.transfers ?? input.settlement?.transfers ?? [];

  if (!input.currentMember || input.currentMember.joinStatus !== "joined") {
    blockers.push({
      blocksCreate: true,
      blocksFutureSettlement: true,
      blocksLock: true,
      id: "not-joined",
      kind: "invalid_state",
      message: "Join this tab before creating or locking a proposal.",
      severity: "blocking",
    });
  }

  if (!isMutableTab(input.detail.tab.status) && !proposal) {
    blockers.push({
      blocksCreate: true,
      blocksFutureSettlement: true,
      blocksLock: true,
      id: "tab-read-only",
      kind: "invalid_state",
      message: "That change is no longer available.",
      severity: "blocking",
    });
  }

  if (confirmedCount === 0) {
    blockers.push({
      blocksCreate: true,
      blocksFutureSettlement: true,
      blocksLock: false,
      id: "no-confirmed-expenses",
      kind: "no_confirmed_expenses",
      message: "Confirm at least one expense before creating a proposal.",
      severity: "info",
    });
  }

  if (confirmedCount > 0 && input.settlement && input.settlement.transfers.length === 0) {
    blockers.push({
      blocksCreate: true,
      blocksFutureSettlement: false,
      blocksLock: true,
      id: "zero-transfers",
      kind: "zero_transfers",
      message: "Everyone is even, so there is nothing to settle.",
      severity: "info",
    });
  }

  for (const expense of input.detail.expenses.filter((item) => item.status === "disputed")) {
    blockers.push({
      blocksCreate: false,
      blocksFutureSettlement: true,
      blocksLock: false,
      id: `disputed-${expense.id}`,
      kind: "disputed_expense",
      message: `${expense.title} is disputed and stays outside settlement.`,
      severity: "warning",
    });
  }

  const memberById = new Map(input.detail.members.map((member) => [member.id, member]));
  const activeAuthorizationMembers = new Set(
    input.authorizations
      .filter(
        (authorization) =>
          !authorization.revokedAt &&
          (input.nowMs === null ||
            new Date(authorization.expiresAt).getTime() > input.nowMs),
      )
      .map((authorization) => authorization.memberId),
  );
  const transferMemberIds = new Set(
    transfers.flatMap((transfer) => [transfer.fromMemberId, transfer.toMemberId]),
  );

  for (const memberId of transferMemberIds) {
    const member = memberById.get(memberId);

    if (!member?.walletAddress) {
      blockers.push({
        blocksCreate: false,
        blocksFutureSettlement: true,
        blocksLock: true,
        id: `wallet-${memberId}`,
        kind: "missing_wallet",
        message: `${member?.displayName ?? "A member"} needs a wallet before settlement can continue.`,
        severity: "blocking",
      });
    }
  }

  const debtorMemberIds = new Set(transfers.map((transfer) => transfer.fromMemberId));

  for (const debtorMemberId of debtorMemberIds) {
    const member = memberById.get(debtorMemberId);

    if (!activeAuthorizationMembers.has(debtorMemberId)) {
      blockers.push({
        blocksCreate: false,
        blocksFutureSettlement: true,
        blocksLock: false,
        id: `authorization-${debtorMemberId}`,
        kind: "missing_authorization",
        message: `${member?.displayName ?? "A member"} still needs to authorize their share.`,
        severity: "warning",
      });
    }
  }

  if (proposal && isExpired(proposal, input.nowMs)) {
    blockers.push({
      blocksCreate: false,
      blocksFutureSettlement: true,
      blocksLock: true,
      id: "expired-proposal",
      kind: "expired_proposal",
      message: "This proposal expired. Create a fresh proposal before settlement.",
      severity: "blocking",
    });
  }

  return dedupeBlockers(blockers);
}

export function getExpenseReason(expense: ExpenseResponse) {
  switch (expense.status) {
    case "confirmed":
      return "Confirmed";
    case "pending":
      return "Waiting for review";
    case "disputed":
      return "Disputed";
    case "excluded":
      return "Outside settlement";
    case "locked":
      return "Locked in a proposal";
    case "settled":
      return "Already settled";
    default:
      return "Outside settlement";
  }
}

function dedupeBlockers(blockers: ProposalBlocker[]) {
  const seen = new Set<string>();

  return blockers.filter((blocker) => {
    if (seen.has(blocker.id)) {
      return false;
    }

    seen.add(blocker.id);
    return true;
  });
}
