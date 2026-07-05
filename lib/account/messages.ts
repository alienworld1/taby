import type { AccountErrorCode } from "@/lib/account/types";

export function accountErrorMessage(code: AccountErrorCode | null) {
  switch (code) {
    case "login_invalid":
      return "We couldn’t finish sign-in. Try again.";
    case "wallet_unavailable":
      return "We couldn’t load your wallet yet. Try again in a moment.";
    case "account_unavailable":
      return "We couldn’t save your account. Your sign-in is still safe; try again.";
    case "configuration_missing":
      return "Account setup is not configured yet.";
    default:
      return "Something got in the way. Try again.";
  }
}
