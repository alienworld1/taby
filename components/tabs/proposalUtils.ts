import type {
  AuthorizationReadinessResponse,
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
    | "expired_authorization"
    | "revoked_authorization"
    | "insufficient_authorization"
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
  const finalTabIsStale = proposal ? isFinalTabStale(input.detail, proposal) : false;

  if (!input.currentMember || input.currentMember.joinStatus !== "joined") {
    blockers.push({
      blocksCreate: true,
      blocksFutureSettlement: true,
      blocksLock: true,
      id: "not-joined",
      kind: "invalid_state",
      message: "Join this tab before creating or locking a Final Tab.",
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
      message: "Confirmed expenses will appear here when your group is ready.",
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
  const readinessByMemberId = new Map(
    input.detail.authorizationReadiness.map((item) => [item.memberId, item]),
  );

  for (const debtorMemberId of debtorMemberIds) {
    const member = memberById.get(debtorMemberId);
    const owed = transfers
      .filter((transfer) => transfer.fromMemberId === debtorMemberId)
      .reduce((total, transfer) => total + BigInt(transfer.amountBaseUnits), BigInt(0));
    const readiness = readinessByMemberId.get(debtorMemberId);
    const authorization = input.authorizations
      .filter(
        (item) =>
          item.memberId === debtorMemberId &&
          (!proposal?.id || item.proposalId === proposal.id) &&
          (!proposal?.proposalHash ||
            item.proposalHash?.toLowerCase() === proposal.proposalHash.toLowerCase()),
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

    if (readiness) {
      const blocker = authorizationReadinessBlocker(readiness);

      if (blocker) {
        blockers.push({
          blocksCreate: false,
          blocksFutureSettlement: true,
          blocksLock: false,
          id: `${blocker.kind}-${debtorMemberId}`,
          kind: blocker.kind,
          message: blocker.message,
          severity: blocker.severity,
        });
      }
    } else if (!authorization) {
      blockers.push({
        blocksCreate: false,
        blocksFutureSettlement: true,
        blocksLock: false,
        id: `authorization-${debtorMemberId}`,
        kind: "missing_authorization",
        message: `${member?.displayName ?? "A member"} still needs to authorize their share.`,
        severity: "warning",
      });
    } else if (authorization.revokedAt) {
      blockers.push({
        blocksCreate: false,
        blocksFutureSettlement: true,
        blocksLock: false,
        id: `authorization-revoked-${debtorMemberId}`,
        kind: "revoked_authorization",
        message: `${member?.displayName ?? "A member"} revoked authorization for their share.`,
        severity: "warning",
      });
    } else if (
      input.nowMs !== null &&
      new Date(authorization.expiresAt).getTime() <= input.nowMs
    ) {
      blockers.push({
        blocksCreate: false,
        blocksFutureSettlement: true,
        blocksLock: false,
        id: `authorization-expired-${debtorMemberId}`,
        kind: "expired_authorization",
        message: `${member?.displayName ?? "A member"} needs to authorize again because their permission expired.`,
        severity: "warning",
      });
    } else if (BigInt(authorization.capBaseUnits) < owed) {
      blockers.push({
        blocksCreate: false,
        blocksFutureSettlement: true,
        blocksLock: false,
        id: `authorization-insufficient-${debtorMemberId}`,
        kind: "insufficient_authorization",
        message: `${member?.displayName ?? "A member"} needs approval for their exact share.`,
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
      message: "This Final Tab expired. Create a fresh one before settling.",
      severity: "blocking",
    });
  }

  if (proposal && finalTabIsStale) {
    blockers.push({
      blocksCreate: false,
      blocksFutureSettlement: true,
      blocksLock: true,
      id: "stale-final-tab",
      kind: "stale_proposal",
      message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
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
      return "Locked in a Final Tab";
    case "settled":
      return "Already settled";
    default:
      return "Outside settlement";
  }
}

function authorizationReadinessBlocker(readiness: AuthorizationReadinessResponse) {
  switch (readiness.status) {
    case "approved":
      return null;
    case "expired":
      return {
        kind: "expired_authorization" as const,
        message: `${readiness.displayName} needs to approve again because their approval expired.`,
        severity: "warning" as const,
      };
    case "revoked":
      return {
        kind: "revoked_authorization" as const,
        message: `${readiness.displayName} needs to approve again before settlement can continue.`,
        severity: "warning" as const,
      };
    case "missing_wallet":
      return {
        kind: "missing_wallet" as const,
        message: `${readiness.displayName} needs a wallet before settlement can continue.`,
        severity: "blocking" as const,
      };
    case "stale":
    case "error":
      return {
        kind: "stale_proposal" as const,
        message: "Refresh status before settlement can continue.",
        severity: "blocking" as const,
      };
    case "checking":
      return {
        kind: "missing_authorization" as const,
        message: `${readiness.displayName}'s approval is still checking.`,
        severity: "warning" as const,
      };
    case "needs_approval":
    default:
      return {
        kind: "missing_authorization" as const,
        message: `${readiness.displayName} still needs to approve their share.`,
        severity: "warning" as const,
      };
  }
}

function isFinalTabStale(detail: TabDetailResponse, proposal: SettlementProposalResponse) {
  if (
    detail.tab.networkChainId !== proposal.chainId ||
    detail.tab.tokenAddress.toLowerCase() !== proposal.tokenAddress.toLowerCase() ||
    (detail.tab.settlementContractAddress ?? "").toLowerCase() !==
      proposal.settlementContractAddress.toLowerCase()
  ) {
    return true;
  }

  if (!isRecord(proposal.canonicalPayload)) {
    return false;
  }

  const includedSnapshots = getArray(proposal.canonicalPayload.includedExpenses);
  const excludedSnapshots = getArray(proposal.canonicalPayload.excludedExpenses);
  const expenseById = new Map(detail.expenses.map((expense) => [expense.id, expense]));
  const splitsByExpenseId = new Map<string, { memberId: string; shareBaseUnits: string }[]>();

  for (const split of detail.splits) {
    const rows = splitsByExpenseId.get(split.expenseId) ?? [];
    rows.push({ memberId: split.memberId, shareBaseUnits: split.shareBaseUnits });
    splitsByExpenseId.set(split.expenseId, rows);
  }

  for (const snapshot of includedSnapshots) {
    if (!isRecord(snapshot) || typeof snapshot.expenseId !== "string") {
      return true;
    }

    const expense = expenseById.get(snapshot.expenseId);

    if (
      !expense ||
      (expense.status !== "confirmed" && expense.status !== "locked") ||
      expense.amountBaseUnits !== snapshot.amountBaseUnits ||
      expense.payerMemberId !== snapshot.payerMemberId ||
      expense.tokenAddress.toLowerCase() !== String(snapshot.tokenAddress).toLowerCase()
    ) {
      return true;
    }

    const currentSplits = [...(splitsByExpenseId.get(expense.id) ?? [])].sort((a, b) =>
      a.memberId.localeCompare(b.memberId),
    );
    const snapshotSplits = getArray(snapshot.splitEntries)
      .filter(isRecord)
      .map((split) => ({
        memberId: String(split.memberId),
        shareBaseUnits: String(split.shareBaseUnits),
      }))
      .sort((a, b) => a.memberId.localeCompare(b.memberId));

    if (JSON.stringify(currentSplits) !== JSON.stringify(snapshotSplits)) {
      return true;
    }
  }

  for (const snapshot of excludedSnapshots) {
    if (!isRecord(snapshot) || typeof snapshot.expenseId !== "string") {
      return true;
    }

    const expense = expenseById.get(snapshot.expenseId);

    if (!expense || expense.status !== snapshot.status) {
      return true;
    }
  }

  return false;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
