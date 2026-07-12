import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tabStatusEnum = pgEnum("tab_status", [
  "draft",
  "active",
  "review",
  "locked",
  "settling",
  "settled",
  "cancelled",
]);

export const tabMemberRoleEnum = pgEnum("tab_member_role", ["owner", "member"]);
export const tabMemberJoinStatusEnum = pgEnum("tab_member_join_status", [
  "invited",
  "joined",
  "removed",
]);
export const tabMemberReadinessStatusEnum = pgEnum("tab_member_readiness_status", [
  "not_ready",
  "reviewing",
  "ready",
  "needs_action",
  "settled",
]);

export const expenseSplitMethodEnum = pgEnum("expense_split_method", ["equal", "custom"]);
export const expenseStatusEnum = pgEnum("expense_status", [
  "pending",
  "confirmed",
  "disputed",
  "excluded",
  "locked",
  "settled",
]);
export const expenseConfirmationStatusEnum = pgEnum("expense_confirmation_status", [
  "pending",
  "confirmed",
  "disputed",
]);

export const authorizationMethodEnum = pgEnum("authorization_method", [
  "erc20_allowance",
  "zerodev_session_key",
  "zerodev_final_tab",
]);
export const settlementProposalStatusEnum = pgEnum("settlement_proposal_status", [
  "draft",
  "open",
  "locked",
  "cancelled",
  "executed",
  "failed",
]);
export const settlementTransactionStatusEnum = pgEnum("settlement_transaction_status", [
  "created",
  "submitted",
  "userop_submitted",
  "included",
  "confirmed",
  "failed",
  "reverted",
  "unknown",
]);
export const settlementAccountTypeEnum = pgEnum("settlement_account_type", [
  "magic_eoa_7702",
  "zerodev_kernel",
]);
export const delegationStatusEnum = pgEnum("delegation_status", [
  "not_initialized",
  "pending",
  "ready",
  "failed",
  "fallback_required",
]);
export const paymasterPolicyStatusEnum = pgEnum("paymaster_policy_status", [
  "unknown",
  "available",
  "rejected",
  "misconfigured",
]);
export const userOperationPurposeEnum = pgEnum("user_operation_purpose", [
  "diagnostic_batch",
  "account_initialization",
  "final_tab_registration",
  "final_tab_authorization",
  "final_tab_revocation",
  "final_tab_cancellation",
  "final_tab_settlement",
  "delegated_permission_installation",
  "delegated_final_tab_authorization",
  "settlement_withdrawal",
]);
export const userOperationStatusEnum = pgEnum("user_operation_status", [
  "submitted",
  "confirmed",
  "failed",
  "timed_out",
]);
export const withdrawalTransactionStatusEnum = pgEnum("withdrawal_transaction_status", [
  "created",
  "submitted",
  "confirmed",
  "rejected",
  "reverted",
  "unknown",
]);
export const delegatedAuthorizationPermissionStatusEnum = pgEnum(
  "delegated_authorization_permission_status",
  [
    "preparing",
    "permission_pending",
    "execution_submitted",
    "confirmed",
    "cancelled",
    "revoked",
    "expired",
    "failed",
    "unknown",
  ],
);
export const delegatedAuthorizationCustodyModeEnum = pgEnum(
  "delegated_authorization_custody_mode",
  ["remote_signer", "envelope_encrypted"],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    magicUserId: text("magic_user_id").notNull(),
    email: text("email"),
    displayName: text("display_name").notNull(),
    walletAddress: text("wallet_address").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("users_magic_user_id_idx").on(table.magicUserId)],
);

export type User = typeof users.$inferSelect;

export const userSettlementAccounts = pgTable(
  "user_settlement_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    magicWalletAddress: text("magic_wallet_address").notNull(),
    settlementAddress: text("settlement_address").notNull(),
    accountType: settlementAccountTypeEnum("account_type").notNull(),
    chainId: integer("chain_id").notNull(),
    zeroDevProjectIdHash: text("zerodev_project_id_hash").notNull(),
    kernelVersion: text("kernel_version").notNull(),
    entryPointVersion: text("entry_point_version").notNull(),
    paymasterPolicyStatus: paymasterPolicyStatusEnum("paymaster_policy_status")
      .default("unknown")
      .notNull(),
    lastUserOperationHash: text("last_user_operation_hash"),
    lastTransactionHash: text("last_transaction_hash"),
    delegationStatus: delegationStatusEnum("delegation_status")
      .default("not_initialized")
      .notNull(),
    delegationConfirmedAt: timestamp("delegation_confirmed_at", {
      mode: "date",
      withTimezone: true,
    }),
    configHash: text("config_hash").notNull(),
    lastCheckedAt: timestamp("last_checked_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    diagnostics: jsonb("diagnostics"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("user_settlement_accounts_status_idx").on(table.delegationStatus),
    uniqueIndex("user_settlement_accounts_user_config_idx").on(
      table.userId,
      table.configHash,
    ),
  ],
);

