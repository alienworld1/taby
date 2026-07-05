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
  type TabMember,
  type User,
} from "@/lib/db/schema";
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
  TabDetailResponse,
  TabErrorCode,
  TabMemberResponse,
  TabResponse,
  TabResult,
  TabSummaryResponse,
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
          .where(eq(settlementProposals.tabId, tabId))
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
            : authorizationRows.map((authorization) => ({
                ...authorization,
                capBaseUnits: authorization.capBaseUnits.toString(),
                maxSingleSettlementBaseUnits:
                  authorization.maxSingleSettlementBaseUnits.toString(),
              })),
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
              ? {
                  ...latestProposalRows[0],
                  totalAmountBaseUnits: latestProposalRows[0].totalAmountBaseUnits.toString(),
                }
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
  const configuredContract = getSettlementContractAddress();
  const settlementContractAddress =
    normalizeEvmAddress(input.settlementContractAddress) ?? configuredContract?.toLowerCase();
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

  if (!settlementContractAddress) {
    return fail("configuration_missing", 503);
  }

  if (
    !walletAddress ||
    !tokenAddress ||
    tokenAddress !== TABY_USDC_ADDRESS.toLowerCase() ||
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

  try {
    const db = getDb();
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
        authorization: {
          ...result.authorization,
          capBaseUnits: result.authorization.capBaseUnits.toString(),
          maxSingleSettlementBaseUnits:
            result.authorization.maxSingleSettlementBaseUnits.toString(),
        },
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
}) {
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
    const tabExpenses = await db.select().from(expenses).where(eq(expenses.tabId, tabId));
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

    return fail("settlement_engine_unavailable", 501);
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
