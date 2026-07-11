import { createHash } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Magic } from "@magic-sdk/admin";
import { createPublicClient, decodeEventLog, erc20Abi, http, isAddressEqual } from "viem";
import type { Address, Hex } from "viem";
import { arbitrumSepolia } from "viem/chains";
import { normalizeEmail } from "@/lib/account/validation";
import {
  getServerZeroDevRpcUrl,
  getZeroDevAccountConfig,
} from "@/lib/account/zerodev/config";
import {
  TABY_CHAIN_ID,
  TABY_DEFAULT_CAP_BASE_UNITS,
  TABY_DEFAULT_EXPIRY_HOURS,
  TABY_USDC_ADDRESS,
  getSettlementContractAddress,
} from "@/lib/tabs/constants";
import { getDb, hasDatabaseConfig } from "@/lib/db/client";
import {
  activityEvents,
  expenseConfirmations,
  expenses,
  expenseSplits,
  settlementProposals,
  settlementTransactions,
  tabAuthorizations,
  tabMembers,
  tabs,
  userOperationRecords,
  userSettlementAccounts,
  users,
  type ActivityEvent,
  type Expense,
  type ExpenseConfirmation,
  type ExpenseSplit,
  type SettlementProposal,
  type SettlementTransaction,
  type Tab,
  type TabAuthorization,
  type TabMember,
  type User,
  type UserSettlementAccount,
} from "@/lib/db/schema";
import { proposalDto } from "@/lib/tabs/proposals";
import { buildFinalTab } from "@/lib/tabs/finalTab";
import {
  encodeAuthorizeFinalTabBatch,
  encodeCancelFinalTabCall,
  encodeRegisterFinalTabCall,
  encodeRevokeFinalTabBatch,
  encodeSettleFinalTabCall,
  tabySettlementAbi,
  type EncodedSettlementCall,
} from "@/lib/tabs/contract";
import { hashFinalTabPayload, type FinalTabPayload } from "@/lib/tabs/finalTab";
import {
  calculateSettlement,
  createSettlementInputsFromTabDetail,
} from "@/lib/tabs/settlement";
import {
  isEvmTxHash,
  isUuid,
  normalizeEvmAddress,
  normalizeText,
  parseBaseUnits,
  parseNonNegativeBaseUnits,
  parseOptionalPositiveInteger,
} from "@/lib/tabs/validation";
import type {
  ActivityEventResponse,
  AuthorizationReadinessResponse,
  ExpenseConfirmationResponse,
  ExpenseResponse,
  ExpenseSplitResponse,
  SettlementProposalMutationResponse,
  SettlementPreviewAuthorizationSummary,
  SettlementPreviewBlocker,
  SettlementBlocker,
  SettlementExecutionResponse,
  SettlementAttemptResponse,
  SettlementProposalResponse,
  SettlementPreviewResponse,
  SettlementPreviewSnapshot,
  SettlementPreviewThresholdResult,
  TabDetailResponse,
  TabErrorCode,
  TabMemberResponse,
  TabResponse,
  TabResult,
  TabSummaryResponse,
  TabAuthorizationResponse,
} from "@/lib/tabs/types";

type MagicMetadata = {
  issuer?: string | null;
};

type CurrentUser = {
  magicUserId: string;
  user: User;
};

type AccessContext = {
  currentMember: TabMember | null;
  isOwner: boolean;
  tab: Tab;
};

type SplitInput = {
  memberId: unknown;
  shareBaseUnits?: unknown;
};

const MUTABLE_TAB_STATUSES = new Set(["active", "review"]);
const REVIEWABLE_TAB_STATUSES = new Set(["active", "review", "locked"]);
const SETTLEMENT_PREVIEW_COUNTDOWN_SECONDS = 5;
const LOW_RISK_SETTLEMENT_MAX_BASE_UNITS = BigInt(10000000);
const CAP_USAGE_THRESHOLD_PERCENT = 50;
const DEFAULT_ARBITRUM_SEPOLIA_RPC_URL = "https://sepolia-rollup.arbitrum.io/rpc";

function fail(code: TabErrorCode, status: number, details?: string[]): TabResult<never> {
  return { code, details, ok: false, status };
}

function toIso(date: Date) {
  return date.toISOString();
}

function tabDto(tab: Tab): TabResponse {
  return {
    defaultCapBaseUnits: tab.defaultCapBaseUnits.toString(),
    defaultExpiryHours: tab.defaultExpiryHours,
    description: tab.description,
    id: tab.id,
    networkChainId: tab.networkChainId,
    ownerUserId: tab.ownerUserId,
    settlementContractAddress: normalizeEvmAddress(getSettlementContractAddress()),
    status: tab.status,
    title: tab.title,
    tokenAddress: tab.tokenAddress,
  };
}

function memberDto(member: TabMember): TabMemberResponse {
  return {
    displayName: member.displayName,
    id: member.id,
    joinStatus: member.joinStatus,
    readinessStatus: member.readinessStatus,
    role: member.role,
    tabId: member.tabId,
    userId: member.userId,
    walletAddress: member.walletAddress,
  };
}

function expenseDto(expense: Expense): ExpenseResponse {
  return {
    amountBaseUnits: expense.amountBaseUnits.toString(),
    createdByUserId: expense.createdByUserId,
    id: expense.id,
    note: expense.note,
    payerMemberId: expense.payerMemberId,
    splitMethod: expense.splitMethod,
    status: expense.status,
    tabId: expense.tabId,
    title: expense.title,
    tokenAddress: expense.tokenAddress,
  };
}

function splitDto(split: ExpenseSplit): ExpenseSplitResponse {
  return {
    expenseId: split.expenseId,
    id: split.id,
    memberId: split.memberId,
    shareBaseUnits: split.shareBaseUnits.toString(),
  };
}

function confirmationDto(confirmation: ExpenseConfirmation): ExpenseConfirmationResponse {
  return {
    expenseId: confirmation.expenseId,
    id: confirmation.id,
    memberId: confirmation.memberId,
    reason: confirmation.reason,
    status: confirmation.status,
  };
}

function activityDto(event: ActivityEvent): ActivityEventResponse {
  return {
    actorUserId: event.actorUserId,
    createdAt: toIso(event.createdAt),
    eventData: event.eventData,
    eventType: event.eventType,
    id: event.id,
    tabId: event.tabId,
  };
}

function authorizationDto(authorization: TabAuthorization): TabAuthorizationResponse {
  return {
    allowanceTxHash: authorization.allowanceTxHash,
    authorizationAmountBaseUnits:
      authorization.authorizationAmountBaseUnits?.toString() ?? null,
    authorizationMethod: authorization.authorizationMethod,
    authorizationNonce: authorization.authorizationNonce?.toString() ?? null,
    authorizationTxHash: authorization.authorizationTxHash,
    capBaseUnits: authorization.capBaseUnits.toString(),
    confirmedBlock: authorization.confirmedBlock?.toString() ?? null,
    createdAt: toIso(authorization.createdAt),
    expiresAt: toIso(authorization.expiresAt),
    id: authorization.id,
    maxSingleSettlementBaseUnits: authorization.maxSingleSettlementBaseUnits.toString(),
    memberId: authorization.memberId,
    proposalHash: authorization.proposalHash,
    proposalId: authorization.proposalId,
    revokedAt: authorization.revokedAt ? toIso(authorization.revokedAt) : null,
    revocationTxHash: authorization.revocationTxHash,
    sessionKeyRef: authorization.sessionKeyRef,
    settlementContractAddress: authorization.settlementContractAddress,
    tabId: authorization.tabId,
    tokenAddress: authorization.tokenAddress,
    updatedAt: toIso(authorization.updatedAt),
    userOperationHash: authorization.userOperationHash,
    walletAddress: authorization.walletAddress,
  };
}

function authorizationAmountBaseUnitsString(authorization: TabAuthorization | undefined) {
  return (
    authorization?.authorizationAmountBaseUnits?.toString() ??
    authorization?.capBaseUnits.toString() ??
    null
  );
}

function previewBlocker(input: {
  expenseId?: string | null;
  id: string;
  kind: SettlementPreviewBlocker["kind"];
  memberId?: string | null;
  message: string;
  severity?: SettlementPreviewBlocker["severity"];
}): SettlementPreviewBlocker {
  return {
    expenseId: input.expenseId ?? null,
    id: input.id,
    kind: input.kind,
    memberId: input.memberId ?? null,
    message: input.message,
    severity: input.severity ?? "blocking",
  };
}

function previewStatusFromReadiness(
  status: AuthorizationReadinessResponse["status"],
): SettlementPreviewAuthorizationSummary["status"] {
  switch (status) {
    case "approved":
      return "ready";
    case "expired":
      return "expired";
    case "revoked":
      return "revoked";
    case "missing_wallet":
      return "missing_wallet";
    case "checking":
      return "checking";
    case "stale":
      return "stale";
    case "error":
      return "error";
    case "needs_approval":
    default:
      return "missing";
  }
}

function previewStatusFromAuthorization(input: {
  authorization: TabAuthorization | undefined;
  member: TabMember | undefined;
  nowMs: number;
  owed: bigint;
}): SettlementPreviewAuthorizationSummary["status"] {
  if (!input.member?.walletAddress) {
    return "missing_wallet";
  }

  if (!input.authorization) {
    return "missing";
  }

  if (input.authorization.revokedAt) {
    return "revoked";
  }

  if (input.authorization.expiresAt.getTime() <= input.nowMs) {
    return "expired";
  }

  return input.authorization.capBaseUnits < input.owed ? "insufficient_cap" : "ready";
}

function latestAuthorizationForMember(
  authorizations: TabAuthorization[],
  memberId: string,
  tokenAddress: string,
  settlementContractAddress: string,
  proposalHash?: string,
) {
  return authorizations
    .filter(
      (authorization) =>
        authorization.memberId === memberId &&
        authorization.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() &&
        authorization.settlementContractAddress.toLowerCase() ===
          settlementContractAddress.toLowerCase() &&
        (!proposalHash ||
          authorization.proposalHash?.toLowerCase() === proposalHash.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}

function normalizeHex32(value: unknown) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value)
    ? (value.toLowerCase() as Hex)
    : null;
}

function isZeroBytes32(value: string) {
  return /^0x0{64}$/i.test(value);
}

function normalizeOperationHash(value: unknown) {
  return typeof value === "string" && /^0x[a-fA-F0-9]+$/.test(value)
    ? value.toLowerCase()
    : null;
}

function serializeCalls(calls: EncodedSettlementCall[]) {
  return calls.map((call) => ({
    data: call.data,
    to: call.to,
    value: call.value.toString(),
  }));
}

function toUnixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000).toString();
}

