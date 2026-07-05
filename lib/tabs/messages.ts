import type { TabErrorCode } from "@/lib/tabs/types";

export function tabErrorMessage(code: TabErrorCode) {
  switch (code) {
    case "unauthenticated":
      return "Sign in to continue.";
    case "unauthorized":
      return "You do not have access to this tab.";
    case "not_found":
      return "We could not find that tab.";
    case "database_unavailable":
      return "We could not save that change. Try again.";
    case "validation_failed":
      return "Check the details and try again.";
    case "invalid_amount":
      return "Enter an amount greater than zero.";
    case "invalid_split_total":
      return "The split needs to add up to the expense total.";
    case "invalid_member":
      return "Choose a member from this tab.";
    case "invalid_transition":
      return "That change is no longer available.";
    case "expense_not_involved":
      return "Only members included in this expense can confirm it.";
    case "proposal_not_ready":
      return "Only confirmed expenses can enter settlement.";
    case "configuration_missing":
      return "This action is not ready yet.";
    case "account_unavailable":
      return "We could not load your account. Sign in again to continue.";
    case "settlement_engine_unavailable":
      return "Settlement preview is not ready yet.";
    case "stale_record":
      return "This changed recently. Refresh and try again.";
    default:
      return "Something got in the way. Try again.";
  }
}
