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
export type AuthorizationMethod =
  | "erc20_allowance"
  | "zerodev_session_key"
  | "zerodev_final_tab";
export type TransactionStatus =
  | "created"
  | "submitted"
  | "userop_submitted"
  | "included"
  | "confirmed"
  | "failed"
  | "reverted"
  | "unknown";
export type SettlementProposalStatus =
  | "draft"
  | "open"
  | "locked"
  | "cancelled"
  | "executed"
  | "failed";

export type TabAuthorizationResponse = {
  allowanceTxHash: string | null;
  authorizationAmountBaseUnits: string | null;
  authorizationMethod: AuthorizationMethod;
  authorizationNonce: string | null;
  authorizationTxHash: string | null;
  capBaseUnits: string;
  confirmedBlock: string | null;
  createdAt: string;
  expiresAt: string;
  id: string;
  maxSingleSettlementBaseUnits: string;
  memberId: string;
  proposalHash: string | null;
  proposalId: string | null;
  revokedAt: string | null;
  revocationTxHash: string | null;
  sessionKeyRef: string | null;
  settlementContractAddress: string;
  tabId: string;
  tokenAddress: string;
  updatedAt: string;
  userOperationHash: string | null;
  walletAddress: string;
};

export type AuthorizationReadinessResponse = {
  allowanceBaseUnits: string | null;
  authorizationAmountBaseUnits: string | null;
  authorizationExpiresAt: string | null;
  authorizationId: string | null;
  blocksSettlement: boolean;
  contractAuthorizationAmountBaseUnits: string | null;
  displayName: string;
  memberId: string;
  owedBaseUnits: string;
  proposalHash: string;
  revoked: boolean;
  status:
    | "checking"
    | "needs_approval"
    | "approved"
    | "expired"
    | "revoked"
    | "stale"
    | "error"
    | "missing_wallet";
  walletAddress: string | null;
};

export type ActivityEventResponse = {
  actorUserId: string | null;
  createdAt: string;
  eventData: unknown;
  eventType: string;
  id: string;
  tabId: string;
};

export type AgreementBlockerResponse = {
  action: "approve_amount" | "none" | "refresh_status" | "review_expenses" | "review_final_tab" | "review_settlement" | "view_receipt";
  amountBaseUnits: string | null;
  category: "agreement" | "execution" | "context";
  id: string;
  kind:
    | "approval_expired"
    | "approval_missing"
    | "approval_revoked"
    | "authorization_unavailable"
    | "expense_confirmation"
    | "final_tab_expired"
    | "final_tab_not_created"
    | "final_tab_not_current"
    | "final_tab_open"
    | "final_tab_replaced"
    | "missing_wallet"
    | "settlement_confirming"
    | "settlement_failed"
    | "disputed_expense";
  memberId: string | null;
  message: string;
  severity: "info" | "warning" | "blocking";
};

export type AgreementReadinessResponse = {
  contextItems: AgreementBlockerResponse[];
  executionBlockers: AgreementBlockerResponse[];
  groupBlockers: AgreementBlockerResponse[];
  headline: string;
  stage: "needs_review" | "awaiting_approval" | "ready_to_settle" | "settling" | "settled" | "needs_refresh";
};

export type AgreementTimelineEventResponse = {
  id: string;
  kind:
    | "tab_created"
    | "expense_added"
    | "expense_confirmed"
    | "expense_disputed"
    | "final_tab_created"
    | "final_tab_locked"
    | "member_authorized"
    | "authorization_revoked"
    | "authorization_expired"
    | "settlement_submitted"
    | "settlement_confirmed"
    | "settlement_failed";
  message: string;
  occurredAt: string;
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
  settlementContractAddress: string | null;
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
  canonicalPayload: unknown;
  chainId: number;
  coordinatorWalletAddress: string;
  createdAt: string;
  createdByUserId: string;
  cancelledAt: string | null;
  debtorAmountsBaseUnits: Record<string, string>;
  executedAt: string | null;
  excludedExpenseIds: string[];
  excludedExpensesHash: string;
  expiresAt: string;
  id: string;
  includedExpenseIds: string[];
  includedExpensesHash: string;
  lockedAt: string | null;
  netBalances: MemberNetBalance[];
  proposalHash: string;
  proposalVersion: number;
  schemaVersion: number;
  settlementContractAddress: string;
  registeredAt: string | null;
  registrationTxHash: string | null;
  cancellationTxHash: string | null;
  onchainCancelledAt: string | null;
  status: SettlementProposalStatus;
  tabId: string;
  tabIdHash: string;
  tabKey: string;
  tokenAddress: string;
  totalAmountBaseUnits: string;
  transfersHash: string;
  transfers: SettlementTransfer[];
  updatedAt: string;
};