function nextAuthorizationNonce(memberId: string, proposalHash: string) {
  const digest = createHash("sha256")
    .update(`${memberId}:${proposalHash}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 16);

  return BigInt(`0x${digest}`).toString();
}

async function withReadySettlementWallets(
  db: ReturnType<typeof getDb>,
  members: TabMember[],
) {
  const userIds = members
    .map((member) => member.userId)
    .filter((userId): userId is string => Boolean(userId));

  if (userIds.length === 0) {
    return members;
  }

  const config = getZeroDevAccountConfig();
  const accounts = await db
    .select()
    .from(userSettlementAccounts)
    .where(
      and(
        inArray(userSettlementAccounts.userId, userIds),
        eq(userSettlementAccounts.configHash, config.configHash),
      ),
    )
    .orderBy(desc(userSettlementAccounts.updatedAt));
  const accountByUserId = new Map<string, (typeof accounts)[number]>();

  for (const account of accounts) {
    if (!accountByUserId.has(account.userId) && account.delegationStatus === "ready") {
      accountByUserId.set(account.userId, account);
    }
  }

  return members.map((member) => {
    const account = member.userId ? accountByUserId.get(member.userId) : null;

    return account
      ? { ...member, walletAddress: account.settlementAddress.toLowerCase() }
      : member;
  });
}

function getSettlementPublicClient() {
  return createPublicClient({
    chain: arbitrumSepolia,
    transport: http(
      process.env.ARBITRUM_SEPOLIA_RPC_URL ??
        process.env.NEXT_PUBLIC_ARBITRUM_SEPOLIA_RPC_URL ??
        DEFAULT_ARBITRUM_SEPOLIA_RPC_URL,
    ),
  });
}

function getSettlementConfirmationThreshold() {
  const parsed = Number.parseInt(process.env.SETTLEMENT_CONFIRMATIONS ?? "1", 10);

  return Number.isFinite(parsed) && parsed > 0 ? BigInt(parsed) : BigInt(1);
}

async function readActiveFinalTab(input: {
  settlementContractAddress: Address;
  tabKey: Hex;
}) {
  return getSettlementPublicClient().readContract({
    abi: tabySettlementAbi,
    address: input.settlementContractAddress,
    args: [input.tabKey],
    functionName: "getActiveFinalTab",
  });
}

type ActiveFinalTabRead = Awaited<ReturnType<typeof readActiveFinalTab>>;

async function isProposalCancelled(input: {
  proposalHash: Hex;
  settlementContractAddress: Address;
}) {
  return getSettlementPublicClient().readContract({
    abi: tabySettlementAbi,
    address: input.settlementContractAddress,
    args: [input.proposalHash],
    functionName: "cancelledProposalHashes",
  });
}

async function isProposalSettled(input: {
  proposalHash: Hex;
  settlementContractAddress: Address;
}) {
  return getSettlementPublicClient().readContract({
    abi: tabySettlementAbi,
    address: input.settlementContractAddress,
    args: [input.proposalHash],
    functionName: "settledProposalHashes",
  });
}

async function readFinalTabAuthorization(input: {
  debtor: Address;
  proposalHash: Hex;
  settlementContractAddress: Address;
}) {
  return getSettlementPublicClient().readContract({
    abi: tabySettlementAbi,
    address: input.settlementContractAddress,
    args: [input.proposalHash, input.debtor],
    functionName: "getAuthorization",
  });
}

async function readUsdcAllowance(input: {
  owner: Address;
  spender: Address;
  tokenAddress: Address;
}) {
  return getSettlementPublicClient().readContract({
    abi: erc20Abi,
    address: input.tokenAddress,
    args: [input.owner, input.spender],
    functionName: "allowance",
  });
}

async function readUsdcBalance(input: { owner: Address; tokenAddress: Address }) {
  return getSettlementPublicClient().readContract({
    abi: erc20Abi,
    address: input.tokenAddress,
    args: [input.owner],
    functionName: "balanceOf",
  });
}

function settlementAttemptDto(transaction: SettlementTransaction): SettlementAttemptResponse {
  return {
    attemptNumber: transaction.attemptNumber,
    blockNumber: transaction.blockNumber?.toString() ?? null,
    confirmedBlockNumber: transaction.confirmedBlockNumber?.toString() ?? null,
    createdAt: toIso(transaction.createdAt),
    errorMessage: transaction.errorMessage,
    eventLogIndex: transaction.eventLogIndex,
    eventName: transaction.eventName,
    eventProposalHash: transaction.eventProposalHash,
    eventTabKey: transaction.eventTabKey,
    eventTotalAmountBaseUnits: transaction.eventTotalAmountBaseUnits?.toString() ?? null,
    eventTransferCount: transaction.eventTransferCount,
    eventTransfersHash: transaction.eventTransfersHash,
    failureCode: transaction.failureCode,
    id: transaction.id,
    idempotencyKey: transaction.idempotencyKey,
    status: transaction.status,
    txHash: transaction.txHash,
    updatedAt: toIso(transaction.updatedAt),
    userOperationHash: transaction.userOperationHash,
  };
}

function settlementBlocker(input: {
  amountBaseUnits?: bigint | string | null;
  displayName?: string | null;
  id: string;
  kind: SettlementBlocker["kind"];
  memberId?: string | null;
  message: string;
  severity?: SettlementBlocker["severity"];
}): SettlementBlocker {
  return {
    amountBaseUnits:
      typeof input.amountBaseUnits === "bigint"
        ? input.amountBaseUnits.toString()
        : input.amountBaseUnits ?? null,
    blocksSettlement: true,
    displayName: input.displayName ?? null,
    id: input.id,
    kind: input.kind,
    memberId: input.memberId ?? null,
    message: input.message,
    severity: input.severity ?? "error",
  };
}

function settlementExecutionResponse(input: {
  attempt?: SettlementTransaction | null;
  blockers?: SettlementBlocker[];
  calls?: EncodedSettlementCall[];
  expectedTotalAmountBaseUnits: string;
  expectedTransferCount: number;
  expectedTransfersHash: string;
  proposalHash: string;
  settlementContractAddress: string;
  state: SettlementExecutionResponse["state"];
  tokenAddress: string;
  chainId: number;
}): SettlementExecutionResponse {
  return {
    attempt: input.attempt ? settlementAttemptDto(input.attempt) : null,
    blockers: input.blockers ?? [],
    calls: input.calls ? serializeCalls(input.calls) : undefined,
    expectedTotalAmountBaseUnits: input.expectedTotalAmountBaseUnits,
    expectedTransferCount: input.expectedTransferCount,
    expectedTransfersHash: input.expectedTransfersHash,
    idempotencyKey: input.attempt?.idempotencyKey,
    proposalHash: input.proposalHash,
    settlementContractAddress: input.settlementContractAddress,
    state: input.state,
    tokenAddress: input.tokenAddress,
    chainId: input.chainId,
  };
}

async function buildAuthorizationReadiness(input: {
  authorizations: TabAuthorization[];
  members: TabMember[];
  proposal: SettlementProposalResponse | null;
  settlementContractAddress: string | null;
}): Promise<AuthorizationReadinessResponse[]> {
  const proposal = input.proposal?.status === "locked" ? input.proposal : null;

  if (!proposal || !input.settlementContractAddress) {
    return [];
  }

  const settlementContractAddress = normalizeEvmAddress(input.settlementContractAddress);
  const proposalHash = normalizeHex32(proposal.proposalHash);
  const tabKey = normalizeHex32(proposal.tabKey);

  if (!settlementContractAddress || !proposalHash || !tabKey) {
    return [];
  }

  const debtorAmounts = new Map<string, bigint>();

  for (const transfer of proposal.transfers) {
    debtorAmounts.set(
      transfer.fromMemberId,
      (debtorAmounts.get(transfer.fromMemberId) ?? BigInt(0)) +
        BigInt(transfer.amountBaseUnits),
    );
  }

  if (debtorAmounts.size === 0) {
    return [];
  }

  const memberById = new Map(input.members.map((member) => [member.id, member]));
  let activeMatches = false;
  let proposalUnavailable = false;

  try {
    const [activeFinalTab, cancelled, settled] = await Promise.all([
      readActiveFinalTab({
        settlementContractAddress: settlementContractAddress as Address,
        tabKey,
      }),
      isProposalCancelled({
        proposalHash,
        settlementContractAddress: settlementContractAddress as Address,
      }),
      isProposalSettled({
        proposalHash,
        settlementContractAddress: settlementContractAddress as Address,
      }),
    ]);

    activeMatches =
      !cancelled &&
      !settled &&
      activeFinalTab.proposalHash.toLowerCase() === proposalHash.toLowerCase();
  } catch {
    proposalUnavailable = true;
  }

  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const proposalExpirySeconds = BigInt(Math.floor(new Date(proposal.expiresAt).getTime() / 1000));
  const readiness: AuthorizationReadinessResponse[] = [];

  for (const [memberId, owed] of debtorAmounts) {
    const member = memberById.get(memberId);
    const walletAddress = normalizeEvmAddress(member?.walletAddress);
    const authorization = latestAuthorizationForMember(
      input.authorizations,
      memberId,
      TABY_USDC_ADDRESS,
      settlementContractAddress,
      proposalHash,
    );
    const base = {
      authorizationId: authorization?.id ?? null,
      displayName: member?.displayName ?? "A member",
      memberId,
      owedBaseUnits: owed.toString(),
      proposalHash,
      walletAddress,
    };

    if (!walletAddress) {
      readiness.push({
        ...base,
        allowanceBaseUnits: null,
        authorizationAmountBaseUnits: null,
        authorizationExpiresAt: null,
        blocksSettlement: true,
        contractAuthorizationAmountBaseUnits: null,
        revoked: false,
        status: "missing_wallet",
      });
      continue;
    }

    if (proposalUnavailable) {
      readiness.push({
        ...base,
        allowanceBaseUnits: null,
        authorizationAmountBaseUnits: authorizationAmountBaseUnitsString(authorization),
        authorizationExpiresAt: authorization?.expiresAt.toISOString() ?? null,
        blocksSettlement: true,
        contractAuthorizationAmountBaseUnits: null,
        revoked: Boolean(authorization?.revokedAt),
        status: "error",
      });
      continue;
    }

    if (!activeMatches || proposalExpirySeconds <= nowSeconds) {
      readiness.push({
        ...base,
        allowanceBaseUnits: null,
        authorizationAmountBaseUnits: authorizationAmountBaseUnitsString(authorization),
        authorizationExpiresAt: authorization?.expiresAt.toISOString() ?? null,
        blocksSettlement: true,
        contractAuthorizationAmountBaseUnits: null,
        revoked: Boolean(authorization?.revokedAt),
        status: proposalExpirySeconds <= nowSeconds ? "expired" : "stale",
      });
      continue;
    }

    try {
      const [allowance, contractAuthorization] = await Promise.all([
        readUsdcAllowance({
          owner: walletAddress as Address,
          spender: settlementContractAddress as Address,
          tokenAddress: TABY_USDC_ADDRESS as Address,
        }),
        readFinalTabAuthorization({
          debtor: walletAddress as Address,
          proposalHash,
          settlementContractAddress: settlementContractAddress as Address,
        }),
      ]);
      const expiresAtMs = Number(contractAuthorization.expiresAt) * 1000;
      const authorizationMatches =
        contractAuthorization.proposalHash.toLowerCase() === proposalHash.toLowerCase() &&
        isAddressEqual(contractAuthorization.debtor, walletAddress as Address) &&
        contractAuthorization.amount === owed &&
        contractAuthorization.expiresAt <= proposalExpirySeconds &&
        allowance === owed;
      const status: AuthorizationReadinessResponse["status"] =
        contractAuthorization.revoked
          ? "revoked"
          : !authorizationMatches
            ? "needs_approval"
            : contractAuthorization.expiresAt <= nowSeconds
              ? "expired"
              : "approved";

      readiness.push({
        ...base,
        allowanceBaseUnits: allowance.toString(),
        authorizationAmountBaseUnits: authorizationAmountBaseUnitsString(authorization),
        authorizationExpiresAt:
          contractAuthorization.expiresAt > BigInt(0)
            ? new Date(expiresAtMs).toISOString()
            : authorization?.expiresAt.toISOString() ?? null,
        blocksSettlement: status !== "approved",
        contractAuthorizationAmountBaseUnits: contractAuthorization.amount.toString(),
        revoked: contractAuthorization.revoked,
        status,
      });
    } catch {
      readiness.push({
        ...base,
        allowanceBaseUnits: null,
        authorizationAmountBaseUnits: authorizationAmountBaseUnitsString(authorization),
        authorizationExpiresAt: authorization?.expiresAt.toISOString() ?? null,
        blocksSettlement: true,
        contractAuthorizationAmountBaseUnits: null,
        revoked: Boolean(authorization?.revokedAt),
        status: "error",
      });
    }
  }

  return readiness.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function buildSnapshotHash(input: Omit<SettlementPreviewSnapshot, "snapshotHash">) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function deriveThresholdResult(input: {
  authorizationSummaries: SettlementPreviewAuthorizationSummary[];
  currentMemberId: string;
  totalAmountBaseUnits: string;
}): SettlementPreviewThresholdResult {
  const total = BigInt(input.totalAmountBaseUnits);
  const currentSummary = input.authorizationSummaries.find(
    (summary) => summary.memberId === input.currentMemberId,
  );
  const summariesToCheck = currentSummary ? [currentSummary] : input.authorizationSummaries;
  const capHeavy = summariesToCheck.some((summary) => {
    if (!summary.capBaseUnits || BigInt(summary.capBaseUnits) === BigInt(0)) {
      return false;
    }

    return BigInt(summary.owedBaseUnits) * BigInt(100) >
      BigInt(summary.capBaseUnits) * BigInt(CAP_USAGE_THRESHOLD_PERCENT);
  });

  if (total > LOW_RISK_SETTLEMENT_MAX_BASE_UNITS) {
    return {
      capUsageThresholdPercent: CAP_USAGE_THRESHOLD_PERCENT,
      explicitConfirmationAmountBaseUnits: LOW_RISK_SETTLEMENT_MAX_BASE_UNITS.toString(),
      lowRiskMaxBaseUnits: LOW_RISK_SETTLEMENT_MAX_BASE_UNITS.toString(),
      reason: "amount_over_threshold",
      requiresExplicitConfirmation: true,
    };
  }

  if (capHeavy) {
    return {
      capUsageThresholdPercent: CAP_USAGE_THRESHOLD_PERCENT,
      explicitConfirmationAmountBaseUnits: LOW_RISK_SETTLEMENT_MAX_BASE_UNITS.toString(),
      lowRiskMaxBaseUnits: LOW_RISK_SETTLEMENT_MAX_BASE_UNITS.toString(),
      reason: currentSummary ? "cap_usage_over_threshold" : "group_debtor_over_threshold",
      requiresExplicitConfirmation: true,
    };
  }

  return {
    capUsageThresholdPercent: CAP_USAGE_THRESHOLD_PERCENT,
    explicitConfirmationAmountBaseUnits: LOW_RISK_SETTLEMENT_MAX_BASE_UNITS.toString(),
    lowRiskMaxBaseUnits: LOW_RISK_SETTLEMENT_MAX_BASE_UNITS.toString(),
    reason: "low_risk",
    requiresExplicitConfirmation: false,
  };
}

async function verifyMagicToken(didToken: string) {
  const secretKey = process.env.MAGIC_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  const magic = await Magic.init(secretKey);
  magic.token.validate(didToken);
  return magic.users.getMetadataByToken(didToken) as Promise<MagicMetadata>;
}

async function getCurrentUser(didToken: unknown): Promise<TabResult<CurrentUser>> {
  if (!process.env.MAGIC_SECRET_KEY || !hasDatabaseConfig()) {
    return fail("configuration_missing", 503);
  }

  if (typeof didToken !== "string" || didToken.length < 20) {
    return fail("unauthenticated", 401);
  }

  let metadata: MagicMetadata | null;

  try {
    metadata = await verifyMagicToken(didToken);
  } catch {
    return fail("unauthenticated", 401);
  }

  if (!metadata?.issuer) {
    return fail("unauthenticated", 401);
  }

  try {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.magicUserId, metadata.issuer));

    if (!user) {
      return fail("account_unavailable", 404);
    }

    return { data: { magicUserId: metadata.issuer, user }, ok: true };
  } catch {
    return fail("database_unavailable", 503);
  }
}

async function getAccessContext(tabId: string, userId: string): Promise<TabResult<AccessContext>> {
  try {
    const db = getDb();
    const [tab] = await db.select().from(tabs).where(eq(tabs.id, tabId));

    if (!tab) {
      return fail("not_found", 404);
    }

    const [currentMember] = await db
      .select()
      .from(tabMembers)
      .where(and(eq(tabMembers.tabId, tabId), eq(tabMembers.userId, userId)));

    const hasMemberAccess =
      currentMember?.joinStatus === "invited" || currentMember?.joinStatus === "joined";
    const isOwner =
      tab.ownerUserId === userId ||
      (currentMember?.role === "owner" && currentMember.joinStatus === "joined");

    if (!hasMemberAccess && !isOwner) {
      return fail("not_found", 404);
    }

    return { data: { currentMember: currentMember ?? null, isOwner, tab }, ok: true };
  } catch {
    return fail("database_unavailable", 503);
  }
}

function normalizeSplits(input: unknown, amount: bigint, method: unknown) {
  if (!Array.isArray(input) || input.length === 0) {
    return null;
  }

  const memberIds = input.map((split: SplitInput) => split.memberId);

  if (!memberIds.every(isUuid)) {
    return null;
  }

  const uniqueIds = new Set(memberIds);

  if (uniqueIds.size !== memberIds.length) {
    return null;
  }

  if (method === "equal") {
    const sortedIds = [...uniqueIds].sort();
    const baseShare = amount / BigInt(sortedIds.length);
    let remainder = amount % BigInt(sortedIds.length);

    return sortedIds.map((memberId) => {
      const extra = remainder > BigInt(0) ? BigInt(1) : BigInt(0);
      remainder -= extra;
      return { memberId, shareBaseUnits: baseShare + extra };
    });
  }

  if (method !== "custom") {
    return null;
  }

  const customSplits = input.map((split: SplitInput) => {
    if (!isUuid(split.memberId)) {
      return null;
    }

    const share = parseNonNegativeBaseUnits(split.shareBaseUnits);

    if (share === null) {
      return null;
    }

    return { memberId: split.memberId, shareBaseUnits: share };
  });

  if (customSplits.some((split) => split === null)) {
    return null;
  }

  return customSplits as { memberId: string; shareBaseUnits: bigint }[];
}

export async function getCurrentUserTabs(input: {
  didToken: unknown;
}): Promise<TabResult<TabSummaryResponse[]>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  try {
    const db = getDb();
    const currentMemberRows = await db
      .select()
      .from(tabMembers)
      .where(
        and(
          eq(tabMembers.userId, currentUser.data.user.id),
          ne(tabMembers.joinStatus, "removed"),
        ),
      );
    const ownedTabs = await db
      .select()
      .from(tabs)
      .where(eq(tabs.ownerUserId, currentUser.data.user.id));
    const tabIds = [
      ...new Set([...currentMemberRows.map((member) => member.tabId), ...ownedTabs.map((tab) => tab.id)]),
    ];

    if (tabIds.length === 0) {
      return { data: [], ok: true };
    }

    const [tabRows, memberCountRows, ownerRows] = await Promise.all([
      db.select().from(tabs).where(inArray(tabs.id, tabIds)).orderBy(desc(tabs.updatedAt)),
      db
        .select({
          memberCount: sql<number>`count(${tabMembers.id})::int`,
          tabId: tabMembers.tabId,
        })
        .from(tabMembers)
        .where(and(inArray(tabMembers.tabId, tabIds), ne(tabMembers.joinStatus, "removed")))
        .groupBy(tabMembers.tabId),
      db
        .select()
        .from(tabMembers)
        .where(
          and(
            inArray(tabMembers.tabId, tabIds),
            eq(tabMembers.role, "owner"),
            ne(tabMembers.joinStatus, "removed"),
          ),
        ),
    ]);
    const currentMemberByTabId = new Map(
      currentMemberRows.map((member) => [member.tabId, member]),
    );
    const memberCountByTabId = new Map(
      memberCountRows.map((row) => [row.tabId, row.memberCount]),
    );
    const ownerByTabId = new Map(ownerRows.map((member) => [member.tabId, member]));

    return {
      data: tabRows.map((tab) => ({
        currentMember: currentMemberByTabId.get(tab.id)
          ? memberDto(currentMemberByTabId.get(tab.id) as TabMember)
          : null,
        memberCount: memberCountByTabId.get(tab.id) ?? 0,
        ownerDisplayName: ownerByTabId.get(tab.id)?.displayName ?? null,
        tab: tabDto(tab),
      })),
      ok: true,
    };
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function getTabDetail(input: {
  didToken: unknown;
  tabId: unknown;
}): Promise<TabResult<TabDetailResponse>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.tabId)) {
    return fail("validation_failed", 422);
  }

  const tabId = input.tabId;
  const access = await getAccessContext(tabId, currentUser.data.user.id);

  if (!access.ok) {
    return access;
  }

  try {
    const db = getDb();
    const [
      members,
      expenseRows,
      splitRows,
      confirmationRows,
      latestProposalRows,
      authorizationRows,
      events,
    ] =
      await Promise.all([
        db.select().from(tabMembers).where(eq(tabMembers.tabId, tabId)),
        db.select().from(expenses).where(eq(expenses.tabId, tabId)).orderBy(desc(expenses.createdAt)),
        db
          .select()
          .from(expenseSplits)
          .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
          .where(eq(expenses.tabId, tabId)),
        db
          .select()
          .from(expenseConfirmations)
          .innerJoin(expenses, eq(expenseConfirmations.expenseId, expenses.id))
          .where(eq(expenses.tabId, tabId)),
        db
          .select()
          .from(settlementProposals)
          .where(
            and(
              eq(settlementProposals.tabId, tabId),
              inArray(settlementProposals.status, ["open", "locked", "executed"]),
            ),
          )
          .orderBy(
            sql`case when ${settlementProposals.status} = 'executed' then 0 when ${settlementProposals.status} = 'locked' then 1 else 2 end`,
            desc(settlementProposals.createdAt),
          )
          .limit(1),
        db.select().from(tabAuthorizations).where(eq(tabAuthorizations.tabId, tabId)),
        db
          .select()
          .from(activityEvents)
          .where(eq(activityEvents.tabId, tabId))
          .orderBy(desc(activityEvents.createdAt))
          .limit(20),
      ]);

    const canSeeTabDetail =
      access.data.currentMember?.joinStatus !== "invited" || access.data.isOwner;
    const latestProposal = latestProposalRows[0] ? proposalDto(latestProposalRows[0]) : null;
    const latestAttempt =
      canSeeTabDetail && latestProposal ? await latestSettlementAttempt(latestProposal.id) : null;
    const settlementMembers = canSeeTabDetail
      ? await withReadySettlementWallets(db, members)
      : members;
    const authorizationReadiness = canSeeTabDetail
      ? await buildAuthorizationReadiness({
          authorizations: authorizationRows,
          members: settlementMembers,
          proposal: latestProposal,
          settlementContractAddress:
            latestProposal?.settlementContractAddress ?? getSettlementContractAddress(),
        })
      : [];

    return {
      data: {
        activity: canSeeTabDetail ? events.map(activityDto) : [],
        authorizationReadiness,
        authorizations: canSeeTabDetail ? authorizationRows.map(authorizationDto) : [],
        confirmations: canSeeTabDetail
          ? confirmationRows.map((row) => confirmationDto(row.expense_confirmations))
          : [],
        expenses: canSeeTabDetail ? expenseRows.map(expenseDto) : [],
        latestSettlementAttempt: latestAttempt
          ? settlementAttemptDto(latestAttempt)
          : null,
        latestProposal: canSeeTabDetail ? latestProposal : null,
        members: settlementMembers.map(memberDto),
        splits:
          canSeeTabDetail ? splitRows.map((row) => splitDto(row.expense_splits)) : [],
        tab: tabDto(access.data.tab),
      },
      ok: true,
    };
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function createTab(input: {
  defaultCapBaseUnits?: unknown;
  defaultExpiryHours?: unknown;
  description?: unknown;
  didToken: unknown;
  title: unknown;
}) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  const title = normalizeText(input.title, { max: 80, min: 2 });
  const description = normalizeText(input.description, { max: 240, nullable: true });
  const defaultCap = input.defaultCapBaseUnits
    ? parseBaseUnits(input.defaultCapBaseUnits)
    : TABY_DEFAULT_CAP_BASE_UNITS;
  const parsedExpiry = parseOptionalPositiveInteger(input.defaultExpiryHours);
  const defaultExpiryHours = parsedExpiry ?? TABY_DEFAULT_EXPIRY_HOURS;

  if (!title || description === undefined || !defaultCap || parsedExpiry === undefined) {
    return fail("validation_failed", 422);
  }

  try {
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const [tab] = await tx
        .insert(tabs)
        .values({
          defaultCapBaseUnits: defaultCap,
          defaultExpiryHours,
          description,
          networkChainId: TABY_CHAIN_ID,
          ownerUserId: currentUser.data.user.id,
          status: "active",
          title,
          tokenAddress: TABY_USDC_ADDRESS.toLowerCase(),
        })
        .returning();

      const [ownerMember] = await tx
        .insert(tabMembers)
        .values({
          displayName: currentUser.data.user.displayName,
          joinStatus: "joined",
          readinessStatus: "not_ready",
          role: "owner",
          tabId: tab.id,
          userId: currentUser.data.user.id,
          walletAddress: currentUser.data.user.walletAddress.toLowerCase(),
        })
        .returning();

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: { title: tab.title },
          eventType: "tab_created",
          tabId: tab.id,
        })
        .returning();

      return { activity, ownerMember, tab };
    });

    return {
      data: {
        activity: activityDto(result.activity),
        ownerMember: memberDto(result.ownerMember),
        tab: tabDto(result.tab),
      },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function addTabMember(input: {
  didToken: unknown;
  displayName: unknown;
  tabId: unknown;
  userId?: unknown;
  walletAddress?: unknown;
}) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.tabId)) {
    return fail("validation_failed", 422);
  }

  const tabId = input.tabId;
  const displayName = normalizeText(input.displayName, { max: 40, min: 2 });
  const walletAddress = input.walletAddress ? normalizeEvmAddress(input.walletAddress) : null;
  const linkedUserId =
    input.userId === undefined ? null : isUuid(input.userId) ? input.userId : undefined;

  if (
    !displayName ||
    linkedUserId === undefined ||
    (input.walletAddress && !walletAddress) ||
    (linkedUserId && linkedUserId !== currentUser.data.user.id)
  ) {
    return fail("validation_failed", 422);
  }

  const access = await getAccessContext(tabId, currentUser.data.user.id);

  if (!access.ok) {
    return access;
  }

  if (!access.data.isOwner) {
    return fail("unauthorized", 403);
  }

  if (access.data.tab.status === "settled" || access.data.tab.status === "cancelled") {
    return fail("invalid_transition", 409);
  }

  try {
    const db = getDb();
    const result = await db.transaction(async (tx) => {
      const [member] = await tx
        .insert(tabMembers)
        .values({
          displayName,
          joinStatus: linkedUserId ? "joined" : "invited",
          role: "member",
          tabId: access.data.tab.id,
          userId: linkedUserId || null,
          walletAddress: linkedUserId
            ? currentUser.data.user.walletAddress.toLowerCase()
            : walletAddress,
        })
        .returning();

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: { displayName: member.displayName, memberId: member.id },
          eventType: "member_added",
          tabId: access.data.tab.id,
        })
        .returning();

      return { activity, member };
    });

    return {
      data: { activity: activityDto(result.activity), member: memberDto(result.member) },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function inviteTabMember(input: {
  didToken: unknown;
  email: unknown;
  tabId: unknown;
}) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.tabId)) {
    return fail("validation_failed", 422);
  }

  const email = normalizeEmail(input.email);

  if (!email) {
    return fail("validation_failed", 422);
  }

  const tabId = input.tabId;
  const access = await getAccessContext(tabId, currentUser.data.user.id);

  if (!access.ok) {
    return access;
  }

  if (!access.data.isOwner) {
    return fail("unauthorized", 403);
  }

  if (access.data.tab.status === "settled" || access.data.tab.status === "cancelled") {
    return fail("invalid_transition", 409);
  }

  try {
    const db = getDb();
    const matchedUsers = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(2);

    if (matchedUsers.length === 0) {
      return fail("user_not_found", 404);
    }

    if (matchedUsers.length > 1) {
      return fail("validation_failed", 409);
    }

    const invitedUser = matchedUsers[0];

    if (invitedUser.id === currentUser.data.user.id || invitedUser.id === access.data.tab.ownerUserId) {
      return fail("self_invite", 409);
    }

    const [existingMember] = await db
      .select()
      .from(tabMembers)
      .where(
        and(
          eq(tabMembers.tabId, tabId),
          eq(tabMembers.userId, invitedUser.id),
          ne(tabMembers.joinStatus, "removed"),
        ),
      );

    if (existingMember) {
      return fail("member_already_exists", 409);
    }

    const result = await db.transaction(async (tx) => {
      const [member] = await tx
        .insert(tabMembers)
        .values({
          displayName: invitedUser.displayName,
          joinStatus: "invited",
          readinessStatus: "not_ready",
          role: "member",
          tabId,
          userId: invitedUser.id,
          walletAddress: null,
        })
        .returning();

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: { displayName: member.displayName, memberId: member.id },
          eventType: "member_invited",
          tabId,
        })
        .returning();

      await tx.update(tabs).set({ updatedAt: new Date() }).where(eq(tabs.id, tabId));

      return { activity, member };
    });

    return {
      data: { activity: activityDto(result.activity), member: memberDto(result.member) },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function acceptTabInvite(input: { didToken: unknown; tabId: unknown }) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.tabId)) {
    return fail("validation_failed", 422);
  }

  const tabId = input.tabId;

  try {
    const db = getDb();
    const [member] = await db
      .select()
      .from(tabMembers)
      .where(and(eq(tabMembers.tabId, tabId), eq(tabMembers.userId, currentUser.data.user.id)));

    if (!member || member.joinStatus !== "invited") {
      return fail("invite_not_found", 404);
    }

    const [tab] = await db.select().from(tabs).where(eq(tabs.id, tabId));

    if (!tab || tab.status === "settled" || tab.status === "cancelled") {
      return fail("invite_not_found", 404);
    }

    const result = await db.transaction(async (tx) => {
      const [joinedMember] = await tx
        .update(tabMembers)
        .set({
          displayName: currentUser.data.user.displayName,
          joinStatus: "joined",
          updatedAt: new Date(),
          walletAddress: currentUser.data.user.walletAddress.toLowerCase(),
        })
        .where(and(eq(tabMembers.id, member.id), eq(tabMembers.joinStatus, "invited")))
        .returning();

      if (!joinedMember) {
        tx.rollback();
      }

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: { displayName: joinedMember.displayName, memberId: joinedMember.id },
          eventType: "member_joined",
          tabId,
        })
        .returning();

      await tx.update(tabs).set({ updatedAt: new Date() }).where(eq(tabs.id, tabId));

      return { activity, member: joinedMember };
    });

    return {
      data: { activity: activityDto(result.activity), member: memberDto(result.member) },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function addExpense(input: {
  amountBaseUnits: unknown;
  didToken: unknown;
  note?: unknown;
  payerMemberId: unknown;
  splitMethod: unknown;
  splits: unknown;
  tabId: unknown;
  title: unknown;
}) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.tabId) || !isUuid(input.payerMemberId)) {
    return fail("validation_failed", 422);
  }

  const tabId = input.tabId;
  const payerMemberId = input.payerMemberId;
  const title = normalizeText(input.title, { max: 80, min: 2 });
  const note = normalizeText(input.note, { max: 240, nullable: true });
  const amount = parseBaseUnits(input.amountBaseUnits);

  if (!title || note === undefined) {
    return fail("validation_failed", 422);
  }

  if (!amount) {
    return fail("invalid_amount", 422);
  }

  const normalizedSplits = normalizeSplits(input.splits, amount, input.splitMethod);

  if (!normalizedSplits) {
    return fail("validation_failed", 422);
  }

  const splitTotal = normalizedSplits.reduce(
    (sum, split) => sum + split.shareBaseUnits,
    BigInt(0),
  );

  if (splitTotal !== amount) {
    return fail("invalid_split_total", 422);
  }

  const access = await getAccessContext(tabId, currentUser.data.user.id);

  if (!access.ok) {
    return access;
  }

  if (!access.data.currentMember || access.data.currentMember.joinStatus !== "joined") {
    return fail("unauthorized", 403);
  }

  if (!MUTABLE_TAB_STATUSES.has(access.data.tab.status)) {
    return fail("invalid_transition", 409);
  }

  try {
    const db = getDb();
    const memberIds = [payerMemberId, ...normalizedSplits.map((split) => split.memberId)];
    const members = await db
      .select()
      .from(tabMembers)
      .where(and(eq(tabMembers.tabId, tabId), inArray(tabMembers.id, memberIds)));
    const memberMap = new Map(members.map((member) => [member.id, member]));
    const payer = memberMap.get(payerMemberId);

    if (!payer || payer.joinStatus !== "joined") {
      return fail("invalid_member", 422);
    }

    if (
      normalizedSplits.some((split) => {
        const member = memberMap.get(split.memberId);
        return !member || member.joinStatus !== "joined";
      })
    ) {
      return fail("invalid_member", 422);
    }

    const result = await db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(expenses)
        .values({
          amountBaseUnits: amount,
          createdByUserId: currentUser.data.user.id,
          note,
          payerMemberId,
          splitMethod: input.splitMethod === "equal" ? "equal" : "custom",
          status: "pending",
          tabId,
          title,
          tokenAddress: access.data.tab.tokenAddress,
        })
        .returning();

      const splitRows = await tx
        .insert(expenseSplits)
        .values(
          normalizedSplits.map((split) => ({
            expenseId: expense.id,
            memberId: split.memberId,
            shareBaseUnits: split.shareBaseUnits,
          })),
        )
        .returning();

      const confirmationRows = await tx
        .insert(expenseConfirmations)
        .values(
          normalizedSplits.map((split) => ({
            expenseId: expense.id,
            memberId: split.memberId,
            status: split.memberId === payerMemberId ? ("confirmed" as const) : ("pending" as const),
          })),
        )
        .returning();

      const allConfirmed = confirmationRows.every(
        (confirmation) => confirmation.status === "confirmed",
      );
      const [finalExpense] = allConfirmed
        ? await tx
            .update(expenses)
            .set({ status: "confirmed", updatedAt: new Date() })
            .where(eq(expenses.id, expense.id))
            .returning()
        : [expense];

      if (allConfirmed) {
        await tx.insert(activityEvents).values({
          actorUserId: currentUser.data.user.id,
          eventData: { expenseId: finalExpense.id, title: finalExpense.title },
          eventType: "expense_confirmed_all",
          tabId,
        });
      }

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            amountBaseUnits: amount.toString(),
            expenseId: finalExpense.id,
            title: finalExpense.title,
          },
          eventType: "expense_added",
          tabId,
        })
        .returning();

      return { activity, confirmations: confirmationRows, expense: finalExpense, splits: splitRows };
    });

    return {
      data: {
        activity: activityDto(result.activity),
        confirmations: result.confirmations.map(confirmationDto),
        expense: expenseDto(result.expense),
        splits: result.splits.map(splitDto),
      },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}

async function updateExpenseConfirmation(input: {
  didToken: unknown;
  expenseId: unknown;
  reason?: unknown;
  status: "confirmed" | "disputed";
}) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.expenseId)) {
    return fail("validation_failed", 422);
  }

  const reason =
    input.status === "disputed" ? normalizeText(input.reason, { max: 240, nullable: true }) : null;

  if (reason === undefined) {
    return fail("validation_failed", 422);
  }

  try {
    const db = getDb();
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, input.expenseId));

    if (!expense) {
      return fail("not_found", 404);
    }

    const access = await getAccessContext(expense.tabId, currentUser.data.user.id);

    if (!access.ok) {
      return access;
    }

    if (!access.data.currentMember || access.data.currentMember.joinStatus !== "joined") {
      return fail("expense_not_involved", 403);
    }

    if (!MUTABLE_TAB_STATUSES.has(access.data.tab.status)) {
      return fail("invalid_transition", 409);
    }

    const [split] = await db
      .select()
      .from(expenseSplits)
      .where(
        and(
          eq(expenseSplits.expenseId, expense.id),
          eq(expenseSplits.memberId, access.data.currentMember.id),
        ),
      );

    if (!split) {
      return fail("expense_not_involved", 403);
    }

    const canReviewExpense =
      input.status === "confirmed"
        ? expense.status === "pending" || expense.status === "disputed"
        : expense.status === "pending";

    if (!canReviewExpense) {
      return fail("invalid_transition", 409);
    }

    const [existingConfirmation] = await db
      .select()
      .from(expenseConfirmations)
      .where(
        and(
          eq(expenseConfirmations.expenseId, expense.id),
          eq(expenseConfirmations.memberId, access.data.currentMember.id),
        ),
      );

    if (!existingConfirmation) {
      return fail("invalid_transition", 409);
    }

    const canUpdateConfirmation =
      input.status === "confirmed"
        ? existingConfirmation.status === "pending" ||
          existingConfirmation.status === "disputed"
        : existingConfirmation.status === "pending";

    if (!canUpdateConfirmation) {
      return fail("invalid_transition", 409);
    }

    const result = await db.transaction(async (tx) => {
      const [confirmation] = await tx
        .update(expenseConfirmations)
        .set({ reason, status: input.status, updatedAt: new Date() })
        .where(eq(expenseConfirmations.id, existingConfirmation.id))
        .returning();

      if (!confirmation) {
        tx.rollback();
      }

      let updatedExpense = expense;
      let allConfirmedActivity: ActivityEvent | null = null;

      if (input.status === "disputed") {
        [updatedExpense] = await tx
          .update(expenses)
          .set({ status: "disputed", updatedAt: new Date() })
          .where(eq(expenses.id, expense.id))
          .returning();
      } else {
        const confirmations = await tx
          .select()
          .from(expenseConfirmations)
          .where(eq(expenseConfirmations.expenseId, expense.id));
        const nextStatus = confirmations.every((row) => row.status === "confirmed")
          ? "confirmed"
          : confirmations.some((row) => row.status === "disputed")
            ? "disputed"
            : "pending";

        [updatedExpense] = await tx
          .update(expenses)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(expenses.id, expense.id))
          .returning();

        if (nextStatus === "confirmed") {
          [allConfirmedActivity] = await tx
            .insert(activityEvents)
            .values({
              actorUserId: currentUser.data.user.id,
              eventData: { expenseId: expense.id, title: expense.title },
              eventType: "expense_confirmed_all",
              tabId: expense.tabId,
            })
            .returning();
        }
      }

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            expenseId: expense.id,
            memberId: access.data.currentMember?.id,
            reason,
            title: expense.title,
          },
          eventType: input.status === "confirmed" ? "expense_confirmed" : "expense_disputed",
          tabId: expense.tabId,
        })
        .returning();

      return { activity, allConfirmedActivity, confirmation, expense: updatedExpense };
    });

    return {
      data: {
        activity: activityDto(result.activity),
        allConfirmedActivity: result.allConfirmedActivity
          ? activityDto(result.allConfirmedActivity)
          : null,
        confirmation: confirmationDto(result.confirmation),
        expense: expenseDto(result.expense),
      },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}

export function confirmExpense(input: { didToken: unknown; expenseId: unknown }) {
  return updateExpenseConfirmation({ ...input, status: "confirmed" });
}

export function disputeExpense(input: {
  didToken: unknown;
  expenseId: unknown;
  reason?: unknown;
}) {
  return updateExpenseConfirmation({ ...input, status: "disputed" });
}

export async function removeExpense(input: { didToken: unknown; expenseId: unknown }) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.expenseId)) {
    return fail("validation_failed", 422);
  }

  try {
    const db = getDb();
    const [expense] = await db.select().from(expenses).where(eq(expenses.id, input.expenseId));

    if (!expense) {
      return fail("not_found", 404);
    }

    const access = await getAccessContext(expense.tabId, currentUser.data.user.id);

    if (!access.ok) {
      return access;
    }

    if (!access.data.currentMember || access.data.currentMember.joinStatus !== "joined") {
      return fail("unauthorized", 403);
    }

    if (!access.data.isOwner) {
      return fail("unauthorized", 403);
    }

    if (!MUTABLE_TAB_STATUSES.has(access.data.tab.status)) {
      return fail("invalid_transition", 409);
    }

    if (expense.status === "locked" || expense.status === "settled") {
      return fail("invalid_transition", 409);
    }

    const result = await db.transaction(async (tx) => {
      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            amountBaseUnits: expense.amountBaseUnits.toString(),
            expenseId: expense.id,
            title: expense.title,
          },
          eventType: "expense_removed",
          tabId: expense.tabId,
        })
        .returning();

      await tx
        .delete(expenseConfirmations)
        .where(eq(expenseConfirmations.expenseId, expense.id));
      await tx.delete(expenseSplits).where(eq(expenseSplits.expenseId, expense.id));
      await tx.delete(expenses).where(eq(expenses.id, expense.id));
      await tx.update(tabs).set({ updatedAt: new Date() }).where(eq(tabs.id, expense.tabId));

      return { activity, expenseId: expense.id };
    });

    return {
      data: {
        activity: activityDto(result.activity),
        expenseId: result.expenseId,
      },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function recordTabAuthorization(input: {
  action?: unknown;
  authorizationMethod?: unknown;
  authorizationNonce?: unknown;
  transactionHash?: unknown;
  userOperationHash?: unknown;
  didToken: unknown;
  exactAmountBaseUnits?: unknown;
  memberId: unknown;
  proposalHash?: unknown;
  proposalId?: unknown;
  tabId: unknown;
}): Promise<TabResult<unknown>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.tabId) || !isUuid(input.memberId)) {
    return fail("validation_failed", 422);
  }

  const tabId = input.tabId;
  const memberId = input.memberId;
  const configuredContract = normalizeEvmAddress(getSettlementContractAddress());
  const proposalHash = normalizeHex32(input.proposalHash);
  const proposalId = isUuid(input.proposalId) ? input.proposalId : null;
  const exactAmount = parseBaseUnits(input.exactAmountBaseUnits);
  const userOperationHash = normalizeOperationHash(input.userOperationHash);
  const transactionHash = typeof input.transactionHash === "string" ? input.transactionHash : null;
  const action = input.action === "confirm" ? "confirm" : "prepare";
  const authorizationNonce =
    typeof input.authorizationNonce === "string" && /^\d+$/.test(input.authorizationNonce)
      ? input.authorizationNonce
      : null;

  if (!configuredContract) {
    return fail("configuration_missing", 503);
  }

  if (!proposalId || !proposalHash || (action === "confirm" && (!userOperationHash || !isEvmTxHash(transactionHash)))) {
    return fail("validation_failed", 422);
  }

  const access = await getAccessContext(tabId, currentUser.data.user.id);

  if (!access.ok) {
    return access;
  }

  if (!access.data.currentMember || access.data.currentMember.id !== memberId) {
    return fail("unauthorized", 403);
  }

  if (access.data.currentMember.joinStatus !== "joined") {
    return fail("unauthorized", 403);
  }

  if (
    access.data.tab.tokenAddress.toLowerCase() !== TABY_USDC_ADDRESS.toLowerCase() ||
    access.data.tab.networkChainId !== TABY_CHAIN_ID
  ) {
    return fail("configuration_missing", 503);
  }

  try {
    const db = getDb();
    const [lockedProposal] = await db
      .select()
      .from(settlementProposals)
      .where(
        and(
          eq(settlementProposals.id, proposalId),
          eq(settlementProposals.tabId, tabId),
          eq(settlementProposals.status, "locked"),
        ),
      )
      .orderBy(desc(settlementProposals.createdAt))
      .limit(1);

    if (!lockedProposal) {
      return fail("proposal_not_ready", 409);
    }

    const proposal = proposalDto(lockedProposal);

    if (new Date(proposal.expiresAt).getTime() <= Date.now()) {
      return fail("invalid_transition", 409);
    }

    if (
      proposal.proposalHash.toLowerCase() !== proposalHash ||
      proposal.settlementContractAddress.toLowerCase() !== configuredContract
    ) {
      return fail("stale_record", 409, [
        "Something changed. Create a fresh Final Tab before approving.",
      ]);
    }

    try {
      const activeFinalTab = await readActiveFinalTab({
        settlementContractAddress: configuredContract as Address,
        tabKey: proposal.tabKey as Hex,
      });

      if (
        isZeroBytes32(activeFinalTab.proposalHash) ||
        activeFinalTab.proposalHash.toLowerCase() !== proposal.proposalHash.toLowerCase()
      ) {
        return fail("stale_record", 409, [
          "Something changed. Create a fresh Final Tab before approving.",
        ]);
      }

      if (!lockedProposal.registeredAt && activeFinalTab.registeredAt > BigInt(0)) {
        await db
          .update(settlementProposals)
          .set({
            registeredAt: new Date(Number(activeFinalTab.registeredAt) * 1000),
            updatedAt: new Date(),
          })
          .where(eq(settlementProposals.id, lockedProposal.id));
      }
    } catch {
      return fail("database_unavailable", 503, [
        "We could not reach Arbitrum Sepolia. Try again.",
      ]);
    }

    const owed = proposal.transfers
      .filter((transfer) => transfer.fromMemberId === memberId)
      .reduce((total, transfer) => total + BigInt(transfer.amountBaseUnits), BigInt(0));

    if (owed <= BigInt(0) || (exactAmount !== null && exactAmount !== owed)) {
      return fail("validation_failed", 422);
    }

    const zeroDevConfig = getZeroDevAccountConfig();
    const [settlementAccount] = await db
      .select()
      .from(userSettlementAccounts)
      .where(
        and(
          eq(userSettlementAccounts.userId, currentUser.data.user.id),
          eq(userSettlementAccounts.configHash, zeroDevConfig.configHash),
        ),
      )
      .orderBy(desc(userSettlementAccounts.updatedAt))
      .limit(1);
    const walletAddress = normalizeEvmAddress(settlementAccount?.settlementAddress);

    if (
      !settlementAccount ||
      settlementAccount.delegationStatus !== "ready" ||
      !walletAddress
    ) {
      return fail("account_unavailable", 409, [
        "This tab is linked to a different settlement wallet.",
      ]);
    }

    const expiry = lockedProposal.expiresAt;
    const nonce = authorizationNonce ?? nextAuthorizationNonce(memberId, proposal.proposalHash);

    if (action === "prepare") {
      return {
        data: {
          calls: serializeCalls(
            encodeAuthorizeFinalTabBatch({
              exactAmountBaseUnits: owed.toString(),
              expiresAtUnixSeconds: toUnixSeconds(expiry),
              nonce,
              proposalHash,
              settlementContractAddress: configuredContract as Address,
              tabKey: proposal.tabKey as Hex,
              tokenAddress: TABY_USDC_ADDRESS as Address,
            }),
          ),
          expectedAmountBaseUnits: owed.toString(),
          expiresAt: expiry.toISOString(),
          expiresAtUnixSeconds: toUnixSeconds(expiry),
          nonce,
          proposalHash: proposal.proposalHash,
          proposalId: proposal.id,
          settlementContractAddress: configuredContract,
          tabKey: proposal.tabKey,
          tokenAddress: TABY_USDC_ADDRESS.toLowerCase(),
          walletAddress,
        },
        ok: true,
      } satisfies TabResult<unknown>;
    }

    if (!authorizationNonce || !userOperationHash || !transactionHash || exactAmount !== owed) {
      return fail("validation_failed", 422);
    }

    try {
      const [allowance, contractAuthorization] = await Promise.all([
        readUsdcAllowance({
          owner: walletAddress as Address,
          spender: configuredContract as Address,
          tokenAddress: TABY_USDC_ADDRESS as Address,
        }),
        readFinalTabAuthorization({
          debtor: walletAddress as Address,
          proposalHash,
          settlementContractAddress: configuredContract as Address,
        }),
      ]);

      if (
        allowance !== owed ||
        contractAuthorization.proposalHash.toLowerCase() !== proposal.proposalHash.toLowerCase() ||
        !isAddressEqual(contractAuthorization.debtor, walletAddress as Address) ||
        contractAuthorization.amount !== owed ||
        contractAuthorization.revoked ||
        contractAuthorization.expiresAt > BigInt(toUnixSeconds(expiry)) ||
        contractAuthorization.expiresAt <= BigInt(toUnixSeconds(new Date()))
      ) {
        return fail("validation_failed", 422, [
          "Approval did not go through. Nothing changed. Try again.",
        ]);
      }
    } catch {
      return fail("database_unavailable", 503, [
        "We could not reach Arbitrum Sepolia. Try again.",
      ]);
    }

    const result = await db.transaction(async (tx) => {
      const [operation] = await tx
        .insert(userOperationRecords)
        .values({
          purpose: "final_tab_authorization",
          settlementAccountId: settlementAccount.id,
          status: "confirmed",
          confirmedAt: new Date(),
          transactionHash: transactionHash as string,
          userId: currentUser.data.user.id,
          userOperationHash,
        })
        .onConflictDoUpdate({
          set: {
            confirmedAt: new Date(),
            status: "confirmed",
            transactionHash: transactionHash as string,
            updatedAt: new Date(),
          },
          target: userOperationRecords.userOperationHash,
        })
        .returning();

      const [authorization] = await tx
        .insert(tabAuthorizations)
        .values({
          allowanceTxHash: transactionHash,
          authorizationAmountBaseUnits: owed,
          authorizationMethod: "zerodev_final_tab",
          authorizationNonce: BigInt(authorizationNonce),
          authorizationTxHash: transactionHash,
          capBaseUnits: owed,
          expiresAt: expiry,
          maxSingleSettlementBaseUnits: owed,
          memberId,
          proposalHash: proposal.proposalHash,
          proposalId: proposal.id,
          settlementContractAddress: configuredContract,
          tabId,
          tokenAddress: TABY_USDC_ADDRESS.toLowerCase(),
          userOperationHash: operation.userOperationHash,
          walletAddress,
        })
        .returning();

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            authorizationId: authorization.id,
            amountBaseUnits: owed.toString(),
            memberId,
            proposalHash: proposal.proposalHash,
            transactionHash,
          },
          eventType: "authorization_recorded",
          tabId,
        })
        .returning();

      return { activity, authorization };
    });

    return {
      data: {
        activity: activityDto(result.activity),
        authorization: authorizationDto(result.authorization),
      },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function revokeTabAuthorization(input: {
  action?: unknown;
  authorizationId: unknown;
  didToken: unknown;
  transactionHash?: unknown;
  userOperationHash?: unknown;
}): Promise<TabResult<unknown>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.authorizationId)) {
    return fail("validation_failed", 422);
  }

  const action = input.action === "confirm" ? "confirm" : "prepare";
  const userOperationHash = normalizeOperationHash(input.userOperationHash);
  const transactionHash =
    typeof input.transactionHash === "string" ? input.transactionHash.toLowerCase() : null;

  if (action === "confirm" && (!userOperationHash || !isEvmTxHash(transactionHash))) {
    return fail("validation_failed", 422);
  }

  try {
    const db = getDb();
    const [authorization] = await db
      .select()
      .from(tabAuthorizations)
      .where(eq(tabAuthorizations.id, input.authorizationId));

    if (!authorization) {
      return fail("not_found", 404);
    }

    const access = await getAccessContext(authorization.tabId, currentUser.data.user.id);

    if (!access.ok) {
      return access;
    }

    if (
      !access.data.currentMember ||
      access.data.currentMember.id !== authorization.memberId ||
      access.data.currentMember.joinStatus !== "joined"
    ) {
      return fail("unauthorized", 403);
    }

    if (authorization.revokedAt) {
      return fail("invalid_transition", 409);
    }

    if (
      !authorization.proposalId ||
      !authorization.proposalHash ||
      !authorization.authorizationNonce ||
      authorization.authorizationMethod !== "zerodev_final_tab"
    ) {
      return fail("proposal_not_ready", 409, [
        "We could not find an active approval to revoke. Refresh status.",
      ]);
    }

    if (
      access.data.tab.status === "settling" ||
      access.data.tab.status === "settled" ||
      access.data.tab.status === "cancelled"
    ) {
      return fail("invalid_transition", 409);
    }

    const [proposal] = await db
      .select()
      .from(settlementProposals)
      .where(eq(settlementProposals.id, authorization.proposalId));

    if (!proposal || proposal.status !== "locked" || proposal.executedAt) {
      return fail("invalid_transition", 409);
    }

    const zeroDevConfig = getZeroDevAccountConfig();
    const [settlementAccount] = await db
      .select()
      .from(userSettlementAccounts)
      .where(
        and(
          eq(userSettlementAccounts.userId, currentUser.data.user.id),
          eq(userSettlementAccounts.configHash, zeroDevConfig.configHash),
        ),
      )
      .orderBy(desc(userSettlementAccounts.updatedAt))
      .limit(1);

    if (
      !settlementAccount ||
      settlementAccount.delegationStatus !== "ready" ||
      normalizeEvmAddress(settlementAccount.settlementAddress) !==
        normalizeEvmAddress(authorization.walletAddress)
    ) {
      return fail("account_unavailable", 409, [
        "This tab is linked to a different settlement wallet.",
      ]);
    }

    const settlementContractAddress = normalizeEvmAddress(authorization.settlementContractAddress);
    const proposalHash = normalizeHex32(authorization.proposalHash);
    const tabKey = normalizeHex32(proposal.tabKey);
    const tokenAddress = normalizeEvmAddress(authorization.tokenAddress);

    if (!settlementContractAddress || !proposalHash || !tabKey || !tokenAddress) {
      return fail("configuration_missing", 503, [
        "Settlement is not configured for this Final Tab.",
      ]);
    }

    if (action === "prepare") {
      return {
        data: {
          calls: serializeCalls(
            encodeRevokeFinalTabBatch({
              nonce: authorization.authorizationNonce.toString(),
              proposalHash,
              settlementContractAddress: settlementContractAddress as Address,
              tabKey,
              tokenAddress: tokenAddress as Address,
            }),
          ),
          authorizationId: authorization.id,
          nonce: authorization.authorizationNonce.toString(),
          proposalHash: authorization.proposalHash,
          settlementContractAddress,
          tabKey,
          tokenAddress,
        },
        ok: true,
      } satisfies TabResult<unknown>;
    }

    try {
      const [allowance, contractAuthorization] = await Promise.all([
        readUsdcAllowance({
          owner: authorization.walletAddress as Address,
          spender: settlementContractAddress as Address,
          tokenAddress: tokenAddress as Address,
        }),
        readFinalTabAuthorization({
          debtor: authorization.walletAddress as Address,
          proposalHash,
          settlementContractAddress: settlementContractAddress as Address,
        }),
      ]);

      if (
        allowance !== BigInt(0) ||
        contractAuthorization.proposalHash.toLowerCase() !==
          authorization.proposalHash.toLowerCase() ||
        !contractAuthorization.revoked
      ) {
        return fail("validation_failed", 422, [
          "Revocation did not go through. Nothing changed. Try again.",
        ]);
      }
    } catch {
      return fail("database_unavailable", 503, [
        "We could not reach Arbitrum Sepolia. Try again.",
      ]);
    }

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [operation] = await tx
        .insert(userOperationRecords)
        .values({
          purpose: "final_tab_revocation",
          settlementAccountId: settlementAccount.id,
          status: "confirmed",
          confirmedAt: now,
          transactionHash: transactionHash as string,
          userId: currentUser.data.user.id,
          userOperationHash: userOperationHash as string,
        })
        .onConflictDoUpdate({
          set: {
            confirmedAt: now,
            status: "confirmed",
            transactionHash: transactionHash as string,
            updatedAt: now,
          },
          target: userOperationRecords.userOperationHash,
        })
        .returning();

      const [updatedAuthorization] = await tx
        .update(tabAuthorizations)
        .set({
          revocationTxHash: transactionHash as string,
          revokedAt: now,
          updatedAt: now,
          userOperationHash: operation.userOperationHash,
        })
        .where(eq(tabAuthorizations.id, authorization.id))
        .returning();

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            authorizationId: authorization.id,
            memberId: authorization.memberId,
            transactionHash,
          },
          eventType: "authorization_revoked",
          tabId: authorization.tabId,
        })
        .returning();

      return { activity, authorization: updatedAuthorization };
    });

    return {
      data: {
        activity: activityDto(result.activity),
        authorization: authorizationDto(result.authorization),
      },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function createSettlementProposal(input: {
  didToken: unknown;
  includedExpenseIds?: unknown;
  tabId: unknown;
}): Promise<TabResult<SettlementProposalMutationResponse>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.tabId)) {
    return fail("validation_failed", 422);
  }

  const tabId = input.tabId;
  const requestedIds = Array.isArray(input.includedExpenseIds) ? input.includedExpenseIds : [];

  if (!requestedIds.every(isUuid)) {
    return fail("validation_failed", 422);
  }

  const access = await getAccessContext(tabId, currentUser.data.user.id);

  if (!access.ok) {
    return access;
  }

  if (!access.data.currentMember || access.data.currentMember.joinStatus !== "joined") {
    return fail("unauthorized", 403);
  }

  if (!MUTABLE_TAB_STATUSES.has(access.data.tab.status)) {
    return fail("invalid_transition", 409);
  }

  try {
    const db = getDb();
    const settlementContractAddress = normalizeEvmAddress(getSettlementContractAddress());

    if (!settlementContractAddress) {
      return fail("configuration_missing", 503, ["Settlement is not configured yet."]);
    }

    if (access.data.tab.networkChainId !== TABY_CHAIN_ID) {
      return fail("configuration_missing", 409, ["Settlement is configured for Arbitrum Sepolia."]);
    }

    if (access.data.tab.tokenAddress.toLowerCase() !== TABY_USDC_ADDRESS.toLowerCase()) {
      return fail("configuration_missing", 409, ["Settlement is configured for USDC only."]);
    }

    const [tabExpenses, members, splitRows] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.tabId, tabId)),
      db.select().from(tabMembers).where(eq(tabMembers.tabId, tabId)),
      db
        .select()
        .from(expenseSplits)
        .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
        .where(eq(expenses.tabId, tabId)),
    ]);
    const requestedSet = new Set(requestedIds);
    const included =
      requestedSet.size > 0
        ? tabExpenses.filter((expense) => requestedSet.has(expense.id))
        : tabExpenses.filter((expense) => expense.status === "confirmed");

    if (included.length === 0) {
      return fail("proposal_not_ready", 409);
    }

    if (included.some((expense) => expense.status !== "confirmed")) {
      return fail("proposal_not_ready", 409);
    }

    if (requestedSet.size > 0 && included.length !== requestedSet.size) {
      return fail("proposal_not_ready", 409);
    }

    const hasBlockingExpense = tabExpenses.some(
      (expense) =>
        requestedSet.has(expense.id) &&
        ["pending", "disputed", "excluded", "locked", "settled"].includes(expense.status),
    );

    if (hasBlockingExpense) {
      return fail("proposal_not_ready", 409);
    }

    const activeProposalRows = await db
      .select()
      .from(settlementProposals)
      .where(
        and(
          eq(settlementProposals.tabId, tabId),
          inArray(settlementProposals.status, ["open", "locked"]),
        ),
      )
      .limit(1);

    if (activeProposalRows[0]) {
      return fail("invalid_transition", 409, ["This tab already has an active Final Tab."]);
    }

    const settlement = calculateSettlement(
      createSettlementInputsFromTabDetail({
        expenses: included.map(expenseDto),
        members: members.map(memberDto),
        splits: splitRows.map((row) => splitDto(row.expense_splits)),
        tokenAddress: access.data.tab.tokenAddress,
      }),
    );

    if (!settlement.ok) {
      return fail("settlement_engine_unavailable", 409, [settlement.error.message]);
    }

    const includedIds = included.map((expense) => expense.id).sort();
    const excludedIds = tabExpenses
      .filter((expense) => !includedIds.includes(expense.id))
      .map((expense) => expense.id)
      .sort();

    if (
      settlement.result.eligibleExpenseIds.length !== includedIds.length ||
      settlement.result.eligibleExpenseIds.some((id, index) => id !== includedIds[index])
    ) {
      return fail("proposal_not_ready", 409);
    }

    if (
      settlement.result.transfers.length === 0 ||
      BigInt(settlement.result.totalMovingBaseUnits) === BigInt(0)
    ) {
      return fail("proposal_not_ready", 409, ["Everyone is even, so there is nothing to settle."]);
    }

    const expiresAt = new Date(
      Date.now() + access.data.tab.defaultExpiryHours * 60 * 60 * 1000,
    );
    const settlementMembers = await withReadySettlementWallets(db, members);
    const coordinator = settlementMembers.find(
      (member) =>
        member.userId === access.data.tab.ownerUserId ||
        (member.role === "owner" && member.joinStatus === "joined"),
    );

    if (!coordinator?.walletAddress) {
      return fail("proposal_not_ready", 409, [
        "A member in this Final Tab needs a settlement wallet before you can continue.",
      ]);
    }
    const coordinatorWalletAddress = coordinator.walletAddress;

    const memberById = new Map(settlementMembers.map((member) => [member.id, member]));
    const missingTransferWallet = settlement.result.transfers.some((transfer) => {
      const debtor = memberById.get(transfer.fromMemberId);
      const creditor = memberById.get(transfer.toMemberId);

      return !debtor?.walletAddress || !creditor?.walletAddress;
    });

    if (missingTransferWallet) {
      return fail("proposal_not_ready", 409, [
        "A member in this Final Tab needs a settlement wallet before you can continue.",
      ]);
    }

    const result = await db.transaction(async (tx) => {
      const [activeProposal] = await tx
        .select()
        .from(settlementProposals)
        .where(
          and(
            eq(settlementProposals.tabId, tabId),
            inArray(settlementProposals.status, ["open", "locked"]),
          ),
        )
        .limit(1);

      if (activeProposal) {
        tx.rollback();
      }

      const [versionRow] = await tx
        .select({
          maxVersion: sql<number>`coalesce(max(${settlementProposals.proposalVersion}), 0)::int`,
        })
        .from(settlementProposals)
        .where(eq(settlementProposals.tabId, tabId));
      const proposalVersion = (versionRow?.maxVersion ?? 0) + 1;
      const finalTab = buildFinalTab({
        chainId: access.data.tab.networkChainId,
        coordinatorWalletAddress,
        excludedExpenses: tabExpenses.filter((expense) => !includedIds.includes(expense.id)),
        expiresAt,
        includedExpenses: included,
        members: settlementMembers,
        proposalVersion,
        settlement: settlement.result,
        settlementContractAddress,
        splits: splitRows.map((row) => row.expense_splits),
        tabId,
        tokenAddress: access.data.tab.tokenAddress,
      });

      const [proposal] = await tx
        .insert(settlementProposals)
        .values({
          canonicalPayloadJson: finalTab.payload,
          chainId: access.data.tab.networkChainId,
          coordinatorWalletAddress: finalTab.payload.coordinatorWalletAddress,
          createdByUserId: currentUser.data.user.id,
          excludedExpenseIds: excludedIds,
          excludedExpensesHash: finalTab.excludedExpensesHash,
          expiresAt,
          includedExpenseIds: includedIds,
          includedExpensesHash: finalTab.includedExpensesHash,
          netBalancesJson: settlement.result.balances,
          proposalHash: finalTab.proposalHash,
          proposalVersion,
          schemaVersion: finalTab.payload.schemaVersion,
          settlementContractAddress: finalTab.payload.settlementContractAddress,
          status: "open",
          tabId,
          tabIdHash: finalTab.tabIdHash,
          tabKey: finalTab.tabKey,
          tokenAddress: finalTab.payload.tokenAddress,
          totalAmountBaseUnits: BigInt(settlement.result.totalMovingBaseUnits),
          transfersHash: finalTab.transfersHash,
          transfersJson: settlement.result.transfers,
        })
        .returning();

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            includedCount: includedIds.length,
            proposalId: proposal.id,
            proposalHash: proposal.proposalHash,
            proposalVersion,
            totalAmountBaseUnits: settlement.result.totalMovingBaseUnits,
            transferCount: settlement.result.transfers.length,
          },
          eventType: "proposal_created",
          tabId,
        })
        .returning();

      await tx
        .update(tabs)
        .set({ status: "review", updatedAt: new Date() })
        .where(eq(tabs.id, tabId));

      return { activity, proposal };
    });

    return {
      data: { activity: activityDto(result.activity), proposal: proposalDto(result.proposal) },
      ok: true,
    };
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function lockSettlementProposal(input: {
  action?: unknown;
  didToken: unknown;
  proposalId: unknown;
  transactionHash?: unknown;
  userOperationHash?: unknown;
}): Promise<TabResult<unknown>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.proposalId)) {
    return fail("validation_failed", 422);
  }

  const action = input.action === "confirm" ? "confirm" : "prepare";
  const userOperationHash = normalizeOperationHash(input.userOperationHash);
  const transactionHash =
    typeof input.transactionHash === "string" ? input.transactionHash.toLowerCase() : null;

  if (action === "confirm" && (!userOperationHash || !isEvmTxHash(transactionHash))) {
    return fail("validation_failed", 422);
  }

  try {
    const db = getDb();
    const [proposal] = await db
      .select()
      .from(settlementProposals)
      .where(eq(settlementProposals.id, input.proposalId));

    if (!proposal) {
      return fail("not_found", 404);
    }

    const access = await getAccessContext(proposal.tabId, currentUser.data.user.id);

    if (!access.ok) {
      return access;
    }

    if (!access.data.currentMember || access.data.currentMember.joinStatus !== "joined") {
      return fail("unauthorized", 403);
    }

    if (proposal.status === "locked") {
      return { data: { proposal: proposalDto(proposal) }, ok: true };
    }

    if (proposal.status !== "open") {
      return fail("invalid_transition", 409);
    }

    if (proposal.expiresAt.getTime() <= Date.now()) {
      return fail("stale_record", 409, [
        "This Final Tab expired. Create a fresh one before settling.",
      ]);
    }

    if (!REVIEWABLE_TAB_STATUSES.has(access.data.tab.status)) {
      return fail("invalid_transition", 409);
    }

    const [tabExpenses, members, splitRows] = await Promise.all([
      db.select().from(expenses).where(eq(expenses.tabId, proposal.tabId)),
      db.select().from(tabMembers).where(eq(tabMembers.tabId, proposal.tabId)),
      db
        .select()
        .from(expenseSplits)
        .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
        .where(eq(expenses.tabId, proposal.tabId)),
    ]);
    const settlementContractAddress = normalizeEvmAddress(getSettlementContractAddress());

    if (!settlementContractAddress) {
      return fail("configuration_missing", 503, ["Settlement is not configured yet."]);
    }

    if (settlementContractAddress !== proposal.settlementContractAddress.toLowerCase()) {
      return fail("stale_record", 409, [
        "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
      ]);
    }

    const includedSet = new Set(proposal.includedExpenseIds);
    const includedExpenses = tabExpenses.filter((expense) => includedSet.has(expense.id));

    if (
      includedExpenses.length !== proposal.includedExpenseIds.length ||
      includedExpenses.some((expense) => expense.status !== "confirmed")
    ) {
      return fail("stale_record", 409, [
        "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
      ]);
    }

    const settlement = calculateSettlement(
      createSettlementInputsFromTabDetail({
        expenses: includedExpenses.map(expenseDto),
        members: members.map(memberDto),
        splits: splitRows.map((row) => splitDto(row.expense_splits)),
        tokenAddress: access.data.tab.tokenAddress,
      }),
    );

    if (!settlement.ok) {
      return fail("settlement_engine_unavailable", 409, [settlement.error.message]);
    }

    const settlementMembers = await withReadySettlementWallets(db, members);
    const coordinator = settlementMembers.find(
      (member) =>
        member.userId === access.data.tab.ownerUserId ||
        (member.role === "owner" && member.joinStatus === "joined"),
    );

    if (!coordinator?.walletAddress) {
      return fail("proposal_not_ready", 409, [
        "A member in this Final Tab needs a settlement wallet before you can continue.",
      ]);
    }
    const coordinatorWalletAddress = coordinator.walletAddress;

    let currentFinalTab;

    try {
      currentFinalTab = buildFinalTab({
        chainId: access.data.tab.networkChainId,
        coordinatorWalletAddress,
        excludedExpenses: tabExpenses.filter((expense) => !includedSet.has(expense.id)),
        expiresAt: proposal.expiresAt,
        includedExpenses,
        members: settlementMembers,
        proposalVersion: proposal.proposalVersion,
        settlement: settlement.result,
        settlementContractAddress,
        splits: splitRows.map((row) => row.expense_splits),
        tabId: proposal.tabId,
        tokenAddress: access.data.tab.tokenAddress,
      });
    } catch {
      return fail("proposal_not_ready", 409, [
        "A member in this Final Tab needs a settlement wallet before you can continue.",
      ]);
    }

    if (currentFinalTab.proposalHash !== proposal.proposalHash) {
      return fail("stale_record", 409, [
        "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
      ]);
    }

    const memberById = new Map(settlementMembers.map((member) => [member.id, member]));
    const missingTransferMember = settlement.result.transfers.some((transfer) => {
      const debtor = memberById.get(transfer.fromMemberId);
      const creditor = memberById.get(transfer.toMemberId);

      return !debtor?.walletAddress || !creditor?.walletAddress;
    });

    if (missingTransferMember) {
      return fail("proposal_not_ready", 409, [
        "A member in this Final Tab needs a settlement wallet before you can continue.",
      ]);
    }

    const zeroDevConfig = getZeroDevAccountConfig();
    const [settlementAccount] = await db
      .select()
      .from(userSettlementAccounts)
      .where(
        and(
          eq(userSettlementAccounts.userId, currentUser.data.user.id),
          eq(userSettlementAccounts.configHash, zeroDevConfig.configHash),
        ),
      )
      .orderBy(desc(userSettlementAccounts.updatedAt))
      .limit(1);

    if (
      !settlementAccount ||
      settlementAccount.delegationStatus !== "ready" ||
      normalizeEvmAddress(settlementAccount.settlementAddress) !==
        normalizeEvmAddress(coordinatorWalletAddress)
    ) {
      return fail("account_unavailable", 409, [
        "Preparing secure settlement. You will not need gas to continue.",
      ]);
    }

    let activeFinalTab: ActiveFinalTabRead;

    try {
      activeFinalTab = await readActiveFinalTab({
        settlementContractAddress: settlementContractAddress as Address,
        tabKey: proposal.tabKey as Hex,
      });
    } catch {
      return fail("database_unavailable", 503, [
        "We could not reach Arbitrum Sepolia. Try again.",
      ]);
    }

    if (!isZeroBytes32(activeFinalTab.proposalHash)) {
      if (activeFinalTab.proposalHash.toLowerCase() !== proposal.proposalHash.toLowerCase()) {
        const [onchainProposal] = await db
          .select()
          .from(settlementProposals)
          .where(
            and(
              eq(settlementProposals.tabId, proposal.tabId),
              eq(settlementProposals.tabKey, proposal.tabKey),
              eq(settlementProposals.proposalHash, activeFinalTab.proposalHash.toLowerCase()),
            ),
          )
          .limit(1);

        if (!onchainProposal) {
          return fail("stale_record", 409, [
            "A Final Tab is already registered onchain. Cancel it before creating a fresh one.",
          ]);
        }

        const result = await db.transaction(async (tx) => {
          const now = new Date();
          const registeredAt =
            activeFinalTab.registeredAt > BigInt(0)
              ? new Date(Number(activeFinalTab.registeredAt) * 1000)
              : now;

          await tx
            .update(settlementProposals)
            .set({ cancelledAt: now, status: "cancelled", updatedAt: now })
            .where(
              and(
                eq(settlementProposals.tabId, proposal.tabId),
                eq(settlementProposals.status, "open"),
                ne(settlementProposals.id, onchainProposal.id),
              ),
            );

          const [lockedProposal] = await tx
            .update(settlementProposals)
            .set({
              lockedAt: onchainProposal.lockedAt ?? now,
              registeredAt,
              status: "locked",
              updatedAt: now,
            })
            .where(eq(settlementProposals.id, onchainProposal.id))
            .returning();

          if (!lockedProposal) {
            tx.rollback();
          }

          await tx
            .update(expenses)
            .set({ status: "locked", updatedAt: now })
            .where(
              and(
                eq(expenses.tabId, onchainProposal.tabId),
                eq(expenses.status, "confirmed"),
                inArray(expenses.id, onchainProposal.includedExpenseIds),
              ),
            );

          await tx
            .update(tabs)
            .set({ status: "locked", updatedAt: now })
            .where(eq(tabs.id, onchainProposal.tabId));

          const [activity] = await tx
            .insert(activityEvents)
            .values({
              actorUserId: currentUser.data.user.id,
              eventData: {
                proposalId: onchainProposal.id,
                proposalHash: onchainProposal.proposalHash,
                recoveredFromChain: true,
                replacedProposalId: proposal.id,
              },
              eventType: "proposal_locked",
              tabId: onchainProposal.tabId,
            })
            .returning();

          return { activity, proposal: lockedProposal };
        });

        return {
          data: {
            activity: activityDto(result.activity),
            proposal: proposalDto(result.proposal),
          },
          ok: true,
        };
      }

      const result = await db.transaction(async (tx) => {
        const now = new Date();
        const registeredAt =
          activeFinalTab.registeredAt > BigInt(0)
            ? new Date(Number(activeFinalTab.registeredAt) * 1000)
            : now;
        const [lockedProposal] = await tx
          .update(settlementProposals)
          .set({
            lockedAt: now,
            registeredAt,
            status: "locked",
            updatedAt: now,
          })
          .where(
            and(eq(settlementProposals.id, proposal.id), eq(settlementProposals.status, "open")),
          )
          .returning();

        if (!lockedProposal) {
          tx.rollback();
        }

        const lockedExpenses = await tx
          .update(expenses)
          .set({ status: "locked", updatedAt: now })
          .where(
            and(
              eq(expenses.tabId, proposal.tabId),
              eq(expenses.status, "confirmed"),
              inArray(expenses.id, proposal.includedExpenseIds),
            ),
          )
          .returning();

        if (lockedExpenses.length !== proposal.includedExpenseIds.length) {
          tx.rollback();
        }

        await tx
          .update(tabs)
          .set({ status: "locked", updatedAt: now })
          .where(eq(tabs.id, proposal.tabId));

        const [activity] = await tx
          .insert(activityEvents)
          .values({
            actorUserId: currentUser.data.user.id,
            eventData: {
              proposalId: proposal.id,
              proposalHash: proposal.proposalHash,
              recoveredFromChain: true,
            },
            eventType: "proposal_locked",
            tabId: proposal.tabId,
          })
          .returning();

        return { activity, proposal: lockedProposal };
      });

      return {
        data: { activity: activityDto(result.activity), proposal: proposalDto(result.proposal) },
        ok: true,
      };
    }

    if (action === "prepare") {
      return {
        data: {
          calls: serializeCalls([
            encodeRegisterFinalTabCall({
              payload: currentFinalTab.payload,
              proposalHash: proposal.proposalHash as Hex,
              settlementContractAddress: settlementContractAddress as Address,
            }),
          ]),
          proposal: proposalDto(proposal),
          proposalHash: proposal.proposalHash,
          purpose: "final_tab_registration",
          settlementContractAddress,
          tabKey: proposal.tabKey,
        },
        ok: true,
      } satisfies TabResult<unknown>;
    }

    activeFinalTab = await readActiveFinalTab({
      settlementContractAddress: settlementContractAddress as Address,
      tabKey: proposal.tabKey as Hex,
    });

    if (activeFinalTab.proposalHash.toLowerCase() !== proposal.proposalHash.toLowerCase()) {
      return fail("stale_record", 409, [
        "Something changed. Create a fresh Final Tab before approving.",
      ]);
    }

    const result = await db.transaction(async (tx) => {
      const now = new Date();
      await tx
        .insert(userOperationRecords)
        .values({
          purpose: "final_tab_registration",
          settlementAccountId: settlementAccount.id,
          status: "confirmed",
          confirmedAt: now,
          transactionHash: transactionHash as string,
          userId: currentUser.data.user.id,
          userOperationHash: userOperationHash as string,
        })
        .onConflictDoUpdate({
          set: {
            confirmedAt: now,
            status: "confirmed",
            transactionHash: transactionHash as string,
            updatedAt: now,
          },
          target: userOperationRecords.userOperationHash,
        });

      const [lockedProposal] = await tx
        .update(settlementProposals)
        .set({
          lockedAt: now,
          registeredAt: now,
          registrationTxHash: transactionHash as string,
          status: "locked",
          updatedAt: now,
        })
        .where(and(eq(settlementProposals.id, proposal.id), eq(settlementProposals.status, "open")))
        .returning();

      if (!lockedProposal) {
        tx.rollback();
      }

      const lockedExpenses = await tx
        .update(expenses)
        .set({ status: "locked", updatedAt: new Date() })
        .where(
          and(
            eq(expenses.tabId, proposal.tabId),
            eq(expenses.status, "confirmed"),
            inArray(expenses.id, proposal.includedExpenseIds),
          ),
        )
        .returning();

      if (lockedExpenses.length !== proposal.includedExpenseIds.length) {
        tx.rollback();
      }

      await tx
        .update(tabs)
        .set({ status: "locked", updatedAt: new Date() })
        .where(eq(tabs.id, proposal.tabId));

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            proposalId: proposal.id,
            proposalHash: proposal.proposalHash,
          },
          eventType: "proposal_locked",
          tabId: proposal.tabId,
        })
        .returning();

      return { activity, proposal: lockedProposal };
    });

    return {
      data: { activity: activityDto(result.activity), proposal: proposalDto(result.proposal) },
      ok: true,
    };
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function cancelSettlementProposal(input: {
  action?: unknown;
  didToken: unknown;
  proposalId: unknown;
  transactionHash?: unknown;
  userOperationHash?: unknown;
}): Promise<TabResult<unknown>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.proposalId)) {
    return fail("validation_failed", 422);
  }

  const action = input.action === "confirm" ? "confirm" : "prepare";
  const userOperationHash = normalizeOperationHash(input.userOperationHash);
  const transactionHash =
    typeof input.transactionHash === "string" ? input.transactionHash.toLowerCase() : null;

  if (action === "confirm" && (!userOperationHash || !isEvmTxHash(transactionHash))) {
    return fail("validation_failed", 422);
  }

  try {
    const db = getDb();
    const [proposal] = await db
      .select()
      .from(settlementProposals)
      .where(eq(settlementProposals.id, input.proposalId));

    if (!proposal) {
      return fail("not_found", 404);
    }

    const access = await getAccessContext(proposal.tabId, currentUser.data.user.id);

    if (!access.ok) {
      return access;
    }

    if (!access.data.currentMember || access.data.currentMember.joinStatus !== "joined") {
      return fail("unauthorized", 403);
    }

    if (proposal.status === "cancelled") {
      return { data: { proposal: proposalDto(proposal) }, ok: true };
    }

    if (proposal.status !== "open" && proposal.status !== "locked") {
      return fail("invalid_transition", 409);
    }

    if (access.data.tab.status === "settling" || access.data.tab.status === "settled") {
      return fail("invalid_transition", 409);
    }

    const [settlementTransaction] = await db
      .select()
      .from(settlementTransactions)
      .where(eq(settlementTransactions.proposalId, proposal.id))
      .limit(1);

    if (
      settlementTransaction?.status === "confirmed" ||
      settlementTransaction?.status === "submitted"
    ) {
      return fail("invalid_transition", 409);
    }

    let settlementAccountId: string | null = null;

    if (proposal.status === "locked" || proposal.registrationTxHash) {
      const zeroDevConfig = getZeroDevAccountConfig();
      const [settlementAccount] = await db
        .select()
        .from(userSettlementAccounts)
        .where(
          and(
            eq(userSettlementAccounts.userId, currentUser.data.user.id),
            eq(userSettlementAccounts.configHash, zeroDevConfig.configHash),
          ),
        )
        .orderBy(desc(userSettlementAccounts.updatedAt))
        .limit(1);
      const settlementContractAddress = normalizeEvmAddress(proposal.settlementContractAddress);
      const proposalHash = normalizeHex32(proposal.proposalHash);
      const tabKey = normalizeHex32(proposal.tabKey);

      if (
        !settlementAccount ||
        settlementAccount.delegationStatus !== "ready" ||
        !settlementContractAddress ||
        !proposalHash ||
        !tabKey
      ) {
        return fail("account_unavailable", 409, [
          "We could not cancel this Final Tab onchain. Try again before creating a fresh one.",
        ]);
      }

      settlementAccountId = settlementAccount.id;

      let activeFinalTab: ActiveFinalTabRead;

      try {
        activeFinalTab = await readActiveFinalTab({
          settlementContractAddress: settlementContractAddress as Address,
          tabKey,
        });
      } catch {
        return fail("database_unavailable", 503, [
          "We could not reach Arbitrum Sepolia. Try again.",
        ]);
      }

      if (
        !isZeroBytes32(activeFinalTab.proposalHash) &&
        activeFinalTab.proposalHash.toLowerCase() !== proposal.proposalHash.toLowerCase()
      ) {
        return fail("stale_record", 409, [
          "Another Final Tab is active onchain. Refresh before changing this one.",
        ]);
      }

      if (isZeroBytes32(activeFinalTab.proposalHash)) {
        const result = await db.transaction(async (tx) => {
          const now = new Date();
          const [cancelledProposal] = await tx
            .update(settlementProposals)
            .set({
              cancelledAt: proposal.cancelledAt ?? now,
              onchainCancelledAt: proposal.onchainCancelledAt ?? now,
              status: "cancelled",
              updatedAt: now,
            })
            .where(eq(settlementProposals.id, proposal.id))
            .returning();

          if (!cancelledProposal) {
            tx.rollback();
          }

          if (proposal.includedExpenseIds.length > 0) {
            await tx
              .update(expenses)
              .set({ status: "confirmed", updatedAt: now })
              .where(
                and(
                  eq(expenses.tabId, proposal.tabId),
                  eq(expenses.status, "locked"),
                  inArray(expenses.id, proposal.includedExpenseIds),
                ),
              );
          }

          await tx
            .update(tabs)
            .set({ status: "review", updatedAt: now })
            .where(eq(tabs.id, proposal.tabId));

          const [activity] = await tx
            .insert(activityEvents)
            .values({
              actorUserId: currentUser.data.user.id,
              eventData: {
                proposalId: proposal.id,
                proposalHash: proposal.proposalHash,
                recoveredFromChain: true,
              },
              eventType: "proposal_cancelled",
              tabId: proposal.tabId,
            })
            .returning();

          return { activity, proposal: cancelledProposal };
        });

        return {
          data: {
            activity: activityDto(result.activity),
            proposal: proposalDto(result.proposal),
          },
          ok: true,
        };
      }

      if (action === "prepare") {
        return {
          data: {
            calls: serializeCalls([
              encodeCancelFinalTabCall({
                proposalHash,
                settlementContractAddress: settlementContractAddress as Address,
                tabKey,
              }),
            ]),
            proposal: proposalDto(proposal),
            proposalHash: proposal.proposalHash,
            purpose: "final_tab_cancellation",
            settlementContractAddress,
            tabKey: proposal.tabKey,
          },
          ok: true,
        } satisfies TabResult<unknown>;
      }

      try {
        const cancelled = await isProposalCancelled({
          proposalHash,
          settlementContractAddress: settlementContractAddress as Address,
        });

        if (!cancelled) {
          return fail("invalid_transition", 409, [
            "We could not cancel this Final Tab onchain. Try again before creating a fresh one.",
          ]);
        }
      } catch {
        return fail("database_unavailable", 503, [
          "We could not reach Arbitrum Sepolia. Try again.",
        ]);
      }
    }

    const result = await db.transaction(async (tx) => {
      const now = new Date();
      if (settlementAccountId && userOperationHash && transactionHash) {
        await tx
          .insert(userOperationRecords)
          .values({
            purpose: "final_tab_cancellation",
            settlementAccountId,
            status: "confirmed",
            confirmedAt: now,
            transactionHash,
            userId: currentUser.data.user.id,
            userOperationHash,
          })
          .onConflictDoUpdate({
            set: {
              confirmedAt: now,
              status: "confirmed",
              transactionHash,
              updatedAt: now,
            },
            target: userOperationRecords.userOperationHash,
          });
      }

      const [cancelledProposal] = await tx
        .update(settlementProposals)
        .set({
          cancelledAt: now,
          cancellationTxHash: transactionHash,
          onchainCancelledAt: settlementAccountId ? now : proposal.onchainCancelledAt,
          status: "cancelled",
          updatedAt: now,
        })
        .where(
          and(
            eq(settlementProposals.id, proposal.id),
            inArray(settlementProposals.status, ["open", "locked"]),
          ),
        )
        .returning();

      if (!cancelledProposal) {
        tx.rollback();
      }

      if (proposal.status === "locked" && proposal.includedExpenseIds.length > 0) {
        await tx
          .update(expenses)
          .set({ status: "confirmed", updatedAt: new Date() })
          .where(
            and(
              eq(expenses.tabId, proposal.tabId),
              eq(expenses.status, "locked"),
              inArray(expenses.id, proposal.includedExpenseIds),
            ),
          );
      }

      await tx
        .update(tabs)
        .set({ status: "review", updatedAt: new Date() })
        .where(eq(tabs.id, proposal.tabId));

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            proposalId: proposal.id,
            proposalHash: proposal.proposalHash,
          },
          eventType: "proposal_cancelled",
          tabId: proposal.tabId,
        })
        .returning();

      return { activity, proposal: cancelledProposal };
    });

    return {
      data: { activity: activityDto(result.activity), proposal: proposalDto(result.proposal) },
      ok: true,
    };
  } catch {
    return fail("database_unavailable", 503);
  }
}

export async function previewSettlementProposal(input: {
  didToken: unknown;
  expectedProposalHash?: unknown;
  expectedSnapshotHash?: unknown;
  phase?: unknown;
  proposalId: unknown;
}): Promise<TabResult<SettlementPreviewResponse>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.proposalId)) {
    return fail("validation_failed", 422);
  }

  const phase =
    input.phase === "countdown" || input.phase === "final_precheck" ? input.phase : "open";
  const expectedProposalHash =
    typeof input.expectedProposalHash === "string" ? input.expectedProposalHash : null;
  const expectedSnapshotHash =
    typeof input.expectedSnapshotHash === "string" ? input.expectedSnapshotHash : null;

  try {
    const db = getDb();
    const [proposalRow] = await db
      .select()
      .from(settlementProposals)
      .where(eq(settlementProposals.id, input.proposalId));

    if (!proposalRow) {
      return fail("not_found", 404);
    }

    const access = await getAccessContext(proposalRow.tabId, currentUser.data.user.id);

    if (!access.ok) {
      return access;
    }

    if (!access.data.currentMember || access.data.currentMember.joinStatus !== "joined") {
      return fail("unauthorized", 403);
    }

    const [
      members,
      tabExpenses,
      splitRows,
      authorizationRows,
    ] = await Promise.all([
      db.select().from(tabMembers).where(eq(tabMembers.tabId, proposalRow.tabId)),
      db.select().from(expenses).where(eq(expenses.tabId, proposalRow.tabId)),
      db
        .select()
        .from(expenseSplits)
        .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
        .where(eq(expenses.tabId, proposalRow.tabId)),
      db.select().from(tabAuthorizations).where(eq(tabAuthorizations.tabId, proposalRow.tabId)),
    ]);
    const proposal = proposalDto(proposalRow);
    const tab = access.data.tab;
    const settlementMembers = await withReadySettlementWallets(db, members);
    const memberById = new Map(settlementMembers.map((member) => [member.id, member]));
    const authorizationReadiness = await buildAuthorizationReadiness({
      authorizations: authorizationRows,
      members: settlementMembers,
      proposal,
      settlementContractAddress: proposal.settlementContractAddress,
    });
    const readinessByMemberId = new Map(
      authorizationReadiness.map((item) => [item.memberId, item]),
    );
    const includedSet = new Set(proposal.includedExpenseIds);
    const settlementContractAddress = normalizeEvmAddress(getSettlementContractAddress());
    const blockers: SettlementPreviewBlocker[] = [];
    const nowMs = Date.now();

    if (proposal.status !== "locked") {
      blockers.push(
        previewBlocker({
          id: "proposal-not-locked",
          kind: "tab_not_ready",
          message: "Lock the Final Tab before previewing settlement.",
        }),
      );
    }

    if (proposal.expiresAt && new Date(proposal.expiresAt).getTime() <= nowMs) {
      blockers.push(
        previewBlocker({
          id: "proposal-expired",
          kind: "expired_proposal",
          message: "This Final Tab expired. Create a fresh one before settling.",
        }),
      );
    }

    if (expectedProposalHash && expectedProposalHash !== proposal.proposalHash) {
      blockers.push(
        previewBlocker({
          id: "proposal-hash-changed",
          kind: "stale_proposal",
          message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
        }),
      );
    }

    if (tab.status === "settling" || tab.status === "settled" || tab.status === "cancelled") {
      blockers.push(
        previewBlocker({
          id: "tab-not-ready",
          kind: "tab_not_ready",
          message: "This tab is not ready for settlement preview.",
        }),
      );
    }

    if (tab.networkChainId !== TABY_CHAIN_ID) {
      blockers.push(
        previewBlocker({
          id: "chain-mismatch",
          kind: "configuration_missing",
          message: "Settlement is configured for Arbitrum Sepolia.",
        }),
      );
    }

    if (tab.tokenAddress.toLowerCase() !== TABY_USDC_ADDRESS.toLowerCase()) {
      blockers.push(
        previewBlocker({
          id: "token-mismatch",
          kind: "token_mismatch",
          message: "Settlement is configured for USDC only.",
        }),
      );
    }

    if (!settlementContractAddress) {
      blockers.push(
        previewBlocker({
          id: "contract-missing",
          kind: "contract_missing",
          message: "Settlement is not configured yet.",
        }),
      );
    } else if (settlementContractAddress !== proposal.settlementContractAddress.toLowerCase()) {
      blockers.push(
        previewBlocker({
          id: "contract-changed",
          kind: "stale_proposal",
          message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
        }),
      );
    }

    const includedExpenses = tabExpenses.filter((expense) => includedSet.has(expense.id));

    if (includedExpenses.length !== proposal.includedExpenseIds.length) {
      blockers.push(
        previewBlocker({
          id: "included-expense-missing",
          kind: "changed_expense",
          message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
        }),
      );
    }

    for (const expense of includedExpenses) {
      if (expense.status !== "locked" && expense.status !== "confirmed") {
        blockers.push(
          previewBlocker({
            expenseId: expense.id,
            id: `expense-${expense.id}`,
            kind: "changed_expense",
            message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
          }),
        );
      }
    }

    const normalizedExpenses = tabExpenses.map((expense) =>
      includedSet.has(expense.id) && expense.status === "locked"
        ? { ...expenseDto(expense), status: "confirmed" as const }
        : expenseDto(expense),
    );
    const settlement = calculateSettlement(
      createSettlementInputsFromTabDetail({
        expenses: normalizedExpenses.filter((expense) => includedSet.has(expense.id)),
        members: settlementMembers.map(memberDto),
        splits: splitRows.map((row) => splitDto(row.expense_splits)),
        tokenAddress: tab.tokenAddress,
      }),
    );

    if (!settlement.ok) {
      blockers.push(
        previewBlocker({
          expenseId: settlement.error.expenseId,
          id: `settlement-${settlement.error.code}`,
          kind:
            settlement.error.code === "token_mismatch"
              ? "token_mismatch"
              : settlement.error.memberId
                ? "changed_member"
                : "changed_expense",
          memberId: settlement.error.memberId,
          message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
        }),
      );
    } else {
      const coordinator = settlementMembers.find(
        (member) =>
          member.userId === tab.ownerUserId ||
          (member.role === "owner" && member.joinStatus === "joined"),
      );

      let currentFinalTab = null;

      if (settlementContractAddress && coordinator?.walletAddress) {
        try {
          currentFinalTab = buildFinalTab({
            chainId: tab.networkChainId,
            coordinatorWalletAddress: coordinator.walletAddress,
            excludedExpenses: tabExpenses.filter((expense) => !includedSet.has(expense.id)),
            expiresAt: proposalRow.expiresAt,
            includedExpenses,
            members: settlementMembers,
            proposalVersion: proposalRow.proposalVersion,
            settlement: settlement.result,
            settlementContractAddress,
            splits: splitRows.map((row) => row.expense_splits),
            tabId: proposal.tabId,
            tokenAddress: tab.tokenAddress,
          });
        } catch {
          blockers.push(
            previewBlocker({
              id: "proposal-wallet-state",
              kind: "missing_wallet",
              message: "A member in this Final Tab needs a settlement wallet before you can continue.",
            }),
          );
        }
      }

      if (currentFinalTab && currentFinalTab.proposalHash !== proposal.proposalHash) {
        blockers.push(
          previewBlocker({
            id: "proposal-stale",
            kind: "stale_proposal",
            message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
          }),
        );
      }
    }

    if (proposal.transfers.length === 0 || BigInt(proposal.totalAmountBaseUnits) === BigInt(0)) {
      blockers.push(
        previewBlocker({
          id: "zero-transfers",
          kind: "tab_not_ready",
          message: "Everyone is even, so there is nothing to settle.",
          severity: "info",
        }),
      );
    }

    const debtorAmounts = new Map<string, bigint>();

    for (const transfer of proposal.transfers) {
      if (BigInt(transfer.amountBaseUnits) <= BigInt(0)) {
        blockers.push(
          previewBlocker({
            id: `transfer-${transfer.id}`,
            kind: "stale_proposal",
            message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
          }),
        );
      }

      const debtor = memberById.get(transfer.fromMemberId);
      const creditor = memberById.get(transfer.toMemberId);

      if (!debtor || debtor.joinStatus !== "joined") {
        blockers.push(
          previewBlocker({
            id: `debtor-${transfer.fromMemberId}`,
            kind: "unknown_member",
            memberId: transfer.fromMemberId,
            message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
          }),
        );
      }

      if (!creditor || creditor.joinStatus !== "joined") {
        blockers.push(
          previewBlocker({
            id: `creditor-${transfer.toMemberId}`,
            kind: "unknown_member",
            memberId: transfer.toMemberId,
            message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
          }),
        );
      }

      if (debtor && !debtor.walletAddress) {
        blockers.push(
          previewBlocker({
            id: `debtor-wallet-${debtor.id}`,
            kind: "missing_wallet",
            memberId: debtor.id,
            message: `${debtor.displayName} needs a wallet before settlement can continue.`,
          }),
        );
      }

      if (creditor && !creditor.walletAddress) {
        blockers.push(
          previewBlocker({
            id: `creditor-wallet-${creditor.id}`,
            kind: "missing_wallet",
            memberId: creditor.id,
            message: `${creditor.displayName} needs a wallet before settlement can continue.`,
          }),
        );
      }

      debtorAmounts.set(
        transfer.fromMemberId,
        (debtorAmounts.get(transfer.fromMemberId) ?? BigInt(0)) +
          BigInt(transfer.amountBaseUnits),
      );
    }

    const authorizationSummaries: SettlementPreviewAuthorizationSummary[] = [];

    for (const [memberId, owed] of debtorAmounts) {
      const member = memberById.get(memberId);
      const readiness = readinessByMemberId.get(memberId);
      const authorization = settlementContractAddress
        ? latestAuthorizationForMember(
            authorizationRows,
            memberId,
            TABY_USDC_ADDRESS,
            settlementContractAddress,
            proposal.proposalHash,
          )
        : undefined;
      const status = readiness
        ? previewStatusFromReadiness(readiness.status)
        : proposal.status === "locked"
          ? "checking"
        : previewStatusFromAuthorization({ authorization, member, nowMs, owed });

      authorizationSummaries.push({
        authorizationId: authorization?.id ?? null,
        capBaseUnits:
          readiness?.authorizationAmountBaseUnits ??
          readiness?.contractAuthorizationAmountBaseUnits ??
          authorization?.capBaseUnits.toString() ??
          null,
        displayName: member?.displayName ?? "A member",
        expiresAt: readiness?.authorizationExpiresAt ?? authorization?.expiresAt.toISOString() ?? null,
        memberId,
        owedBaseUnits: owed.toString(),
        revokedAt:
          readiness?.revoked || authorization?.revokedAt
            ? authorization?.revokedAt?.toISOString() ?? new Date().toISOString()
            : null,
        status,
        walletAddress: member?.walletAddress ?? null,
      });

      if (status === "missing") {
        blockers.push(
          previewBlocker({
            id: `authorization-${memberId}`,
            kind: "missing_authorization",
            memberId,
            message: `${member?.displayName ?? "A member"} still needs to approve their share.`,
            severity: "warning",
          }),
        );
      } else if (status === "revoked") {
        blockers.push(
          previewBlocker({
            id: `authorization-revoked-${memberId}`,
            kind: "revoked_authorization",
            memberId,
            message: `${member?.displayName ?? "A member"} needs to authorize again before settlement can continue.`,
            severity: "warning",
          }),
        );
      } else if (status === "expired") {
        blockers.push(
          previewBlocker({
            id: `authorization-expired-${memberId}`,
            kind: "expired_authorization",
            memberId,
            message: `${member?.displayName ?? "A member"} needs to approve again because their approval expired.`,
            severity: "warning",
          }),
        );
      } else if (status === "insufficient_cap" || status === "stale" || status === "error") {
        blockers.push(
          previewBlocker({
            id: `authorization-insufficient-${memberId}`,
            kind: "insufficient_authorization",
            memberId,
            message:
              status === "error" || status === "stale"
                ? "Refresh status before settlement can continue."
                : `${member?.displayName ?? "A member"} needs approval for their exact share.`,
            severity: "warning",
          }),
        );
      }
    }

    const currentMemberId = access.data.currentMember.id;
    const currentPays = proposal.transfers
      .filter((transfer) => transfer.fromMemberId === currentMemberId)
      .reduce((total, transfer) => total + BigInt(transfer.amountBaseUnits), BigInt(0));
    const currentReceives = proposal.transfers
      .filter((transfer) => transfer.toMemberId === currentMemberId)
      .reduce((total, transfer) => total + BigInt(transfer.amountBaseUnits), BigInt(0));
    const currentAuthorization = authorizationSummaries.find(
      (summary) => summary.memberId === currentMemberId,
    );
    const currentMemberOutcome = {
      amountBaseUnits:
        currentPays > BigInt(0)
          ? currentPays.toString()
          : currentReceives > BigInt(0)
            ? currentReceives.toString()
            : "0",
      capBaseUnits: currentAuthorization?.capBaseUnits ?? null,
      direction:
        currentPays > BigInt(0) ? "pays" : currentReceives > BigInt(0) ? "receives" : "settled",
      expiresAt: currentAuthorization?.expiresAt ?? null,
      memberId: currentMemberId,
    } satisfies SettlementPreviewSnapshot["currentMemberOutcome"];

    let snapshot: SettlementPreviewSnapshot | null = null;
    let thresholdResult: SettlementPreviewThresholdResult | null = null;

    if (proposal.status === "locked" && settlementContractAddress) {
      const snapshotWithoutHash = {
        authorizationSummaries: authorizationSummaries.sort((a, b) =>
          a.memberId.localeCompare(b.memberId),
        ),
        currentMemberOutcome,
        excludedExpenseCount: proposal.excludedExpenseIds.length,
        excludedExpenseIds: proposal.excludedExpenseIds,
        includedExpenseCount: proposal.includedExpenseIds.length,
        includedExpenseIds: proposal.includedExpenseIds,
        netBalances: proposal.netBalances,
        networkChainId: tab.networkChainId,
        networkName: "Arbitrum Sepolia",
        proposalExpiresAt: proposal.expiresAt,
        proposalHash: proposal.proposalHash,
        proposalId: proposal.id,
        proposalStatus: "locked" as const,
        proposalUpdatedAt: proposal.updatedAt,
        settlementContractAddress,
        tabId: tab.id,
        tabTitle: tab.title,
        tokenAddress: TABY_USDC_ADDRESS,
        totalAmountBaseUnits: proposal.totalAmountBaseUnits,
        transfers: proposal.transfers,
      };

      snapshot = {
        ...snapshotWithoutHash,
        snapshotHash: buildSnapshotHash(snapshotWithoutHash),
      };
      thresholdResult = deriveThresholdResult({
        authorizationSummaries,
        currentMemberId,
        totalAmountBaseUnits: proposal.totalAmountBaseUnits,
      });

      if (
        (phase === "countdown" || phase === "final_precheck") &&
        expectedSnapshotHash &&
        expectedSnapshotHash !== snapshot.snapshotHash
      ) {
        blockers.push(
          previewBlocker({
            id: "snapshot-changed",
            kind: "stale_proposal",
            message: "Something changed. Cancel this Final Tab and create a fresh one before settlement.",
          }),
        );
      }
    }

    const dedupedBlockers = blockers.filter(
      (blocker, index, all) => all.findIndex((item) => item.id === blocker.id) === index,
    );
    const hasIssue = dedupedBlockers.length > 0;

    return {
      data: {
        blockers: dedupedBlockers,
        canStartCountdown: Boolean(snapshot) && !hasIssue,
        canStartExecution:
          phase === "final_precheck" && Boolean(snapshot) && !hasIssue,
        countdownSeconds: SETTLEMENT_PREVIEW_COUNTDOWN_SECONDS,
        snapshot,
        thresholdResult,
      },
      ok: true,
    };
  } catch {
    return fail("database_unavailable", 503);
  }
}

type SettlementAction = "prepare" | "record_userop" | "confirm" | "reconcile";

export async function orchestrateSettlement(input: {
  action: unknown;
  attemptId?: unknown;
  didToken: unknown;
  expectedProposalHash?: unknown;
  proposalId: unknown;
  transactionHash?: unknown;
  userOperationHash?: unknown;
}): Promise<TabResult<SettlementExecutionResponse>> {
  const action = parseSettlementAction(input.action);

  if (!action) {
    return fail("validation_failed", 422);
  }

  switch (action) {
    case "prepare":
      return prepareSettlementAttempt(input);
    case "record_userop":
      return recordSettlementUserOperation(input);
    case "confirm":
      return confirmSettlementAttempt(input);
    case "reconcile":
      return reconcileSettlementAttempt(input);
  }
}

async function prepareSettlementAttempt(input: {
  didToken: unknown;
  expectedProposalHash?: unknown;
  proposalId: unknown;
}): Promise<TabResult<SettlementExecutionResponse>> {
  const context = await getSettlementContext(input);

  if (!context.ok) {
    return context;
  }

  const { currentUser, db, payload, proposal, proposalRow, settlementAccount } = context.data;
  const expected = expectedSettlementValues(proposal, payload);
  const blockers = await buildFinalSettlementBlockers(context.data, input.expectedProposalHash);
  const activeAttempt = await latestSettlementAttempt(proposal.id);
  const unresolvedAttempt =
    activeAttempt &&
    ["submitted", "userop_submitted", "included", "unknown"].includes(activeAttempt.status)
      ? activeAttempt
      : null;

  if (unresolvedAttempt) {
    return {
      data: settlementExecutionResponse({
        ...expected,
        attempt: unresolvedAttempt,
        blockers: [
          settlementBlocker({
            id: "pending-attempt",
            kind: "unknown",
            message: "Settlement is already confirming. Refresh status.",
            severity: "warning",
          }),
        ],
        state: "confirming",
      }),
      ok: true,
    };
  }

  if (blockers.some((blocker) => blocker.kind === "already_settled")) {
    if (activeAttempt?.txHash || activeAttempt?.userOperationHash) {
      return finalizeSettlementAttempt(
        {
          attemptId: activeAttempt.id,
          didToken: input.didToken,
          proposalId: input.proposalId,
        },
        "reconcile",
      );
    }

    return {
      data: settlementExecutionResponse({
        ...expected,
        blockers,
        state: "terminal_failed",
      }),
      ok: true,
    };
  }

  if (blockers.length > 0) {
    return {
      data: settlementExecutionResponse({
        ...expected,
        blockers,
        state: terminalBlockersOnly(blockers) ? "terminal_failed" : "idle",
      }),
      ok: true,
    };
  }

  if (!settlementAccount) {
    return {
      data: settlementExecutionResponse({
        ...expected,
        blockers: [
          settlementBlocker({
            id: "account-not-ready",
            kind: "account_unavailable",
            message: "Preparing secure settlement. You will not need gas to continue.",
          }),
        ],
        state: "idle",
      }),
      ok: true,
    };
  }

  if (!isSettlementAccountReady(settlementAccount)) {
    return {
      data: settlementExecutionResponse({
        ...expected,
        blockers: [
          settlementBlocker({
            id: "account-not-ready",
            kind: "account_unavailable",
            message: "Preparing secure settlement. You will not need gas to continue.",
          }),
        ],
        state: "idle",
      }),
      ok: true,
    };
  }

  const createdAttempt =
    activeAttempt?.status === "created" && activeAttempt.submittedByUserId === currentUser.user.id
      ? activeAttempt
      : await createSettlementAttempt({
          db,
          proposalRow,
          settlementAccountId: settlementAccount.id,
          submittedByUserId: currentUser.user.id,
        });
  const settlementContractAddress = normalizeEvmAddress(proposal.settlementContractAddress);

  if (!settlementContractAddress) {
    return fail("configuration_missing", 503);
  }

  return {
    data: settlementExecutionResponse({
      ...expected,
      attempt: createdAttempt,
      calls: [
        encodeSettleFinalTabCall({
          payload,
          settlementContractAddress: settlementContractAddress as Address,
        }),
      ],
      state: "ready",
    }),
    ok: true,
  };
}

async function recordSettlementUserOperation(input: {
  attemptId?: unknown;
  didToken: unknown;
  proposalId: unknown;
  userOperationHash?: unknown;
}): Promise<TabResult<SettlementExecutionResponse>> {
  const context = await getSettlementContext(input);

  if (!context.ok) {
    return context;
  }

  if (!isUuid(input.attemptId)) {
    return fail("validation_failed", 422);
  }

  const userOperationHash = normalizeOperationHash(input.userOperationHash);

  if (!userOperationHash) {
    return fail("validation_failed", 422);
  }

  const { currentUser, db, proposal, settlementAccount } = context.data;
  const expected = expectedSettlementValues(proposal, context.data.payload);
  const [attempt] = await db
    .select()
    .from(settlementTransactions)
    .where(
      and(
        eq(settlementTransactions.id, input.attemptId),
        eq(settlementTransactions.proposalId, proposal.id),
        eq(settlementTransactions.submittedByUserId, currentUser.user.id),
      ),
    )
    .limit(1);

  if (!attempt || !["created", "unknown"].includes(attempt.status)) {
    return fail("validation_failed", 422, ["Settlement is already confirming. Refresh status."]);
  }

  const [updatedAttempt] = await db
    .update(settlementTransactions)
    .set({
      settlementAccountId: settlementAccount?.id ?? attempt.settlementAccountId,
      status: "userop_submitted",
      updatedAt: new Date(),
      userOperationHash,
    })
    .where(eq(settlementTransactions.id, attempt.id))
    .returning();

  await db
    .insert(userOperationRecords)
    .values({
      purpose: "final_tab_settlement",
      settlementAccountId: settlementAccount?.id ?? attempt.settlementAccountId,
      status: "submitted",
      userId: currentUser.user.id,
      userOperationHash,
    })
    .onConflictDoUpdate({
      set: {
        purpose: "final_tab_settlement",
        settlementAccountId: settlementAccount?.id ?? attempt.settlementAccountId,
        status: "submitted",
        updatedAt: new Date(),
      },
      target: userOperationRecords.userOperationHash,
    });

  await db.insert(activityEvents).values({
    actorUserId: currentUser.user.id,
    eventData: {
      attemptId: attempt.id,
      proposalId: proposal.id,
    },
    eventType: "settlement_submitted",
    tabId: proposal.tabId,
  });

  return {
    data: settlementExecutionResponse({
      ...expected,
      attempt: updatedAttempt,
      state: "confirming",
    }),
    ok: true,
  };
}

async function confirmSettlementAttempt(input: {
  attemptId?: unknown;
  didToken: unknown;
  proposalId: unknown;
  transactionHash?: unknown;
  userOperationHash?: unknown;
}): Promise<TabResult<SettlementExecutionResponse>> {
  return finalizeSettlementAttempt(input, "confirm");
}

async function reconcileSettlementAttempt(input: {
  attemptId?: unknown;
  didToken: unknown;
  proposalId: unknown;
}): Promise<TabResult<SettlementExecutionResponse>> {
  return finalizeSettlementAttempt(input, "reconcile");
}

async function finalizeSettlementAttempt(
  input: {
    attemptId?: unknown;
    didToken: unknown;
    proposalId: unknown;
    transactionHash?: unknown;
    userOperationHash?: unknown;
  },
  mode: "confirm" | "reconcile",
): Promise<TabResult<SettlementExecutionResponse>> {
  const context = await getSettlementContext(input, { allowExecuted: true });

  if (!context.ok) {
    return context;
  }

  const { currentUser, db, payload, proposal, proposalRow } = context.data;
  const expected = expectedSettlementValues(proposal, payload);
  const attempt = isUuid(input.attemptId)
    ? await settlementAttemptById(input.attemptId, proposal.id)
    : await latestSettlementAttempt(proposal.id);

  if (!attempt) {
    return {
      data: settlementExecutionResponse({
        ...expected,
        state: "idle",
      }),
      ok: true,
    };
  }

  let transactionHash =
    typeof input.transactionHash === "string" && isEvmTxHash(input.transactionHash)
      ? input.transactionHash.toLowerCase()
      : attempt.txHash;
  const userOperationHash = normalizeOperationHash(input.userOperationHash) ?? attempt.userOperationHash;

  if (!transactionHash && userOperationHash) {
    const operationReceipt = await resolveSettlementUserOperationReceipt(userOperationHash);

    if (operationReceipt?.transactionHash) {
      transactionHash = operationReceipt.transactionHash;
    } else if (mode === "reconcile") {
      const [updatedAttempt] = await db
        .update(settlementTransactions)
        .set({
          status: "unknown",
          updatedAt: new Date(),
          userOperationHash,
        })
        .where(eq(settlementTransactions.id, attempt.id))
        .returning();

      return {
        data: settlementExecutionResponse({
          ...expected,
          attempt: updatedAttempt,
          state: "unknown",
        }),
        ok: true,
      };
    }
  }

  if (!transactionHash) {
    return {
      data: settlementExecutionResponse({
        ...expected,
        attempt,
        state: "confirming",
      }),
      ok: true,
    };
  }

  const verified = await verifySettlementReceipt({
    payload,
    proposal,
    settlementAccountAddress: context.data.settlementAccount?.settlementAddress ?? null,
    transactionHash: transactionHash as Hex,
  });

  if (!verified.ok) {
    const retryBlockers =
      verified.code === "transaction_reverted"
        ? await buildFinalSettlementBlockers(context.data, proposal.proposalHash)
        : [];
    const canRetry = verified.code === "transaction_reverted" && retryBlockers.length === 0;
    const recoveryBlockers =
      verified.code === "transaction_reverted" && retryBlockers.length > 0
        ? retryBlockers
        : [
            settlementBlocker({
              id: verified.code,
              kind: verified.code === "transaction_reverted" ? "unknown" : "stale_proposal",
              message: verified.message,
            }),
          ];
    const [updatedAttempt] = await db
      .update(settlementTransactions)
      .set({
        errorMessage: verified.message,
        failureCode: verified.code,
        status: verified.code === "transaction_reverted" ? "reverted" : "unknown",
        txHash: transactionHash,
        updatedAt: new Date(),
        userOperationHash,
      })
      .where(eq(settlementTransactions.id, attempt.id))
      .returning();

    await db.insert(activityEvents).values({
      actorUserId: currentUser.user.id,
      eventData: {
        attemptId: attempt.id,
        failureCode: verified.code,
        proposalId: proposal.id,
        txHash: transactionHash,
      },
      eventType: "settlement_failed",
      tabId: proposal.tabId,
    });

    return {
      data: settlementExecutionResponse({
        ...expected,
        attempt: updatedAttempt,
        blockers: recoveryBlockers,
        state: canRetry
          ? "retryable_failed"
          : verified.code === "transaction_reverted" && terminalBlockersOnly(recoveryBlockers)
            ? "terminal_failed"
            : "unknown",
      }),
      ok: true,
    };
  }

  const finalized = await db.transaction(async (tx) => {
    const now = new Date();
    const [updatedAttempt] = await tx
      .update(settlementTransactions)
      .set({
        blockNumber: verified.event.blockNumber,
        confirmedBlockNumber: verified.event.confirmedBlockNumber,
        errorMessage: null,
        eventLogIndex: verified.event.logIndex,
        eventName: "FinalTabSettled",
        eventProposalHash: verified.event.proposalHash,
        eventTabKey: verified.event.tabKey,
        eventTotalAmountBaseUnits: verified.event.totalAmount,
        eventTransferCount: verified.event.transferCount,
        eventTransfersHash: verified.event.transfersHash,
        failureCode: null,
        status: "confirmed",
        txHash: transactionHash,
        updatedAt: now,
        userOperationHash,
      })
      .where(eq(settlementTransactions.id, attempt.id))
      .returning();

    await tx
      .update(settlementProposals)
      .set({ executedAt: now, status: "executed", updatedAt: now })
      .where(eq(settlementProposals.id, proposalRow.id));

    if (proposal.includedExpenseIds.length > 0) {
      await tx
        .update(expenses)
        .set({ status: "settled", updatedAt: now })
        .where(inArray(expenses.id, proposal.includedExpenseIds));
    }

    await tx
      .update(tabs)
      .set({ settledAt: now, status: "settled", updatedAt: now })
      .where(eq(tabs.id, proposal.tabId));

    await tx
      .update(tabMembers)
      .set({ readinessStatus: "settled", updatedAt: now })
      .where(eq(tabMembers.tabId, proposal.tabId));

    if (userOperationHash) {
      await tx
        .insert(userOperationRecords)
        .values({
          confirmedAt: now,
          purpose: "final_tab_settlement",
          settlementAccountId: attempt.settlementAccountId,
          status: "confirmed",
          transactionHash,
          userId: currentUser.user.id,
          userOperationHash,
        })
        .onConflictDoUpdate({
          set: {
            confirmedAt: now,
            purpose: "final_tab_settlement",
            status: "confirmed",
            transactionHash,
            updatedAt: now,
          },
          target: userOperationRecords.userOperationHash,
        });
    }

    const [activity] = await tx
      .insert(activityEvents)
      .values({
        actorUserId: currentUser.user.id,
        eventData: {
          attemptId: attempt.id,
          proposalHash: proposal.proposalHash,
          proposalId: proposal.id,
          txHash: transactionHash,
        },
        eventType: mode === "reconcile" ? "settlement_reconciled" : "settlement_completed",
        tabId: proposal.tabId,
      })
      .returning();

    return { activity, updatedAttempt };
  });

  return {
    data: settlementExecutionResponse({
      ...expected,
      attempt: finalized.updatedAttempt,
      state: "settled",
    }),
    ok: true,
  };
}

async function getSettlementContext(
  input: { didToken: unknown; proposalId: unknown },
  options: { allowExecuted?: boolean } = {},
): Promise<
  TabResult<{
    access: AccessContext;
    currentUser: CurrentUser;
    db: ReturnType<typeof getDb>;
    payload: FinalTabPayload;
    proposal: SettlementProposalResponse;
    proposalRow: SettlementProposal;
    settlementAccount: UserSettlementAccount | null;
  }>
> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.proposalId)) {
    return fail("validation_failed", 422);
  }

  const db = getDb();
  const [proposalRow] = await db
    .select()
    .from(settlementProposals)
    .where(eq(settlementProposals.id, input.proposalId));

  if (!proposalRow) {
    return fail("not_found", 404);
  }

  const access = await getAccessContext(proposalRow.tabId, currentUser.data.user.id);

  if (!access.ok) {
    return access;
  }

  if (!access.data.isOwner) {
    return fail("unauthorized", 403, ["Only the organizer can settle this Final Tab."]);
  }

  if (
    proposalRow.status !== "locked" &&
    !(options.allowExecuted && proposalRow.status === "executed")
  ) {
    return fail("invalid_transition", 409, ["Lock the Final Tab before settling together."]);
  }

  const proposal = proposalDto(proposalRow);
  const payload = parseFinalTabPayload(proposalRow.canonicalPayloadJson);

  if (!payload) {
    return fail("stale_record", 409, ["Something changed. Create a fresh Final Tab before settling."]);
  }

  const config = getZeroDevAccountConfig();
  const [settlementAccount] = await db
    .select()
    .from(userSettlementAccounts)
    .where(
      and(
        eq(userSettlementAccounts.userId, currentUser.data.user.id),
        eq(userSettlementAccounts.configHash, config.configHash),
      ),
    )
    .limit(1);

  return {
    data: {
      access: access.data,
      currentUser: currentUser.data,
      db,
      payload,
      proposal,
      proposalRow,
      settlementAccount: settlementAccount ?? null,
    },
    ok: true,
  };
}

async function buildFinalSettlementBlockers(
  context: {
    access: AccessContext;
    payload: FinalTabPayload;
    proposal: SettlementProposalResponse;
    proposalRow: SettlementProposal;
    settlementAccount: UserSettlementAccount | null;
  },
  expectedProposalHash: unknown,
) {
  const { access, payload, proposal, proposalRow, settlementAccount } = context;
  const blockers: SettlementBlocker[] = [];
  const settlementContractAddress = normalizeEvmAddress(getSettlementContractAddress());
  const proposalSettlementContract = normalizeEvmAddress(proposal.settlementContractAddress);
  const proposalHash = normalizeHex32(proposal.proposalHash);
  const tabKey = normalizeHex32(proposal.tabKey);
  const tokenAddress = normalizeEvmAddress(proposal.tokenAddress);
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

  if (typeof expectedProposalHash === "string" && expectedProposalHash !== proposal.proposalHash) {
    blockers.push(
      settlementBlocker({
        id: "expected-proposal-hash",
        kind: "stale_proposal",
        message: "Something changed. Create a fresh Final Tab before settling.",
      }),
    );
  }

  try {
    if (hashFinalTabPayload(payload).toLowerCase() !== proposal.proposalHash.toLowerCase()) {
      blockers.push(
        settlementBlocker({
          id: "canonical-hash",
          kind: "stale_proposal",
          message: "Something changed. Create a fresh Final Tab before settling.",
        }),
      );
    }
  } catch {
    blockers.push(
      settlementBlocker({
        id: "canonical-payload",
        kind: "stale_proposal",
        message: "Something changed. Create a fresh Final Tab before settling.",
      }),
    );
  }

  if (proposalRow.expiresAt.getTime() <= Date.now() || BigInt(payload.expiresAt) <= nowSeconds) {
    blockers.push(
      settlementBlocker({
        id: "proposal-expired",
        kind: "expired_proposal",
        message: "This Final Tab expired. Create a fresh one before settling.",
      }),
    );
  }

  if (!settlementContractAddress || !proposalSettlementContract || !proposalHash || !tabKey || !tokenAddress) {
    blockers.push(
      settlementBlocker({
        id: "configuration",
        kind: "configuration_missing",
        message: "Settlement is not configured yet.",
      }),
    );
  } else if (settlementContractAddress !== proposalSettlementContract) {
    blockers.push(
      settlementBlocker({
        id: "contract-mismatch",
        kind: "stale_proposal",
        message: "Something changed. Create a fresh Final Tab before settling.",
      }),
    );
  }

  if (proposal.chainId !== TABY_CHAIN_ID || access.tab.networkChainId !== TABY_CHAIN_ID) {
    blockers.push(
      settlementBlocker({
        id: "chain-mismatch",
        kind: "configuration_missing",
        message: "Settlement is configured for Arbitrum Sepolia.",
      }),
    );
  }

  if (tokenAddress !== TABY_USDC_ADDRESS.toLowerCase()) {
    blockers.push(
      settlementBlocker({
        id: "token-mismatch",
        kind: "configuration_missing",
        message: "Settlement is configured for USDC only.",
      }),
    );
  }

  if (proposal.transfers.length === 0 || BigInt(proposal.totalAmountBaseUnits) === BigInt(0)) {
    blockers.push(
      settlementBlocker({
        id: "zero-transfers",
        kind: "unknown",
        message: "Everyone is even, so there is nothing to settle.",
        severity: "info",
      }),
    );
  }

  if (
    settlementAccount &&
    settlementAccount.settlementAddress.toLowerCase() !==
      proposal.coordinatorWalletAddress.toLowerCase()
  ) {
    blockers.push(
      settlementBlocker({
        id: "settlement-account-mismatch",
        kind: "account_unavailable",
        message: "This Final Tab is linked to a different settlement wallet.",
      }),
    );
  }

  if (!proposalHash || !tabKey || !proposalSettlementContract || !tokenAddress) {
    return blockers;
  }

  try {
    const [activeFinalTab, cancelled, settled] = await Promise.all([
      readActiveFinalTab({
        settlementContractAddress: proposalSettlementContract as Address,
        tabKey,
      }),
      isProposalCancelled({
        proposalHash,
        settlementContractAddress: proposalSettlementContract as Address,
      }),
      isProposalSettled({
        proposalHash,
        settlementContractAddress: proposalSettlementContract as Address,
      }),
    ]);

    if (cancelled) {
      blockers.push(
        settlementBlocker({
          id: "proposal-cancelled",
          kind: "cancelled_proposal",
          message: "Something changed. Create a fresh Final Tab before settling.",
        }),
      );
    }

    if (settled) {
      blockers.push(
        settlementBlocker({
          id: "proposal-settled",
          kind: "already_settled",
          message: "This Final Tab was already settled. We are updating the tab.",
          severity: "info",
        }),
      );
    }

    if (
      !settled &&
      (activeFinalTab.proposalHash.toLowerCase() !== proposalHash.toLowerCase() ||
        activeFinalTab.totalSettlementAmount !== BigInt(proposal.totalAmountBaseUnits))
    ) {
      blockers.push(
        settlementBlocker({
          id: "active-proposal-mismatch",
          kind: "stale_proposal",
          message: "Something changed onchain. Refresh before settling.",
        }),
      );
    }
  } catch {
    blockers.push(
      settlementBlocker({
        id: "chain-unavailable",
        kind: "chain_unavailable",
        message: "We could not check Arbitrum right now. Refresh status.",
      }),
    );
    return blockers;
  }

  const rawMembers = await getDb()
    .select()
    .from(tabMembers)
    .where(eq(tabMembers.tabId, proposal.tabId));
  const members = await withReadySettlementWallets(getDb(), rawMembers);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const debtorAmounts = new Map<string, bigint>();

  for (const transfer of proposal.transfers) {
    debtorAmounts.set(
      transfer.fromMemberId,
      (debtorAmounts.get(transfer.fromMemberId) ?? BigInt(0)) +
        BigInt(transfer.amountBaseUnits),
    );

    const debtor = memberById.get(transfer.fromMemberId);
    const creditor = memberById.get(transfer.toMemberId);

    if (!debtor?.walletAddress || !creditor?.walletAddress) {
      blockers.push(
        settlementBlocker({
          displayName: debtor?.displayName ?? creditor?.displayName ?? "A member",
          id: `wallet-${transfer.id}`,
          kind: "missing_wallet",
          memberId: debtor?.id ?? creditor?.id ?? null,
          message: `${debtor?.displayName ?? creditor?.displayName ?? "A member"} needs a wallet before settlement can continue.`,
        }),
      );
    }
  }

  const debtorBlockerGroups = await Promise.all(Array.from(debtorAmounts, async ([memberId, owed]) => {
    const member = memberById.get(memberId);
    const walletAddress = normalizeEvmAddress(member?.walletAddress);
    const displayName = member?.displayName ?? "A member";
    const debtorBlockers: SettlementBlocker[] = [];

    if (!walletAddress) {
      return debtorBlockers;
    }

    try {
      const [contractAuthorization, allowance, balance] = await Promise.all([
        readFinalTabAuthorization({
          debtor: walletAddress as Address,
          proposalHash,
          settlementContractAddress: proposalSettlementContract as Address,
        }),
        readUsdcAllowance({
          owner: walletAddress as Address,
          spender: proposalSettlementContract as Address,
          tokenAddress: tokenAddress as Address,
        }),
        readUsdcBalance({
          owner: walletAddress as Address,
          tokenAddress: tokenAddress as Address,
        }),
      ]);
      const authorizationMatchesProposal =
        contractAuthorization.proposalHash.toLowerCase() === proposalHash.toLowerCase() &&
        isAddressEqual(contractAuthorization.debtor, walletAddress as Address) &&
        contractAuthorization.amount === owed &&
        contractAuthorization.expiresAt <= BigInt(payload.expiresAt);

      if (!authorizationMatchesProposal) {
        debtorBlockers.push(
          settlementBlocker({
            amountBaseUnits: owed,
            displayName,
            id: `authorization-missing-${memberId}`,
            kind: "missing_authorization",
            memberId,
            message: `${displayName} still needs to approve ${formatUsdcAmount(owed)} USDC.`,
          }),
        );
      } else if (contractAuthorization.revoked) {
        debtorBlockers.push(
          settlementBlocker({
            amountBaseUnits: owed,
            displayName,
            id: `authorization-revoked-${memberId}`,
            kind: "revoked_authorization",
            memberId,
            message: `${displayName} revoked approval and needs to approve again.`,
          }),
        );
      } else if (contractAuthorization.expiresAt <= nowSeconds) {
        debtorBlockers.push(
          settlementBlocker({
            amountBaseUnits: owed,
            displayName,
            id: `authorization-expired-${memberId}`,
            kind: "expired_authorization",
            memberId,
            message: `${displayName}'s approval expired.`,
          }),
        );
      }

      if (allowance !== owed) {
        debtorBlockers.push(
          settlementBlocker({
            amountBaseUnits: owed,
            displayName,
            id: `allowance-${memberId}`,
            kind: "insufficient_allowance",
            memberId,
            message: `${displayName} still needs to approve ${formatUsdcAmount(owed)} USDC.`,
          }),
        );
      }

      if (balance < owed) {
        debtorBlockers.push(
          settlementBlocker({
            amountBaseUnits: owed - balance,
            displayName,
            id: `balance-${memberId}`,
            kind: "insufficient_balance",
            memberId,
            message: `${displayName} needs ${formatUsdcAmount(owed - balance)} USDC at ${shortAddress(walletAddress)} before settlement can finish.`,
          }),
        );
      }
    } catch {
      debtorBlockers.push(
        settlementBlocker({
          displayName,
          id: `chain-check-${memberId}`,
          kind: "chain_unavailable",
          memberId,
          message: "We could not check Arbitrum right now. Refresh status.",
        }),
      );
    }

    return debtorBlockers;
  }));

  blockers.push(...debtorBlockerGroups.flat());

  return blockers.filter(
    (blocker, index, all) => all.findIndex((item) => item.id === blocker.id) === index,
  );
}

