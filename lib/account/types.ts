export type WalletStatus = "loading" | "ready" | "unavailable";

export type SettlementAccountType = "magic_eoa_7702" | "zerodev_kernel";
export type DelegationStatus =
  | "not_initialized"
  | "pending"
  | "ready"
  | "failed"
  | "fallback_required";
export type PaymasterPolicyStatus =
  | "unknown"
  | "available"
  | "rejected"
  | "misconfigured";
export type UserOperationPurpose =
  | "diagnostic_batch"
  | "account_initialization"
  | "final_tab_registration"
  | "final_tab_authorization"
  | "final_tab_revocation"
  | "final_tab_cancellation"
  | "final_tab_settlement"
  | "delegated_permission_installation"
  | "delegated_final_tab_authorization";
export type UserOperationStatus = "submitted" | "confirmed" | "failed" | "timed_out";

export type SettlementAccountReadiness = {
  accountType: SettlementAccountType;
  chainId: number;
  configHash: string;
  delegationConfirmedAt: string | null;
  delegationStatus: DelegationStatus;
  entryPointVersion: string;
  kernelVersion: string;
  lastCheckedAt: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastTransactionHash: string | null;
  lastUserOperationHash: string | null;
  magicWalletAddress: string;
  paymasterPolicyStatus: PaymasterPolicyStatus;
  settlementAddress: string;
  zeroDevProjectIdHash: string;
};

export type UserOperationRecordResponse = {
  purpose: UserOperationPurpose;
  status: UserOperationStatus;
  transactionHash: string | null;
  userOperationHash: string;
};

export type Account = {
  id: string;
  email: string | null;
  displayName: string;
  settlementAccount: SettlementAccountReadiness | null;
  walletAddress: string;
  walletStatus: WalletStatus;
};

export type AccountResponse = {
  id: string;
  email: string | null;
  displayName: string;
  settlementAccount: SettlementAccountReadiness | null;
  walletAddress: string;
};

export type AccountErrorCode =
  | "login_invalid"
  | "wallet_unavailable"
  | "account_unavailable"
  | "configuration_missing"
  | "settlement_account_mismatch"
  | "zerodev_config_mismatch"
  | "zerodev_not_ready"
  | "sponsorship_unavailable";