export type SettlementPreviewOutcome = {
  amountBaseUnits: string;
  capBaseUnits: string | null;
  direction: "pays" | "receives" | "settled";
  expiresAt: string | null;
  memberId: string;
};

export type SettlementPreviewAuthorizationSummary = {
  authorizationId: string | null;
  capBaseUnits: string | null;
  displayName: string;
  expiresAt: string | null;
  memberId: string;
  owedBaseUnits: string;
  revokedAt: string | null;
  status:
    | "ready"
    | "missing"
    | "expired"
    | "revoked"
    | "insufficient_cap"
    | "missing_wallet"
    | "stale"
    | "checking"
    | "error";
  walletAddress: string | null;
};

export type SettlementPreviewBlocker = {
  expenseId?: string | null;
  id: string;
  kind:
    | "stale_proposal"
    | "expired_proposal"
    | "missing_authorization"
    | "expired_authorization"
    | "revoked_authorization"
    | "insufficient_authorization"
    | "missing_wallet"
    | "unknown_member"
    | "changed_expense"
    | "changed_member"
    | "token_mismatch"
    | "contract_missing"
    | "tab_not_ready"
    | "configuration_missing"
    | "unauthenticated"
    | "unauthorized"
    | "database_unavailable";
  memberId?: string | null;
  message: string;
  severity: "info" | "warning" | "blocking";
};

export type SettlementPreviewThresholdResult = {
  capUsageThresholdPercent: number;
  explicitConfirmationAmountBaseUnits: string;
  lowRiskMaxBaseUnits: string;
  reason:
    | "low_risk"
    | "amount_over_threshold"
    | "cap_usage_over_threshold"
    | "group_debtor_over_threshold";
  requiresExplicitConfirmation: boolean;
};

export type SettlementPreviewSnapshot = {
  authorizationSummaries: SettlementPreviewAuthorizationSummary[];
  currentMemberOutcome: SettlementPreviewOutcome;
  excludedExpenseCount: number;
  excludedExpenseIds: string[];
  includedExpenseCount: number;
  includedExpenseIds: string[];
  netBalances: MemberNetBalance[];
  networkChainId: number;
  networkName: string;
  proposalExpiresAt: string;
  proposalHash: string;
  proposalId: string;
  proposalStatus: "locked";
  proposalUpdatedAt: string;
  settlementContractAddress: string;
  snapshotHash: string;
  tabId: string;
  tabTitle: string;
  tokenAddress: string;
  totalAmountBaseUnits: string;
  transfers: SettlementTransfer[];
};

export type SettlementPreviewResponse = {
  blockers: SettlementPreviewBlocker[];
  canStartCountdown: boolean;
  canStartExecution: boolean;
  countdownSeconds: number;
  snapshot: SettlementPreviewSnapshot | null;
  thresholdResult: SettlementPreviewThresholdResult | null;
};

export type SettlementBlocker = {
  amountBaseUnits: string | null;
  blocksSettlement: boolean;
  displayName: string | null;
  id: string;
  kind:
    | "missing_authorization"
    | "revoked_authorization"
    | "expired_authorization"
    | "insufficient_allowance"
    | "insufficient_balance"
    | "missing_wallet"
    | "stale_proposal"
    | "expired_proposal"
    | "cancelled_proposal"
    | "already_settled"
    | "configuration_missing"
    | "account_unavailable"
    | "chain_unavailable"
    | "unknown";
  memberId: string | null;
  message: string;
  severity: "info" | "warning" | "error";
};

export type SettlementAttemptResponse = {
  attemptNumber: number;
  blockNumber: string | null;
  confirmedBlockNumber: string | null;
  createdAt: string;
  errorMessage: string | null;
  eventLogIndex: number | null;
  eventName: string | null;
  eventProposalHash: string | null;
  eventTabKey: string | null;
  eventTotalAmountBaseUnits: string | null;
  eventTransferCount: number | null;
  eventTransfersHash: string | null;
  failureCode: string | null;
  id: string;
  idempotencyKey: string;
  status: TransactionStatus;
  txHash: string | null;
  updatedAt: string;
  userOperationHash: string | null;
};