async function createSettlementAttempt(input: {
  db: ReturnType<typeof getDb>;
  proposalRow: SettlementProposal;
  settlementAccountId: string | null;
  submittedByUserId: string;
}) {
  const [{ attemptNumber }] = await input.db
    .select({
      attemptNumber: sql<number>`coalesce(max(${settlementTransactions.attemptNumber}), 0) + 1`,
    })
    .from(settlementTransactions)
    .where(eq(settlementTransactions.proposalId, input.proposalRow.id));
  const idempotencyKey = createHash("sha256")
    .update(`${input.proposalRow.proposalHash}:${attemptNumber}`)
    .digest("hex");
  try {
    const [attempt] = await input.db
      .insert(settlementTransactions)
      .values({
        attemptNumber,
        chainId: TABY_CHAIN_ID,
        idempotencyKey,
        proposalId: input.proposalRow.id,
        settlementAccountId: input.settlementAccountId,
        settlementContractAddress: input.proposalRow.settlementContractAddress.toLowerCase(),
        status: "created",
        submittedByUserId: input.submittedByUserId,
        tabId: input.proposalRow.tabId,
        tokenAddress: input.proposalRow.tokenAddress.toLowerCase(),
      })
      .returning();

    return attempt;
  } catch {
    const latestAttempt = await latestSettlementAttempt(input.proposalRow.id);

    if (latestAttempt) {
      return latestAttempt;
    }

    throw new Error("settlement_attempt_create_failed");
  }
}

