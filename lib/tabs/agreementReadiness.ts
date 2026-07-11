import type {
  AgreementBlockerResponse,
  AgreementReadinessResponse,
  AuthorizationReadinessResponse,
  ExpenseConfirmationResponse,
  ExpenseResponse,
  SettlementAttemptResponse,
  SettlementProposalResponse,
  TabMemberResponse,
} from "@/lib/tabs/types";

type Input = {
  authorizationReadiness: AuthorizationReadinessResponse[];
  confirmations: ExpenseConfirmationResponse[];
  expenses: ExpenseResponse[];
  latestAttempt: SettlementAttemptResponse | null;
  members: TabMemberResponse[];
  hasSettlementTransfers: boolean;
  proposal: SettlementProposalResponse | null;
  nowMs: number;
  verifiedSettled: boolean;
};

function item(input: Omit<AgreementBlockerResponse, "amountBaseUnits" | "memberId" | "severity"> & Partial<Pick<AgreementBlockerResponse, "amountBaseUnits" | "memberId" | "severity">>): AgreementBlockerResponse {
  return { amountBaseUnits: null, memberId: null, severity: "blocking", ...input };
}

function response(stage: AgreementReadinessResponse["stage"], headline: string, groupBlockers: AgreementBlockerResponse[] = [], executionBlockers: AgreementBlockerResponse[] = [], contextItems: AgreementBlockerResponse[] = []): AgreementReadinessResponse {
  return { contextItems, executionBlockers, groupBlockers, headline, stage };
}

