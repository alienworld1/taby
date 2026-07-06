import { tabErrorMessage } from "@/lib/tabs/messages";
import type {
  ActivityEventResponse,
  ExpenseConfirmationResponse,
  ExpenseResponse,
  ExpenseSplitResponse,
  SettlementProposalMutationResponse,
  TabAuthorizationResponse,
  TabDetailResponse,
  TabErrorCode,
  TabMemberResponse,
  TabResponse,
  TabSummaryResponse,
} from "@/lib/tabs/types";

export type TabClientError = {
  code: TabErrorCode;
  details?: string[];
  message: string;
};

export type CreateTabResponse = {
  activity: ActivityEventResponse;
  ownerMember: TabMemberResponse;
  tab: TabResponse;
};

export type AddMemberResponse = {
  activity: ActivityEventResponse;
  member: TabMemberResponse;
};

export type InviteMemberResponse = AddMemberResponse;
export type AcceptInviteResponse = AddMemberResponse;

export type AddExpenseResponse = {
  activity: ActivityEventResponse;
  confirmations: ExpenseConfirmationResponse[];
  expense: ExpenseResponse;
  splits: ExpenseSplitResponse[];
};

export type ReviewExpenseResponse = {
  activity: ActivityEventResponse;
  allConfirmedActivity: ActivityEventResponse | null;
  confirmation: ExpenseConfirmationResponse;
  expense: ExpenseResponse;
};

export type RemoveExpenseResponse = {
  activity: ActivityEventResponse;
  expenseId: string;
};

export type ProposalMutationResponse = SettlementProposalMutationResponse;

export type AuthorizationMutationResponse = {
  activity: ActivityEventResponse;
  authorization: TabAuthorizationResponse;
};

function isTabErrorCode(value: unknown): value is TabErrorCode {
  return (
    value === "unauthenticated" ||
    value === "unauthorized" ||
    value === "not_found" ||
    value === "account_unavailable" ||
    value === "database_unavailable" ||
    value === "configuration_missing" ||
    value === "validation_failed" ||
    value === "invalid_amount" ||
    value === "invalid_split_total" ||
    value === "invalid_member" ||
    value === "invite_not_found" ||
    value === "member_already_exists" ||
    value === "invalid_transition" ||
    value === "self_invite" ||
    value === "user_not_found" ||
    value === "expense_not_involved" ||
    value === "proposal_not_ready" ||
    value === "settlement_engine_unavailable" ||
    value === "stale_record"
  );
}

async function parsePayload(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function requestTaby<T>(path: string, didToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${didToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = await parsePayload(response);

  if (!response.ok) {
    const code =
      payload &&
      typeof payload === "object" &&
      "code" in payload &&
      isTabErrorCode(payload.code)
        ? payload.code
        : "database_unavailable";
    const details =
      payload &&
      typeof payload === "object" &&
      "details" in payload &&
      Array.isArray(payload.details)
        ? payload.details.filter((detail): detail is string => typeof detail === "string")
        : undefined;

    throw {
      code,
      details,
      message: details?.[0] ?? tabErrorMessage(code),
    } satisfies TabClientError;
  }

  return payload as T;
}

export function toTabClientError(error: unknown): TabClientError {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    isTabErrorCode(error.code)
  ) {
    return {
      code: error.code,
      details:
        "details" in error && Array.isArray(error.details)
          ? error.details.filter((detail): detail is string => typeof detail === "string")
          : undefined,
      message:
        "message" in error && typeof error.message === "string"
          ? error.message
          : tabErrorMessage(error.code),
    };
  }

  return {
    code: "database_unavailable",
    message: tabErrorMessage("database_unavailable"),
  };
}

export function fetchTabs(didToken: string) {
  return requestTaby<TabSummaryResponse[]>("/api/tabs", didToken);
}

export function createTabRequest(
  didToken: string,
  input: { description?: string; title: string },
) {
  return requestTaby<CreateTabResponse>("/api/tabs", didToken, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function fetchTabDetail(didToken: string, tabId: string) {
  return requestTaby<TabDetailResponse>(`/api/tabs/${tabId}`, didToken);
}

export function addMemberRequest(
  didToken: string,
  tabId: string,
  input: { displayName: string },
) {
  return requestTaby<AddMemberResponse>(`/api/tabs/${tabId}/members`, didToken, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function inviteMemberRequest(
  didToken: string,
  tabId: string,
  input: { email: string },
) {
  return requestTaby<InviteMemberResponse>(`/api/tabs/${tabId}/invites`, didToken, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function acceptInviteRequest(didToken: string, tabId: string) {
  return requestTaby<AcceptInviteResponse>(`/api/tabs/${tabId}/invites/accept`, didToken, {
    body: JSON.stringify({}),
    method: "POST",
  });
}

export function addExpenseRequest(
  didToken: string,
  tabId: string,
  input: {
    amountBaseUnits: string;
    note?: string;
    payerMemberId: string;
    splitMethod: "equal" | "custom";
    splits: Array<{ memberId: string; shareBaseUnits?: string }>;
    title: string;
  },
) {
  return requestTaby<AddExpenseResponse>(`/api/tabs/${tabId}/expenses`, didToken, {
    body: JSON.stringify(input),
    method: "POST",
  });
}

export function confirmExpenseRequest(didToken: string, expenseId: string) {
  return requestTaby<ReviewExpenseResponse>(`/api/expenses/${expenseId}/confirm`, didToken, {
    body: JSON.stringify({}),
    method: "POST",
  });
}

export function disputeExpenseRequest(didToken: string, expenseId: string, reason: string) {
  return requestTaby<ReviewExpenseResponse>(`/api/expenses/${expenseId}/dispute`, didToken, {
    body: JSON.stringify({ reason }),
    method: "POST",
  });
}

export function removeExpenseRequest(didToken: string, expenseId: string) {
  return requestTaby<RemoveExpenseResponse>(`/api/expenses/${expenseId}`, didToken, {
    method: "DELETE",
  });
}

export function createProposalRequest(didToken: string, tabId: string) {
  return requestTaby<ProposalMutationResponse>(`/api/tabs/${tabId}/proposals`, didToken, {
    body: JSON.stringify({}),
    method: "POST",
  });
}

export function lockProposalRequest(didToken: string, proposalId: string) {
  return requestTaby<ProposalMutationResponse>(`/api/proposals/${proposalId}/lock`, didToken, {
    body: JSON.stringify({}),
    method: "POST",
  });
}

export function cancelProposalRequest(didToken: string, proposalId: string) {
  return requestTaby<ProposalMutationResponse>(
    `/api/proposals/${proposalId}/cancel`,
    didToken,
    {
      body: JSON.stringify({}),
      method: "POST",
    },
  );
}

export function recordAuthorizationRequest(
  didToken: string,
  tabId: string,
  input: {
    allowanceTxHash: string;
    authorizationMethod: "erc20_allowance";
    capBaseUnits: string;
    expiresAt: string;
    maxSingleSettlementBaseUnits: string;
    memberId: string;
    settlementContractAddress: string;
    tokenAddress: string;
    walletAddress: string;
  },
) {
  return requestTaby<AuthorizationMutationResponse>(
    `/api/tabs/${tabId}/authorizations`,
    didToken,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}

export function revokeAuthorizationRequest(
  didToken: string,
  authorizationId: string,
  input: { revokeTxHash?: string | null },
) {
  return requestTaby<AuthorizationMutationResponse>(
    `/api/authorizations/${authorizationId}/revoke`,
    didToken,
    {
      body: JSON.stringify(input),
      method: "POST",
    },
  );
}