async function latestSettlementAttempt(proposalId: string) {
  const [attempt] = await getDb()
    .select()
    .from(settlementTransactions)
    .where(eq(settlementTransactions.proposalId, proposalId))
    .orderBy(desc(settlementTransactions.attemptNumber))
    .limit(1);

  return attempt ?? null;
}

async function settlementAttemptById(attemptId: string, proposalId: string) {
  const [attempt] = await getDb()
    .select()
    .from(settlementTransactions)
    .where(
      and(
        eq(settlementTransactions.id, attemptId),
        eq(settlementTransactions.proposalId, proposalId),
      ),
    )
    .limit(1);

  return attempt ?? null;
}

async function verifySettlementReceipt(input: {
  payload: FinalTabPayload;
  proposal: SettlementProposalResponse;
  settlementAccountAddress: string | null;
  transactionHash: Hex;
}): Promise<
  | {
      event: {
        blockNumber: bigint;
        confirmedBlockNumber: bigint;
        logIndex: number;
        proposalHash: Hex;
        tabKey: Hex;
        totalAmount: bigint;
        transferCount: number;
        transfersHash: Hex;
      };
      ok: true;
    }
  | { code: string; message: string; ok: false }
> {
  let receipt: Awaited<ReturnType<ReturnType<typeof getSettlementPublicClient>["getTransactionReceipt"]>>;

  try {
    receipt = await getSettlementPublicClient().getTransactionReceipt({
      hash: input.transactionHash,
    });
  } catch {
    return {
      code: "receipt_unavailable",
      message: "Settlement is confirming. Refresh status.",
      ok: false,
    };
  }

  if (receipt.status !== "success") {
    return {
      code: "transaction_reverted",
      message: "Settlement did not go through. Nothing moved.",
      ok: false,
    };
  }

  const confirmationThreshold = getSettlementConfirmationThreshold();
  let currentBlock: bigint;

  try {
    currentBlock = await getSettlementPublicClient().getBlockNumber();
  } catch {
    return {
      code: "receipt_unavailable",
      message: "Settlement is confirming. Refresh status.",
      ok: false,
    };
  }

  if (currentBlock - receipt.blockNumber + BigInt(1) < confirmationThreshold) {
    return {
      code: "receipt_unavailable",
      message: "Settlement is confirming. Refresh status.",
      ok: false,
    };
  }

  const expectedContract = input.proposal.settlementContractAddress.toLowerCase();
  const expectedProposalHash = input.proposal.proposalHash.toLowerCase();
  const expectedTabKey = input.proposal.tabKey.toLowerCase();
  const expectedToken = input.proposal.tokenAddress.toLowerCase();
  const expectedTransfersHash = input.proposal.transfersHash.toLowerCase();
  const expectedTotal = BigInt(input.proposal.totalAmountBaseUnits);
  const expectedCount = input.payload.transfers.length;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== expectedContract) {
      continue;
    }

    try {
      const decoded = decodeEventLog({
        abi: tabySettlementAbi,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName !== "FinalTabSettled") {
        continue;
      }

      const args = decoded.args;
      const executor = args.executor.toLowerCase();
      const executorMatches =
        !input.settlementAccountAddress ||
        executor === input.settlementAccountAddress.toLowerCase() ||
        executor === input.proposal.coordinatorWalletAddress.toLowerCase();

      if (
        args.proposalHash.toLowerCase() !== expectedProposalHash ||
        args.tabKey.toLowerCase() !== expectedTabKey ||
        args.token.toLowerCase() !== expectedToken ||
        args.totalAmount !== expectedTotal ||
        Number(args.transferCount) !== expectedCount ||
        args.transfersHash.toLowerCase() !== expectedTransfersHash ||
        !executorMatches
      ) {
        return {
          code: "event_mismatch",
          message: "We could not verify this settlement. Refresh status before trying again.",
          ok: false,
        };
      }

      return {
        event: {
          blockNumber: receipt.blockNumber,
          confirmedBlockNumber: currentBlock,
          logIndex: log.logIndex,
          proposalHash: args.proposalHash,
          tabKey: args.tabKey,
          totalAmount: args.totalAmount,
          transferCount: Number(args.transferCount),
          transfersHash: args.transfersHash,
        },
        ok: true,
      };
    } catch {
      continue;
    }
  }

  return {
    code: "event_missing",
    message: "We could not verify this settlement. Refresh status before trying again.",
    ok: false,
  };
}

