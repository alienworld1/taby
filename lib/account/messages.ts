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
    case "settlement_account_mismatch":
      return "This tab is linked to a different settlement account.";
    case "zerodev_config_mismatch":
      return "Settlement is not configured for this network yet.";
    case "zerodev_not_ready":
      return "We could not prepare settlement. Try again before approving this Final Tab.";
    case "sponsorship_unavailable":
      return "Settlement is not available right now. Try again in a moment.";
    default:
      return "Something got in the way. Try again.";
  }
}
