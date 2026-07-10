import { createHash } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { Magic } from "@magic-sdk/admin";
import { normalizeEmail } from "@/lib/account/validation";
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
  users,
  type ActivityEvent,
  type Expense,
  type ExpenseConfirmation,
  type ExpenseSplit,
  type Tab,
  type TabAuthorization,
  type TabMember,
  type User,
} from "@/lib/db/schema";
import { proposalDto } from "@/lib/tabs/proposals";
import { buildFinalTab } from "@/lib/tabs/finalTab";
import {
  calculateSettlement,
  createSettlementInputsFromTabDetail,
} from "@/lib/tabs/settlement";
import {
  isEvmAddress,
  isEvmTxHash,
  isUuid,
  normalizeEvmAddress,
  normalizeText,
  parseBaseUnits,
  parseFutureDate,
  parseNonNegativeBaseUnits,
  parseOptionalPositiveInteger,
} from "@/lib/tabs/validation";
import type {
  ActivityEventResponse,
  ExpenseConfirmationResponse,
  ExpenseResponse,
  ExpenseSplitResponse,
  SettlementProposalMutationResponse,
  SettlementPreviewAuthorizationSummary,
  SettlementPreviewBlocker,
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
  TransactionStatus,
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
    authorizationMethod: authorization.authorizationMethod,
    capBaseUnits: authorization.capBaseUnits.toString(),
    createdAt: toIso(authorization.createdAt),
    expiresAt: toIso(authorization.expiresAt),
    id: authorization.id,
    maxSingleSettlementBaseUnits: authorization.maxSingleSettlementBaseUnits.toString(),
    memberId: authorization.memberId,
    revokedAt: authorization.revokedAt ? toIso(authorization.revokedAt) : null,
    sessionKeyRef: authorization.sessionKeyRef,
    settlementContractAddress: authorization.settlementContractAddress,
    tabId: authorization.tabId,
    tokenAddress: authorization.tokenAddress,
    updatedAt: toIso(authorization.updatedAt),
    walletAddress: authorization.walletAddress,
  };
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