export function buildAgreementReadiness(input: Input): AgreementReadinessResponse {
  const { proposal, latestAttempt } = input;
  if (input.verifiedSettled) return response("settled", "Final Tab settled.");

  if (latestAttempt && ["created", "submitted", "userop_submitted", "included", "unknown"].includes(latestAttempt.status)) {
    const blocker = item({ action: "refresh_status", category: "execution", id: `attempt:${latestAttempt.id}`, kind: "settlement_confirming", message: "Settlement is confirming." });
    return response("settling", blocker.message, [], [blocker]);
  }
  if (latestAttempt && ["failed", "reverted"].includes(latestAttempt.status)) {
    const blocker = item({ action: "refresh_status", category: "execution", id: `attempt:${latestAttempt.id}`, kind: "settlement_failed", message: "Settlement did not go through. Nothing moved." });
    return response("needs_refresh", blocker.message, [], [blocker]);
  }

  const contextItems = input.expenses.filter((expense) => expense.status === "disputed").sort((a, b) => a.title.localeCompare(b.title)).map((expense) => item({ action: "none", category: "context", id: `disputed:${expense.id}`, kind: "disputed_expense", message: `${expense.title} is disputed and stays outside settlement.`, severity: "info" }));
  if (!proposal) {
    const memberById = new Map(input.members.map((member) => [member.id, member]));
    const groupBlockers = input.expenses.filter((expense) => expense.status === "pending").flatMap((expense) => input.confirmations.filter((confirmation) => confirmation.expenseId === expense.id && confirmation.status === "pending").map((confirmation) => item({ action: "review_expenses", category: "agreement", id: `confirmation:${confirmation.id}`, kind: "expense_confirmation", memberId: confirmation.memberId, message: `${memberById.get(confirmation.memberId)?.displayName ?? "A group member"} still needs to confirm ${expense.title}.` }))).sort((a, b) => a.message.localeCompare(b.message));
    if (groupBlockers.length) return response("needs_review", groupBlockers[0].message, groupBlockers, [], contextItems);
    const confirmed = input.expenses.filter((expense) => expense.status === "confirmed");
    if (!confirmed.length) return response("needs_review", "Add expenses when your group is ready to review them.", [], [], contextItems);
    if (!input.hasSettlementTransfers) return response("needs_review", "Everyone is even. There is nothing to settle.", [], [], contextItems);
    return response("needs_review", "Create a Final Tab when the group is ready.", [item({ action: "review_final_tab", category: "agreement", id: "final-tab:not-created", kind: "final_tab_not_created", message: "Create a Final Tab when the group is ready." })], [], contextItems);
  }
  if (proposal.status === "open") {
    const blocker = item({ action: "review_final_tab", category: "agreement", id: `proposal:${proposal.id}`, kind: "final_tab_open", message: "Review and lock this Final Tab before approvals can begin." });
    return response("needs_review", blocker.message, [blocker], [], contextItems);
  }
  const expired = new Date(proposal.expiresAt).getTime() <= input.nowMs;
  if (proposal.status !== "locked" || proposal.cancelledAt || proposal.onchainCancelledAt) {
    const blocker = item({ action: "review_final_tab", category: "agreement", id: `proposal:${proposal.id}`, kind: "final_tab_not_current", message: "This Final Tab is no longer current. Review the latest Final Tab." });
    return response("needs_review", blocker.message, [blocker], [], contextItems);
  }
  if (expired) {
    const blocker = item({ action: "review_final_tab", category: "execution", id: `proposal:${proposal.id}:expired`, kind: "final_tab_expired", message: "This Final Tab expired. Create a fresh one before settling." });
    return response("needs_refresh", blocker.message, [], [blocker], contextItems);
  }
  const readinessByMember = new Map(input.authorizationReadiness.map((readiness) => [readiness.memberId, readiness]));
  const debtorIds = [...new Set(proposal.transfers.map((transfer) => transfer.fromMemberId))];
  const executionBlockers = debtorIds.flatMap((memberId) => {
    const readiness = readinessByMember.get(memberId);
    if (!readiness || readiness.blocksSettlement) {
      const displayName = readiness?.displayName ?? input.members.find((member) => member.id === memberId)?.displayName ?? "A group member";
      const base = { action: readiness?.status === "needs_approval" || readiness?.status === "revoked" || readiness?.status === "expired" ? "approve_amount" as const : "refresh_status" as const, amountBaseUnits: readiness?.owedBaseUnits ?? proposal.debtorAmountsBaseUnits[memberId] ?? null, category: "execution" as const, id: `authorization:${memberId}`, memberId };
      if (readiness?.status === "revoked") return [item({ ...base, kind: "approval_revoked", message: `${displayName} needs to approve again before settlement can continue.` })];
      if (readiness?.status === "expired") return [item({ ...base, kind: "approval_expired", message: `${displayName}'s approval expired. Approve this Final Tab again.` })];
      if (readiness?.status === "missing_wallet") return [item({ ...base, action: "none", kind: "missing_wallet", message: `${displayName} needs a settlement account before approval can continue.` })];
      if (!readiness || ["checking", "stale", "error"].includes(readiness.status)) return [item({ ...base, action: "refresh_status", kind: "authorization_unavailable", message: "Approval status is still checking. Refresh status before settlement can continue." })];
      return [item({ ...base, kind: "approval_missing", message: `${displayName} needs to approve ${formatAmount(base.amountBaseUnits)}.` })];
    }
    return [];
  });
  if (executionBlockers.length) return response("awaiting_approval", executionBlockers[0].message, [], executionBlockers, contextItems);
  if (!debtorIds.length) return response("needs_review", "Everyone is even. There is nothing to settle.", [], [], contextItems);
  return response("ready_to_settle", "This Final Tab is ready to settle.", [], [item({ action: "review_settlement", category: "execution", id: `proposal:${proposal.id}:ready`, kind: "approval_missing", message: "Everyone approved this Final Tab.", severity: "info" })], contextItems);
}

function formatAmount(amount: string | null) {
  if (!amount) return "their amount";
  const value = BigInt(amount); const whole = value / BigInt(1_000_000); const fraction = (value % BigInt(1_000_000)).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${fraction} USDC`;
}