async function resolveSettlementUserOperationReceipt(userOperationHash: string) {
  const zeroDevRpcUrl = getServerZeroDevRpcUrl();

  if (!zeroDevRpcUrl) {
    return null;
  }

  try {
    const response = await fetch(zeroDevRpcUrl, {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "eth_getUserOperationReceipt",
        params: [userOperationHash],
      }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    const payload = (await response.json()) as unknown;

    if (payload && typeof payload === "object" && "result" in payload) {
      const result = payload.result;

      if (!result || typeof result !== "object") {
        return null;
      }

      const receipt = "receipt" in result ? result.receipt : null;

      if (
        receipt &&
        typeof receipt === "object" &&
        "transactionHash" in receipt &&
        typeof receipt.transactionHash === "string"
      ) {
        return { transactionHash: receipt.transactionHash.toLowerCase() };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function parseSettlementAction(value: unknown): SettlementAction | null {
  return value === "prepare" ||
    value === "record_userop" ||
    value === "confirm" ||
    value === "reconcile"
    ? value
    : null;
}

function parseFinalTabPayload(value: unknown): FinalTabPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as FinalTabPayload;

  return typeof payload.proposalVersion === "number" &&
    typeof payload.chainId === "number" &&
    typeof payload.totalSettlementAmountBaseUnits === "string" &&
    Array.isArray(payload.transfers)
    ? payload
    : null;
}

function expectedSettlementValues(
  proposal: SettlementProposalResponse,
  payload: FinalTabPayload,
) {
  return {
    expectedTotalAmountBaseUnits: proposal.totalAmountBaseUnits,
    expectedTransferCount: payload.transfers.length,
    expectedTransfersHash: proposal.transfersHash,
    proposalHash: proposal.proposalHash,
    settlementContractAddress: proposal.settlementContractAddress,
    tokenAddress: proposal.tokenAddress,
    chainId: proposal.chainId,
  };
}

function terminalBlockersOnly(blockers: SettlementBlocker[]) {
  return blockers.some((blocker) =>
    ["cancelled_proposal", "expired_proposal", "stale_proposal"].includes(blocker.kind),
  );
}

function isSettlementAccountReady(account: UserSettlementAccount) {
  return (
    account.chainId === TABY_CHAIN_ID &&
    account.delegationStatus === "ready" &&
    account.paymasterPolicyStatus === "available"
  );
}

function formatUsdcAmount(amountBaseUnits: bigint) {
  const sign = amountBaseUnits < BigInt(0) ? "-" : "";
  const absolute = amountBaseUnits < BigInt(0) ? -amountBaseUnits : amountBaseUnits;
  const whole = absolute / BigInt(1_000_000);
  const fraction = (absolute % BigInt(1_000_000)).toString().padStart(6, "0").slice(0, 2);

  return `${sign}${whole.toString()}.${fraction}`;
}

function shortAddress(address: string) {
  return address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

export async function recordSettlementTransaction(input: {
  blockNumber?: unknown;
  didToken: unknown;
  errorMessage?: unknown;
  proposalId: unknown;
  status: unknown;
  txHash: unknown;
}) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  return fail("invalid_transition", 410, [
    "Refresh status from the settlement review before trying again.",
  ]);
}
