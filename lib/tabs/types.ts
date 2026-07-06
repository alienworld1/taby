import type { MemberNetBalance, SettlementTransfer } from "./settlement";

export type TabErrorCode =
  | "unauthenticated"
  | "unauthorized"
  | "not_found"
  | "account_unavailable"
  | "database_unavailable"
  | "configuration_missing"
  | "validation_failed"
  | "invalid_amount"
  | "invalid_split_total"
  | "invalid_member"
  | "invite_not_found"
  | "member_already_exists"
  | "invalid_transition"
  | "self_invite"
  | "user_not_found"
  | "expense_not_involved"
  | "proposal_not_ready"
  | "settlement_engine_unavailable"
  | "stale_record";

export type TabResult<T> =
  | { data: T; ok: true }
  | { code: TabErrorCode; details?: string[]; ok: false; status: number };

export type TabStatus =
  | "draft"
  | "active"
  | "review"
  | "locked"
  | "settling"
  | "settled"
  | "cancelled";

export type ExpenseStatus =
  | "pending"
  | "confirmed"
  | "disputed"
  | "excluded"
  | "locked"
  | "settled";

export type MemberRole = "owner" | "member";
export type MemberJoinStatus = "invited" | "joined" | "removed";
export type ConfirmationStatus = "pending" | "confirmed" | "disputed";
export type AuthorizationMethod = "erc20_allowance" | "zerodev_session_key";
export type TransactionStatus = "submitted" | "confirmed" | "failed";
export type SettlementProposalStatus =
  | "draft"
  | "open"
  | "locked"
  | "cancelled"
  | "executed"
  | "failed";

export type TabAuthorizationResponse = {
  allowanceTxHash: string | null;
  authorizationMethod: AuthorizationMethod;
  capBaseUnits: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  maxSingleSettlementBaseUnits: string;
  memberId: string;
  revokedAt: string | null;
  sessionKeyRef: string | null;
  settlementContractAddress: string;
  tabId: string;
  tokenAddress: string;
  updatedAt: string;
  walletAddress: string;
};

export type ActivityEventResponse = {
  actorUserId: string | null;
  createdAt: string;
  eventData: unknown;
  eventType: string;
  id: string;
  tabId: string;
};

export type TabMemberResponse = {
  displayName: string;
  id: string;
  joinStatus: MemberJoinStatus;
  readinessStatus: string;
  role: MemberRole;
  tabId: string;
  userId: string | null;
  walletAddress: string | null;
};

export type TabResponse = {
  defaultCapBaseUnits: string;
  defaultExpiryHours: number;
  description: string | null;
  id: string;
  networkChainId: number;
  ownerUserId: string;
  status: TabStatus;
  title: string;
  tokenAddress: string;
};

export type ExpenseSplitResponse = {
  expenseId: string;
  id: string;
  memberId: string;
  shareBaseUnits: string;
};

export type ExpenseConfirmationResponse = {
  expenseId: string;
  id: string;
  memberId: string;
  reason: string | null;
  status: ConfirmationStatus;
};

export type ExpenseResponse = {
  amountBaseUnits: string;
  createdByUserId: string;
  id: string;
  note: string | null;
  payerMemberId: string;
  splitMethod: "equal" | "custom";
  status: ExpenseStatus;
  tabId: string;
  title: string;
  tokenAddress: string;
};

export type SettlementProposalResponse = {
  createdAt: string;
  createdByUserId: string;
  debtorAmountsBaseUnits: Record<string, string>;
  executedAt: string | null;
  excludedExpenseIds: string[];
  expiresAt: string;
  id: string;
  includedExpenseIds: string[];
  netBalances: MemberNetBalance[];
  proposalHash: string;
  status: SettlementProposalStatus;
  tabId: string;
  totalAmountBaseUnits: string;
  transfers: SettlementTransfer[];
  updatedAt: string;
};

export type SettlementProposalMutationResponse = {
  activity?: ActivityEventResponse;
  proposal: SettlementProposalResponse;
};

export type TabSummaryResponse = {
  currentMember: TabMemberResponse | null;
  memberCount: number;
  ownerDisplayName: string | null;
  tab: TabResponse;
};

export type TabDetailResponse = {
  activity: ActivityEventResponse[];
  authorizations: TabAuthorizationResponse[];
  expenses: ExpenseResponse[];
  latestProposal: SettlementProposalResponse | null;
  members: TabMemberResponse[];
  splits: ExpenseSplitResponse[];
  confirmations: ExpenseConfirmationResponse[];
  tab: TabResponse;
};