export type SettlementPreparedCall = {
  data: `0x${string}`;
  to: `0x${string}`;
  value: string;
};

export type SettlementExecutionResponse = {
  attempt: SettlementAttemptResponse | null;
  blockers: SettlementBlocker[];
  calls?: SettlementPreparedCall[];
  expectedTotalAmountBaseUnits: string;
  expectedTransferCount: number;
  expectedTransfersHash: string;
  idempotencyKey?: string;
  proposalHash: string;
  settlementContractAddress: string;
  state:
    | "idle"
    | "preflighting"
    | "ready"
    | "submitted"
    | "confirming"
    | "verifying"
    | "settled"
    | "retryable_failed"
    | "terminal_failed"
    | "unknown";
  tokenAddress: string;
  chainId: number;
};

export type FinalTabReceiptLifecycleStatus =
  | "empty"
  | "pending"
  | "confirmed"
  | "reconciliation_needed"
  | "failed"
  | "inaccessible";

export type FinalTabReceiptExpense = {
  amountBaseUnits: string | null;
  id: string;
  note: string | null;
  status: ExpenseStatus | string;
  title: string;
};

export type FinalTabReceiptOutcome = {
  amountBaseUnits: string;
  direction: "paid" | "received" | "settled";
  memberId: string;
  memberName: string;
};

export type FinalTabReceiptTransfer = {
  amountBaseUnits: string;
  fromMemberId: string;
  fromMemberName: string;
  fromWalletAddress: string | null;
  id: string;
  toMemberId: string;
  toMemberName: string;
  toWalletAddress: string | null;
};

export type FinalTabReceiptProof = {
  agreementVersion: string;
  authorizationExpiryUsed: string | null;
  authorizedDebtorCount: number;
  authorizedDebtors: string[];
  blockNumber: string | null;
  chainId: number;
  eventName: string | null;
  explorerUrl: string | null;
  includedExpensesHash: string;
  excludedExpensesHash: string;
  networkLabel: "Arbitrum Sepolia";
  proposalHash: string;
  settlementContractAddress: string;
  tabKey: string;
  tokenAddress: string;
  transactionHash: string | null;
  transfersHash: string;
};

export type FinalTabReceiptResponse =
  | {
      status: "confirmed";
      excludedExpenseCount: number;
      excludedReasonSummary: string[];
      excludedExpenses: FinalTabReceiptExpense[];
      includedExpenseCount: number;
      includedExpenseTotalBaseUnits: string;
      includedExpenses: FinalTabReceiptExpense[];
      memberOutcomes: FinalTabReceiptOutcome[];
      proof: FinalTabReceiptProof;
      settledAt: string;
      tab: Pick<TabResponse, "id" | "title" | "status">;
      totalSettledBaseUnits: string;
      transferCount: number;
      transfers: FinalTabReceiptTransfer[];
    }
  | {
      status: Exclude<FinalTabReceiptLifecycleStatus, "confirmed">;
      message: string;
      tabId: string;
    };

export type SettlementProposalMutationResponse = {
  activity?: ActivityEventResponse;
  proposal: SettlementProposalResponse;
};

export type TabSummaryResponse = {
  currentMember: TabMemberResponse | null;
  nextAction: string | null;
  memberCount: number;
  ownerDisplayName: string | null;
  presentationState: "needs_review" | "awaiting_approval" | "ready_to_settle" | "settled" | null;
  tab: TabResponse;
};

export type TabDetailResponse = {
  activity: ActivityEventResponse[];
  agreementReadiness: AgreementReadinessResponse;
  agreementTimeline: AgreementTimelineEventResponse[];
  authorizationReadiness: AuthorizationReadinessResponse[];
  authorizations: TabAuthorizationResponse[];
  expenses: ExpenseResponse[];
  latestSettlementAttempt: SettlementAttemptResponse | null;
  latestProposal: SettlementProposalResponse | null;
  members: TabMemberResponse[];
  splits: ExpenseSplitResponse[];
  confirmations: ExpenseConfirmationResponse[];
  tab: TabResponse;
};
