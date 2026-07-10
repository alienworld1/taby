import { TABY_USDC_ADDRESS } from "@/lib/tabs/constants";
import type {
  SettlementProposalResponse,
  TabAuthorizationResponse,
  TabDetailResponse,
  TabMemberResponse,
} from "@/lib/tabs/types";

export type AuthorizationStatusValue =
  | "not_authorized"
  | "checking"
  | "approving"
  | "authorized"
  | "expired"
  | "revoked"
  | "insufficient_allowance"
  | "wallet_unavailable"
  | "configuration_missing"
  | "error";

export type AuthorizationReadinessItem = {
  blocksSettlement: boolean;
  capBaseUnits: string | null;
  displayName: string;
  expiresAt: string | null;
  memberId: string;
  message: string;
  owedBaseUnits: string;
  status: AuthorizationStatusValue;
};

export type AllowanceRead = {
  allowanceBaseUnits: string;
  balanceBaseUnits: string | null;
  checkedAt: number;
};

const ERC20_ALLOWANCE_SELECTOR = "0xdd62ed3e";
const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
const ERC20_BALANCE_OF_SELECTOR = "0x70a08231";
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function normalizeAddress(value: string | null | undefined) {
  return value && EVM_ADDRESS_PATTERN.test(value) ? value.toLowerCase() : null;
}

export function isExpectedToken(tokenAddress: string) {
  return normalizeAddress(tokenAddress) === TABY_USDC_ADDRESS.toLowerCase();
}

export function deriveDebtorAmounts(proposal: SettlementProposalResponse | null) {
  const amounts = new Map<string, bigint>();

  if (!proposal || proposal.status !== "locked") {
    return amounts;
  }

  for (const transfer of proposal.transfers) {
    const current = amounts.get(transfer.fromMemberId) ?? BigInt(0);
    amounts.set(transfer.fromMemberId, current + BigInt(transfer.amountBaseUnits));
  }

  return amounts;
}

export function getLatestAuthorization(
  authorizations: TabAuthorizationResponse[],
  memberId: string,
) {
  return [...authorizations]
    .filter((authorization) => authorization.memberId === memberId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

export function getVisibleCapBaseUnits(detail: TabDetailResponse, owedBaseUnits: bigint) {
  const defaultCap = BigInt(detail.tab.defaultCapBaseUnits);
  return defaultCap >= owedBaseUnits ? defaultCap : owedBaseUnits;
}

export function getDefaultExpiry(detail: TabDetailResponse) {
  return new Date(Date.now() + detail.tab.defaultExpiryHours * 60 * 60 * 1000).toISOString();
}

export function buildReadinessItems(input: {
  allowanceByMemberId?: Map<string, string>;
  authorizations: TabAuthorizationResponse[];
  debtorAmounts: Map<string, bigint>;
  membersById: Map<string, TabMemberResponse>;
  nowMs: number | null;
}) {
  const items: AuthorizationReadinessItem[] = [];

  for (const [memberId, owed] of input.debtorAmounts) {
    const member = input.membersById.get(memberId);
    const authorization = getLatestAuthorization(input.authorizations, memberId);
    const allowance = input.allowanceByMemberId?.get(memberId);
    const status = getAuthorizationStatus({
      allowanceBaseUnits: allowance ?? null,
      authorization,
      nowMs: input.nowMs,
      owedBaseUnits: owed,
    });

    items.push({
      blocksSettlement: status !== "authorized",
      capBaseUnits: authorization?.capBaseUnits ?? null,
      displayName: member?.displayName ?? "A member",
      expiresAt: authorization?.expiresAt ?? null,
      memberId,
      message: statusMessage(status),
      owedBaseUnits: owed.toString(),
      status,
    });
  }

  return items.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function getAuthorizationStatus(input: {
  allowanceBaseUnits: string | null;
  authorization: TabAuthorizationResponse | null;
  nowMs: number | null;
  owedBaseUnits: bigint;
}): AuthorizationStatusValue {
  if (!input.authorization) {
    return "not_authorized";
  }

  if (input.authorization.revokedAt) {
    return "revoked";
  }

  if (
    input.nowMs !== null &&
    new Date(input.authorization.expiresAt).getTime() <= input.nowMs
  ) {
    return "expired";
  }

  const cap = BigInt(input.authorization.capBaseUnits);

  if (cap !== input.owedBaseUnits) {
    return "insufficient_allowance";
  }

  if (input.allowanceBaseUnits !== null && BigInt(input.allowanceBaseUnits) !== cap) {
    return "insufficient_allowance";
  }

  return "authorized";
}

export function statusMessage(status: AuthorizationStatusValue) {
  switch (status) {
    case "authorized":
      return "Approved";
    case "expired":
      return "Expired";
    case "revoked":
      return "Revoked";
    case "insufficient_allowance":
      return "Needs approval";
    case "checking":
      return "Checking approval";
    case "approving":
      return "Approving";
    case "wallet_unavailable":
      return "Wallet unavailable";
    case "configuration_missing":
      return "Not configured";
    case "error":
      return "Needs refresh";
    case "not_authorized":
    default:
      return "Needs approval";
  }
}

export function isUserRejectedError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? error.code : null;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";

  return code === 4001 || /reject|cancel|denied/i.test(message);
}

export function isGasError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return /gas|fund|eth|fee/i.test(message);
}

export function encodeAllowanceCall(owner: string, spender: string) {
  return `${ERC20_ALLOWANCE_SELECTOR}${encodeAddress(owner)}${encodeAddress(spender)}`;
}

export function encodeBalanceCall(owner: string) {
  return `${ERC20_BALANCE_OF_SELECTOR}${encodeAddress(owner)}`;
}

export function encodeApproveCall(spender: string, amountBaseUnits: string) {
  return `${ERC20_APPROVE_SELECTOR}${encodeAddress(spender)}${encodeUint256(amountBaseUnits)}`;
}

export function decodeUint256(hex: string) {
  if (!hex || hex === "0x") {
    return "0";
  }

  return BigInt(hex).toString();
}

function encodeAddress(address: string) {
  const normalized = normalizeAddress(address);

  if (!normalized) {
    throw new Error("invalid_address");
  }

  return normalized.slice(2).padStart(64, "0");
}

function encodeUint256(value: string) {
  const amount = BigInt(value);

  if (amount < BigInt(0)) {
    throw new Error("invalid_amount");
  }

  return amount.toString(16).padStart(64, "0");
}
