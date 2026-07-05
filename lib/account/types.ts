export type WalletStatus = "loading" | "ready" | "unavailable";

export type Account = {
  id: string;
  email: string | null;
  displayName: string;
  walletAddress: string;
  walletStatus: WalletStatus;
};

export type AccountResponse = {
  id: string;
  email: string | null;
  displayName: string;
  walletAddress: string;
};

export type AccountErrorCode =
  | "login_invalid"
  | "wallet_unavailable"
  | "account_unavailable"
  | "configuration_missing";