function latestAuthorizationForMember(
  authorizations: TabAuthorization[],
  memberId: string,
  tokenAddress: string,
  settlementContractAddress: string,
) {
  return authorizations
    .filter(
      (authorization) =>
        authorization.memberId === memberId &&
        authorization.tokenAddress.toLowerCase() === tokenAddress.toLowerCase() &&
        authorization.settlementContractAddress.toLowerCase() ===
          settlementContractAddress.toLowerCase(),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
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
              inArray(settlementProposals.status, ["open", "locked"]),
            ),
          )
          .orderBy(desc(settlementProposals.createdAt))
          .limit(1),
        db.select().from(tabAuthorizations).where(eq(tabAuthorizations.tabId, tabId)),
        db
          .select()
          .from(activityEvents)
          .where(eq(activityEvents.tabId, tabId))
          .orderBy(desc(activityEvents.createdAt))
          .limit(20),
      ]);

    return {
      data: {
        activity:
          access.data.currentMember?.joinStatus === "invited" && !access.data.isOwner
            ? []
            : events.map(activityDto),
        authorizations:
          access.data.currentMember?.joinStatus === "invited" && !access.data.isOwner
            ? []
            : authorizationRows.map(authorizationDto),
        confirmations:
          access.data.currentMember?.joinStatus === "invited" && !access.data.isOwner
            ? []
            : confirmationRows.map((row) => confirmationDto(row.expense_confirmations)),
        expenses:
          access.data.currentMember?.joinStatus === "invited" && !access.data.isOwner
            ? []
            : expenseRows.map(expenseDto),
        latestProposal:
          access.data.currentMember?.joinStatus === "invited" && !access.data.isOwner
            ? null
            : latestProposalRows[0]
              ? proposalDto(latestProposalRows[0])
              : null,
        members: members.map(memberDto),
        splits:
          access.data.currentMember?.joinStatus === "invited" && !access.data.isOwner
            ? []
            : splitRows.map((row) => splitDto(row.expense_splits)),
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
  allowanceTxHash?: unknown;
  authorizationMethod?: unknown;
  capBaseUnits: unknown;
  didToken: unknown;
  expiresAt: unknown;
  maxSingleSettlementBaseUnits: unknown;
  memberId: unknown;
  settlementContractAddress?: unknown;
  sessionKeyRef?: unknown;
  tabId: unknown;
  tokenAddress: unknown;
  walletAddress: unknown;
}) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.tabId) || !isUuid(input.memberId)) {
    return fail("validation_failed", 422);
  }

  const tabId = input.tabId;
  const memberId = input.memberId;
  const walletAddress = normalizeEvmAddress(input.walletAddress);
  const tokenAddress = normalizeEvmAddress(input.tokenAddress);
  const configuredContract = normalizeEvmAddress(getSettlementContractAddress());
  const settlementContractAddress =
    normalizeEvmAddress(input.settlementContractAddress) ?? configuredContract;
  const cap = parseBaseUnits(input.capBaseUnits);
  const maxSingle = parseBaseUnits(input.maxSingleSettlementBaseUnits);
  const expiresAt = parseFutureDate(input.expiresAt);
  const method = input.authorizationMethod ?? "erc20_allowance";
  const allowanceTxHash: string | null =
    input.allowanceTxHash === undefined || input.allowanceTxHash === null
      ? null
      : typeof input.allowanceTxHash === "string"
        ? input.allowanceTxHash
        : "";

  if (!configuredContract || !settlementContractAddress) {
    return fail("configuration_missing", 503);
  }

  if (
    !walletAddress ||
    !tokenAddress ||
    tokenAddress !== TABY_USDC_ADDRESS.toLowerCase() ||
    settlementContractAddress !== configuredContract ||
    !cap ||
    !maxSingle ||
    cap < maxSingle ||
    !expiresAt ||
    method !== "erc20_allowance" ||
    (allowanceTxHash !== null && !isEvmTxHash(allowanceTxHash))
  ) {
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

  if (walletAddress !== currentUser.data.user.walletAddress.toLowerCase()) {
    return fail("unauthorized", 403);
  }

  if (normalizeEvmAddress(access.data.currentMember.walletAddress) !== walletAddress) {
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

    const owed = proposal.transfers
      .filter((transfer) => transfer.fromMemberId === memberId)
      .reduce((total, transfer) => total + BigInt(transfer.amountBaseUnits), BigInt(0));

    if (owed <= BigInt(0) || maxSingle !== owed || cap < owed) {
      return fail("validation_failed", 422);
    }

    const result = await db.transaction(async (tx) => {
      const [authorization] = await tx
        .insert(tabAuthorizations)
        .values({
          allowanceTxHash,
          authorizationMethod: "erc20_allowance",
          capBaseUnits: cap,
          expiresAt,
          maxSingleSettlementBaseUnits: maxSingle,
          memberId,
          settlementContractAddress,
          tabId,
          tokenAddress,
          walletAddress,
        })
        .returning();

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            authorizationId: authorization.id,
            capBaseUnits: cap.toString(),
            memberId,
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
  authorizationId: unknown;
  didToken: unknown;
  revokeTxHash?: unknown;
}) {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.authorizationId)) {
    return fail("validation_failed", 422);
  }

  const revokeTxHash: string | null =
    input.revokeTxHash === undefined || input.revokeTxHash === null
      ? null
      : typeof input.revokeTxHash === "string"
        ? input.revokeTxHash
        : "";

  if (revokeTxHash !== null && !isEvmTxHash(revokeTxHash)) {
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
      access.data.tab.status === "settling" ||
      access.data.tab.status === "settled" ||
      access.data.tab.status === "cancelled"
    ) {
      return fail("invalid_transition", 409);
    }

    const now = new Date();
    const result = await db.transaction(async (tx) => {
      const [updatedAuthorization] = await tx
        .update(tabAuthorizations)
        .set({ revokedAt: now, updatedAt: now })
        .where(eq(tabAuthorizations.id, authorization.id))
        .returning();

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            authorizationId: authorization.id,
            memberId: authorization.memberId,
            revokeTxHash,
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
    const coordinator = members.find(
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

    const memberById = new Map(members.map((member) => [member.id, member]));
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
        members,
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
  didToken: unknown;
  proposalId: unknown;
}): Promise<TabResult<SettlementProposalMutationResponse>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.proposalId)) {
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

    const coordinator = members.find(
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
        members,
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

    const memberById = new Map(members.map((member) => [member.id, member]));
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

    const result = await db.transaction(async (tx) => {
      const [lockedProposal] = await tx
        .update(settlementProposals)
        .set({ lockedAt: new Date(), status: "locked", updatedAt: new Date() })
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
  didToken: unknown;
  proposalId: unknown;
}): Promise<TabResult<SettlementProposalMutationResponse>> {
  const currentUser = await getCurrentUser(input.didToken);

  if (!currentUser.ok) {
    return currentUser;
  }

  if (!isUuid(input.proposalId)) {
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

    const result = await db.transaction(async (tx) => {
      const [cancelledProposal] = await tx
        .update(settlementProposals)
        .set({ cancelledAt: new Date(), status: "cancelled", updatedAt: new Date() })
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
    const memberById = new Map(members.map((member) => [member.id, member]));
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
        members: members.map(memberDto),
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
      const coordinator = members.find(
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
            members,
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
      const authorization = settlementContractAddress
        ? latestAuthorizationForMember(
            authorizationRows,
            memberId,
            TABY_USDC_ADDRESS,
            settlementContractAddress,
          )
        : undefined;
      let status: SettlementPreviewAuthorizationSummary["status"] = "ready";

      if (!member?.walletAddress) {
        status = "missing_wallet";
      } else if (!authorization) {
        status = "missing";
      } else if (authorization.revokedAt) {
        status = "revoked";
      } else if (authorization.expiresAt.getTime() <= nowMs) {
        status = "expired";
      } else if (authorization.capBaseUnits < owed) {
        status = "insufficient_cap";
      }

      authorizationSummaries.push({
        authorizationId: authorization?.id ?? null,
        capBaseUnits: authorization?.capBaseUnits.toString() ?? null,
        displayName: member?.displayName ?? "A member",
        expiresAt: authorization?.expiresAt.toISOString() ?? null,
        memberId,
        owedBaseUnits: owed.toString(),
        revokedAt: authorization?.revokedAt?.toISOString() ?? null,
        status,
        walletAddress: member?.walletAddress ?? null,
      });

      if (status === "missing") {
        blockers.push(
          previewBlocker({
            id: `authorization-${memberId}`,
            kind: "missing_authorization",
            memberId,
            message: `${member?.displayName ?? "A member"} still needs to authorize their share.`,
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
            message: `${member?.displayName ?? "A member"} needs to authorize again because their permission expired.`,
            severity: "warning",
          }),
        );
      } else if (status === "insufficient_cap") {
        blockers.push(
          previewBlocker({
            id: `authorization-insufficient-${memberId}`,
            kind: "insufficient_authorization",
            memberId,
            message: `${member?.displayName ?? "A member"} needs a cap that covers their share.`,
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

  if (!isUuid(input.proposalId) || !isEvmTxHash(input.txHash)) {
    return fail("validation_failed", 422);
  }

  const proposalId = input.proposalId;
  const txHash = input.txHash.toLowerCase();
  const status = String(input.status);

  if (!["submitted", "confirmed", "failed"].includes(status)) {
    return fail("validation_failed", 422);
  }

  const errorMessage = normalizeText(input.errorMessage, { max: 240, nullable: true });

  if (errorMessage === undefined) {
    return fail("validation_failed", 422);
  }

  const blockNumber =
    input.blockNumber === undefined || input.blockNumber === null
      ? null
      : parseBaseUnits(input.blockNumber);
  const settlementContractAddress = getSettlementContractAddress();

  if (!settlementContractAddress || !isEvmAddress(settlementContractAddress)) {
    return fail("configuration_missing", 503);
  }

  try {
    const db = getDb();
    const [proposal] = await db
      .select()
      .from(settlementProposals)
      .where(eq(settlementProposals.id, proposalId));

    if (!proposal) {
      return fail("not_found", 404);
    }

    const access = await getAccessContext(proposal.tabId, currentUser.data.user.id);

    if (!access.ok) {
      return access;
    }

    if (!access.data.isOwner) {
      return fail("unauthorized", 403);
    }

    const result = await db.transaction(async (tx) => {
      const [transaction] = await tx
        .insert(settlementTransactions)
        .values({
          blockNumber,
          chainId: TABY_CHAIN_ID,
          errorMessage,
          proposalId: proposal.id,
          settlementContractAddress: settlementContractAddress.toLowerCase(),
          status: status as TransactionStatus,
          tabId: proposal.tabId,
          tokenAddress: TABY_USDC_ADDRESS.toLowerCase(),
          txHash,
        })
        .onConflictDoUpdate({
          set: {
            blockNumber,
            errorMessage,
            status: status as TransactionStatus,
            updatedAt: new Date(),
          },
          target: [settlementTransactions.chainId, settlementTransactions.txHash],
        })
        .returning();

      if (status === "confirmed") {
        await tx
          .update(settlementProposals)
          .set({ executedAt: new Date(), status: "executed", updatedAt: new Date() })
          .where(eq(settlementProposals.id, proposal.id));
        await tx
          .update(tabs)
          .set({ settledAt: new Date(), status: "settled", updatedAt: new Date() })
          .where(eq(tabs.id, proposal.tabId));
      } else if (status === "failed") {
        await tx
          .update(settlementProposals)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(settlementProposals.id, proposal.id));
      }

      const [activity] = await tx
        .insert(activityEvents)
        .values({
          actorUserId: currentUser.data.user.id,
          eventData: {
            proposalId: proposal.id,
            status,
            txHash,
          },
          eventType:
            status === "confirmed" ? "settlement_completed" : "settlement_transaction_updated",
          tabId: proposal.tabId,
        })
        .returning();

      return { activity, transaction };
    });

    return {
      data: {
        activity: activityDto(result.activity),
        transaction: {
          ...result.transaction,
          blockNumber: result.transaction.blockNumber?.toString() ?? null,
        },
      },
      ok: true,
    } satisfies TabResult<unknown>;
  } catch {
    return fail("database_unavailable", 503);
  }
}