export type UserSettlementAccount = typeof userSettlementAccounts.$inferSelect;

export const userOperationRecords = pgTable(
  "user_operation_records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userOperationHash: text("user_operation_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    settlementAccountId: uuid("settlement_account_id").references(
      () => userSettlementAccounts.id,
    ),
    purpose: userOperationPurposeEnum("purpose").notNull(),
    status: userOperationStatusEnum("status").notNull(),
    submittedAt: timestamp("submitted_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    confirmedAt: timestamp("confirmed_at", { mode: "date", withTimezone: true }),
    transactionHash: text("transaction_hash"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("user_operation_records_user_idx").on(table.userId),
    index("user_operation_records_status_idx").on(table.status),
    uniqueIndex("user_operation_records_hash_idx").on(table.userOperationHash),
  ],
);

export type UserOperationRecord = typeof userOperationRecords.$inferSelect;

export const withdrawalTransactions = pgTable(
  "withdrawal_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id),
    settlementAccountId: uuid("settlement_account_id").notNull().references(() => userSettlementAccounts.id),
    recipientAddress: text("recipient_address").notNull(),
    amountBaseUnits: bigint("amount_base_units", { mode: "bigint" }).notNull(),
    reservedAmountBaseUnits: bigint("reserved_amount_base_units", { mode: "bigint" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    userOperationHash: text("user_operation_hash"),
    txHash: text("tx_hash"),
    status: withdrawalTransactionStatusEnum("status").notNull(),
    failureCode: text("failure_code"),
    errorMessage: text("error_message"),
    lastReconciledAt: timestamp("last_reconciled_at", { mode: "date", withTimezone: true }),
    reconcileAttemptCount: integer("reconcile_attempt_count").default(0).notNull(),
    lastReconcileErrorCode: text("last_reconcile_error_code"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("withdrawal_transactions_user_status_idx").on(table.userId, table.status),
    uniqueIndex("withdrawal_transactions_idempotency_idx").on(table.userId, table.idempotencyKey),
    uniqueIndex("withdrawal_transactions_userop_idx").on(table.userOperationHash),
    uniqueIndex("withdrawal_transactions_chain_tx_idx").on(table.txHash),
  ],
);

export type WithdrawalTransaction = typeof withdrawalTransactions.$inferSelect;

export const delegatedAuthorizationPermissions = pgTable(
  "delegated_authorization_permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tabId: uuid("tab_id")
      .notNull()
      .references(() => tabs.id),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => settlementProposals.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tabMembers.id),
    settlementAccountId: uuid("settlement_account_id")
      .notNull()
      .references(() => userSettlementAccounts.id),
    proposalHash: text("proposal_hash").notNull(),
    tabKey: text("tab_key").notNull(),
    walletAddress: text("wallet_address").notNull(),
    exactAmountBaseUnits: bigint("exact_amount_base_units", { mode: "bigint" }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    permissionSignerAddress: text("permission_signer_address").notNull(),
    policyDigest: text("policy_digest").notNull(),
    permissionSerialization: jsonb("permission_serialization").notNull(),
    credentialReference: text("credential_reference").notNull(),
    custodyMode: delegatedAuthorizationCustodyModeEnum("custody_mode").notNull(),
    status: delegatedAuthorizationPermissionStatusEnum("status")
      .default("preparing")
      .notNull(),
    installationUserOperationHash: text("installation_user_operation_hash"),
    installationTransactionHash: text("installation_transaction_hash"),
    executionUserOperationHash: text("execution_user_operation_hash"),
    executionTransactionHash: text("execution_transaction_hash"),
    executionAttemptCount: integer("execution_attempt_count").default(0).notNull(),
    lastExecutionAt: timestamp("last_execution_at", { mode: "date", withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    usedAt: timestamp("used_at", { mode: "date", withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { mode: "date", withTimezone: true }),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    credentialDestroyedAt: timestamp("credential_destroyed_at", {
      mode: "date",
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("delegated_authorization_permissions_proposal_status_idx").on(
      table.proposalId,
      table.status,
    ),
    index("delegated_authorization_permissions_expiry_status_idx").on(
      table.expiresAt,
      table.status,
    ),
    uniqueIndex("delegated_authorization_permissions_installation_userop_idx").on(
      table.installationUserOperationHash,
    ),
    uniqueIndex("delegated_authorization_permissions_execution_userop_idx").on(
      table.executionUserOperationHash,
    ),
  ],
);

export type DelegatedAuthorizationPermission =
  typeof delegatedAuthorizationPermissions.$inferSelect;

export const tabs = pgTable(
  "tabs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id),
    networkChainId: integer("network_chain_id").notNull(),
    tokenAddress: text("token_address").notNull(),
    status: tabStatusEnum("status").default("active").notNull(),
    defaultCapBaseUnits: bigint("default_cap_base_units", { mode: "bigint" }).notNull(),
    defaultExpiryHours: integer("default_expiry_hours").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    settledAt: timestamp("settled_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    index("tabs_owner_user_id_idx").on(table.ownerUserId),
    index("tabs_status_idx").on(table.status),
  ],
);

export const tabMembers = pgTable(
  "tab_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tabId: uuid("tab_id")
      .notNull()
      .references(() => tabs.id),
    userId: uuid("user_id").references(() => users.id),
    displayName: text("display_name").notNull(),
    walletAddress: text("wallet_address"),
    role: tabMemberRoleEnum("role").default("member").notNull(),
    joinStatus: tabMemberJoinStatusEnum("join_status").default("invited").notNull(),
    readinessStatus: tabMemberReadinessStatusEnum("readiness_status")
      .default("not_ready")
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tab_members_tab_id_idx").on(table.tabId),
    index("tab_members_user_id_idx").on(table.userId),
    uniqueIndex("tab_members_tab_user_idx").on(table.tabId, table.userId),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tabId: uuid("tab_id")
      .notNull()
      .references(() => tabs.id),
    payerMemberId: uuid("payer_member_id")
      .notNull()
      .references(() => tabMembers.id),
    title: text("title").notNull(),
    note: text("note"),
    amountBaseUnits: bigint("amount_base_units", { mode: "bigint" }).notNull(),
    tokenAddress: text("token_address").notNull(),
    splitMethod: expenseSplitMethodEnum("split_method").notNull(),
    status: expenseStatusEnum("status").default("pending").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("expenses_tab_id_idx").on(table.tabId),
    index("expenses_payer_member_id_idx").on(table.payerMemberId),
    index("expenses_status_idx").on(table.status),
  ],
);

export const expenseSplits = pgTable(
  "expense_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tabMembers.id),
    shareBaseUnits: bigint("share_base_units", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("expense_splits_expense_id_idx").on(table.expenseId),
    index("expense_splits_member_id_idx").on(table.memberId),
    uniqueIndex("expense_splits_expense_member_idx").on(table.expenseId, table.memberId),
  ],
);

export const expenseConfirmations = pgTable(
  "expense_confirmations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tabMembers.id),
    status: expenseConfirmationStatusEnum("status").default("pending").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("expense_confirmations_expense_id_idx").on(table.expenseId),
    index("expense_confirmations_member_id_idx").on(table.memberId),
    uniqueIndex("expense_confirmations_expense_member_idx").on(
      table.expenseId,
      table.memberId,
    ),
  ],
);

export const tabAuthorizations = pgTable(
  "tab_authorizations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tabId: uuid("tab_id")
      .notNull()
      .references(() => tabs.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => tabMembers.id),
    proposalId: uuid("proposal_id").references(() => settlementProposals.id),
    proposalHash: text("proposal_hash"),
    walletAddress: text("wallet_address").notNull(),
    tokenAddress: text("token_address").notNull(),
    settlementContractAddress: text("settlement_contract_address").notNull(),
    authorizationAmountBaseUnits: bigint("authorization_amount_base_units", {
      mode: "bigint",
    }),
    capBaseUnits: bigint("cap_base_units", { mode: "bigint" }).notNull(),
    maxSingleSettlementBaseUnits: bigint("max_single_settlement_base_units", {
      mode: "bigint",
    }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    authorizationNonce: bigint("authorization_nonce", { mode: "bigint" }),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    authorizationMethod: authorizationMethodEnum("authorization_method")
      .default("erc20_allowance")
      .notNull(),
    allowanceTxHash: text("allowance_tx_hash"),
    userOperationHash: text("user_operation_hash"),
    authorizationTxHash: text("authorization_tx_hash"),
    revocationTxHash: text("revocation_tx_hash"),
    confirmedBlock: bigint("confirmed_block", { mode: "bigint" }),
    sessionKeyRef: text("session_key_ref"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("tab_authorizations_tab_id_idx").on(table.tabId),
    index("tab_authorizations_member_id_idx").on(table.memberId),
    index("tab_authorizations_proposal_idx").on(table.proposalId),
    index("tab_authorizations_proposal_hash_idx").on(table.proposalHash),
  ],
);

export const settlementProposals = pgTable(
  "settlement_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tabId: uuid("tab_id")
      .notNull()
      .references(() => tabs.id),
    schemaVersion: integer("schema_version").default(1).notNull(),
    proposalVersion: integer("proposal_version").notNull(),
    canonicalPayloadJson: jsonb("canonical_payload_json").notNull(),
    proposalHash: text("proposal_hash").notNull(),
    tabIdHash: text("tab_id_hash").notNull(),
    tabKey: text("tab_key").notNull(),
    includedExpensesHash: text("included_expenses_hash").notNull(),
    excludedExpensesHash: text("excluded_expenses_hash").notNull(),
    transfersHash: text("transfers_hash").notNull(),
    chainId: integer("chain_id").notNull(),
    tokenAddress: text("token_address").notNull(),
    settlementContractAddress: text("settlement_contract_address").notNull(),
    coordinatorWalletAddress: text("coordinator_wallet_address").notNull(),
    status: settlementProposalStatusEnum("status").default("draft").notNull(),
    includedExpenseIds: uuid("included_expense_ids").array().notNull(),
    excludedExpenseIds: uuid("excluded_expense_ids").array().notNull(),
    netBalancesJson: jsonb("net_balances_json").notNull(),
    transfersJson: jsonb("transfers_json").notNull(),
    totalAmountBaseUnits: bigint("total_amount_base_units", { mode: "bigint" }).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { mode: "date", withTimezone: true }),
    registrationTxHash: text("registration_tx_hash"),
    registeredAt: timestamp("registered_at", { mode: "date", withTimezone: true }),
    cancellationTxHash: text("cancellation_tx_hash"),
    onchainCancelledAt: timestamp("onchain_cancelled_at", {
      mode: "date",
      withTimezone: true,
    }),
    cancelledAt: timestamp("cancelled_at", { mode: "date", withTimezone: true }),
    executedAt: timestamp("executed_at", { mode: "date", withTimezone: true }),
  },
  (table) => [
    index("settlement_proposals_tab_id_idx").on(table.tabId),
    index("settlement_proposals_proposal_hash_idx").on(table.proposalHash),
    index("settlement_proposals_tab_key_idx").on(table.tabKey),
    uniqueIndex("settlement_proposals_tab_version_idx").on(
      table.tabId,
      table.proposalVersion,
    ),
  ],
);

export const settlementTransactions = pgTable(
  "settlement_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => settlementProposals.id),
    tabId: uuid("tab_id")
      .notNull()
      .references(() => tabs.id),
    chainId: integer("chain_id").notNull(),
    tokenAddress: text("token_address").notNull(),
    settlementContractAddress: text("settlement_contract_address").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    submittedByUserId: uuid("submitted_by_user_id")
      .notNull()
      .references(() => users.id),
    settlementAccountId: uuid("settlement_account_id").references(
      () => userSettlementAccounts.id,
    ),
    userOperationHash: text("user_operation_hash"),
    txHash: text("tx_hash"),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    confirmedBlockNumber: bigint("confirmed_block_number", { mode: "bigint" }),
    eventLogIndex: integer("event_log_index"),
    eventName: text("event_name"),
    eventProposalHash: text("event_proposal_hash"),
    eventTabKey: text("event_tab_key"),
    eventTransfersHash: text("event_transfers_hash"),
    eventTotalAmountBaseUnits: bigint("event_total_amount_base_units", { mode: "bigint" }),
    eventTransferCount: integer("event_transfer_count"),
    status: settlementTransactionStatusEnum("status").notNull(),
    failureCode: text("failure_code"),
    errorMessage: text("error_message"),
    lastReconciledAt: timestamp("last_reconciled_at", { mode: "date", withTimezone: true }),
    reconcileAttemptCount: integer("reconcile_attempt_count").default(0).notNull(),
    lastReconcileErrorCode: text("last_reconcile_error_code"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("settlement_transactions_proposal_id_idx").on(table.proposalId),
    index("settlement_transactions_tab_id_idx").on(table.tabId),
    index("settlement_transactions_status_idx").on(table.status),
    uniqueIndex("settlement_transactions_proposal_attempt_idx").on(
      table.proposalId,
      table.attemptNumber,
    ),
    uniqueIndex("settlement_transactions_idempotency_idx").on(table.idempotencyKey),
    uniqueIndex("settlement_transactions_chain_tx_idx").on(table.chainId, table.txHash),
  ],
);

export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tabId: uuid("tab_id")
      .notNull()
      .references(() => tabs.id),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    eventType: text("event_type").notNull(),
    eventData: jsonb("event_data").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("activity_events_tab_id_created_at_idx").on(table.tabId, table.createdAt),
    index("activity_events_actor_user_id_idx").on(table.actorUserId),
  ],
);

export type Tab = typeof tabs.$inferSelect;
export type TabMember = typeof tabMembers.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseSplit = typeof expenseSplits.$inferSelect;
export type ExpenseConfirmation = typeof expenseConfirmations.$inferSelect;
export type TabAuthorization = typeof tabAuthorizations.$inferSelect;
export type SettlementProposal = typeof settlementProposals.$inferSelect;
export type SettlementTransaction = typeof settlementTransactions.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
