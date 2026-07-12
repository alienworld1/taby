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
      return "We could not prepare settlement right now. Refresh status or try again later.";
    case "validation_failed":
      return "Check the details and try again.";
    case "invalid_amount":
      return "Enter an amount greater than zero.";
    case "invalid_split_total":
      return "The split needs to add up to the expense total.";
    case "invalid_member":
      return "Choose a member from this tab.";
    case "invite_not_found":
      return "This invite is no longer available.";
    case "member_already_exists":
      return "They are already in this tab.";
    case "invalid_transition":
      return "That change is no longer available.";
    case "self_invite":
      return "You are already the owner of this tab.";
    case "user_not_found":
      return "That email is not on Taby yet.";
    case "expense_not_involved":
      return "Only members included in this expense can confirm it.";
    case "proposal_not_ready":
      return "Confirmed expenses will appear here when your group is ready.";
    case "configuration_missing":
      return "We could not prepare settlement right now. Refresh status or try again later.";
    case "account_unavailable":
      return "Your secure settlement account is not ready yet. Refresh status to continue.";
    case "settlement_engine_unavailable":
      return "We could not prepare the Final Tab.";
    case "stale_record":
      return "Something changed. Cancel this Final Tab and create a fresh one before settlement.";
    default:
      return "Something got in the way. Try again.";
  }
}
