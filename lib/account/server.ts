import { and, desc, eq } from "drizzle-orm";
import { Magic } from "@magic-sdk/admin";
import { getDb, hasDatabaseConfig } from "@/lib/db/client";
import {
  userOperationRecords,
  userSettlementAccounts,
  users,
  type User,
  type UserOperationRecord,
  type UserSettlementAccount,
} from "@/lib/db/schema";
import {
  isValidEvmAddress,
  normalizeDisplayName,
  normalizeEmail,
  validateDisplayName,
} from "@/lib/account/validation";
import {
  assertZeroDevServerConfig,
  getZeroDevAccountConfig,
} from "@/lib/account/zerodev/config";
import type {
  AccountResponse,
  AccountErrorCode,
  DelegationStatus,
  PaymasterPolicyStatus,
  SettlementAccountReadiness,
  SettlementAccountType,
  UserOperationPurpose,
  UserOperationRecordResponse,
  UserOperationStatus,
} from "@/lib/account/types";

type AccountResult =
  | { account: AccountResponse; ok: true }
  | { code: AccountErrorCode; ok: false; status: number };

type MagicWallet = {
  publicAddress?: string | null;
};

type MagicMetadata = {
  email?: string | null;
  issuer?: string | null;
  publicAddress?: string | null;
  wallets?: MagicWallet[] | null;
};

const HEX_32_PATTERN = /^0x[a-fA-F0-9]{64}$/;

function toReadiness(row: UserSettlementAccount | null): SettlementAccountReadiness | null {
  if (!row) {
    return null;
  }

  return {
    accountType: row.accountType,
    chainId: row.chainId,
    configHash: row.configHash,
    delegationConfirmedAt: row.delegationConfirmedAt?.toISOString() ?? null,
    delegationStatus: row.delegationStatus,
    entryPointVersion: row.entryPointVersion,
    kernelVersion: row.kernelVersion,
    lastCheckedAt: row.lastCheckedAt.toISOString(),
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    lastTransactionHash: row.lastTransactionHash,
    lastUserOperationHash: row.lastUserOperationHash,
    magicWalletAddress: row.magicWalletAddress,
    paymasterPolicyStatus: row.paymasterPolicyStatus,
    settlementAddress: row.settlementAddress,
    zeroDevProjectIdHash: row.zeroDevProjectIdHash,
  };
}

function toOperationRecord(row: UserOperationRecord): UserOperationRecordResponse {
  return {
    purpose: row.purpose,
    status: row.status,
    transactionHash: row.transactionHash,
    userOperationHash: row.userOperationHash,
  };
}

async function getCurrentSettlementAccount(userId: string) {
  const config = getZeroDevAccountConfig();
  const db = getDb();
  const [readyForConfig] = await db
    .select()
    .from(userSettlementAccounts)
    .where(
      and(
        eq(userSettlementAccounts.userId, userId),
        eq(userSettlementAccounts.configHash, config.configHash),
      ),
    )
    .limit(1);

  if (readyForConfig) {
    return readyForConfig;
  }

  const [latest] = await db
    .select()
    .from(userSettlementAccounts)
    .where(eq(userSettlementAccounts.userId, userId))
    .orderBy(desc(userSettlementAccounts.updatedAt))
    .limit(1);

  return latest ?? null;
}

async function toAccount(user: User): Promise<AccountResponse> {
  const settlementAccount = await getCurrentSettlementAccount(user.id);

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    settlementAccount: toReadiness(settlementAccount),
    walletAddress: user.walletAddress,
  };
}

function verifiedWalletAddresses(metadata: MagicMetadata) {
  const addresses = new Set<string>();

  if (metadata.publicAddress) {
    addresses.add(metadata.publicAddress.toLowerCase());
  }

  for (const wallet of metadata.wallets ?? []) {
    if (wallet.publicAddress) {
      addresses.add(wallet.publicAddress.toLowerCase());
    }
  }

  return addresses;
}

export async function verifyMagicToken(didToken: string) {
  const secretKey = process.env.MAGIC_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  const magic = await Magic.init(secretKey);
  magic.token.validate(didToken);
  return magic.users.getMetadataByToken(didToken) as Promise<MagicMetadata>;
}

export async function getVerifiedUserFromDidToken(didToken: unknown) {
  if (!process.env.MAGIC_SECRET_KEY || !hasDatabaseConfig()) {
    return { code: "configuration_missing" as AccountErrorCode, ok: false as const, status: 503 };
  }

  if (typeof didToken !== "string" || didToken.length < 20) {
    return { code: "login_invalid" as AccountErrorCode, ok: false as const, status: 401 };
  }

  let metadata: MagicMetadata | null;

  try {
    metadata = await verifyMagicToken(didToken);
  } catch {
    return { code: "login_invalid" as AccountErrorCode, ok: false as const, status: 401 };
  }

  if (!metadata?.issuer) {
    return { code: "login_invalid" as AccountErrorCode, ok: false as const, status: 401 };
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.magicUserId, metadata.issuer))
    .limit(1);

  if (!user) {
    return { code: "account_unavailable" as AccountErrorCode, ok: false as const, status: 404 };
  }

  return { metadata, ok: true as const, user };
}

export async function upsertAccount(input: {
  didToken: unknown;
  displayNameSeed: unknown;
  email: unknown;
  walletAddress: unknown;
}): Promise<AccountResult> {
  if (!process.env.MAGIC_SECRET_KEY || !hasDatabaseConfig()) {
    return { code: "configuration_missing", ok: false, status: 503 };
  }

  if (typeof input.didToken !== "string" || input.didToken.length < 20) {
    return { code: "login_invalid", ok: false, status: 401 };
  }

  if (typeof input.walletAddress !== "string" || !isValidEvmAddress(input.walletAddress)) {
    return { code: "wallet_unavailable", ok: false, status: 422 };
  }

  const walletAddress = input.walletAddress;
  let metadata: MagicMetadata | null;

  try {
    metadata = await verifyMagicToken(input.didToken);
  } catch {
    return { code: "login_invalid", ok: false, status: 401 };
  }

  if (!metadata?.issuer) {
    return { code: "login_invalid", ok: false, status: 401 };
  }

  const verifiedMetadata = metadata;
  const magicUserId = verifiedMetadata.issuer as string;
  const submittedWalletAddress = walletAddress.toLowerCase();
  const verifiedAddresses = verifiedWalletAddresses(verifiedMetadata);

  if (verifiedAddresses.size > 0 && !verifiedAddresses.has(submittedWalletAddress)) {
    return { code: "wallet_unavailable", ok: false, status: 422 };
  }

  const email = normalizeEmail(verifiedMetadata.email ?? input.email);
  const displayName = normalizeDisplayName(input.displayNameSeed, email);

  try {
    const db = getDb();
    const [user] = await db
      .insert(users)
      .values({
        displayName,
        email,
        magicUserId,
        walletAddress,
      })
      .onConflictDoUpdate({
        set: {
          email,
          updatedAt: new Date(),
          walletAddress,
        },
        target: users.magicUserId,
      })
      .returning();

    return { account: await toAccount(user), ok: true };
  } catch {
    return { code: "account_unavailable", ok: false, status: 503 };
  }
}

export async function updateDisplayName(input: {
  didToken: unknown;
  displayName: unknown;
}): Promise<AccountResult> {
  if (!process.env.MAGIC_SECRET_KEY || !hasDatabaseConfig()) {
    return { code: "configuration_missing", ok: false, status: 503 };
  }

  if (typeof input.didToken !== "string" || input.didToken.length < 20) {
    return { code: "login_invalid", ok: false, status: 401 };
  }

  const displayName = validateDisplayName(input.displayName);

  if (!displayName) {
    return { code: "account_unavailable", ok: false, status: 422 };
  }

  let metadata: MagicMetadata | null;

  try {
    metadata = await verifyMagicToken(input.didToken);
  } catch {
    return { code: "login_invalid", ok: false, status: 401 };
  }

  if (!metadata?.issuer) {
    return { code: "login_invalid", ok: false, status: 401 };
  }

  try {
    const db = getDb();
    const [user] = await db
      .update(users)
      .set({ displayName, updatedAt: new Date() })
      .where(eq(users.magicUserId, metadata.issuer))
      .returning();

    if (!user) {
      return { code: "account_unavailable", ok: false, status: 404 };
    }

    return { account: await toAccount(user), ok: true };
  } catch {
    return { code: "account_unavailable", ok: false, status: 503 };
  }
}

export async function getSettlementAccountReadiness(input: { didToken: unknown }) {
  const verified = await getVerifiedUserFromDidToken(input.didToken);

  if (!verified.ok) {
    return verified;
  }

  try {
    return {
      ok: true as const,
      readiness: toReadiness(await getCurrentSettlementAccount(verified.user.id)),
    };
  } catch {
    return { code: "account_unavailable" as AccountErrorCode, ok: false, status: 503 };
  }
}

export async function persistSettlementAccountReadiness(input: {
  accountType: unknown;
  chainId: unknown;
  configHash: unknown;
  delegationStatus: unknown;
  didToken: unknown;
  entryPointVersion: unknown;
  kernelVersion: unknown;
  lastErrorCode?: unknown;
  lastErrorMessage?: unknown;
  magicWalletAddress: unknown;
  paymasterPolicyStatus?: unknown;
  settlementAddress: unknown;
  transactionHash?: unknown;
  userOperationHash?: unknown;
}) {
  const verified = await getVerifiedUserFromDidToken(input.didToken);

  if (!verified.ok) {
    return verified;
  }

  let config;

  try {
    config = assertZeroDevServerConfig();
  } catch {
    return { code: "zerodev_config_mismatch" as AccountErrorCode, ok: false, status: 503 };
  }

  const accountType = parseAccountType(input.accountType);
  const delegationStatus = parseDelegationStatus(input.delegationStatus);
  const paymasterPolicyStatus = parsePaymasterStatus(input.paymasterPolicyStatus);

  if (
    !accountType ||
    !delegationStatus ||
    typeof input.magicWalletAddress !== "string" ||
    typeof input.settlementAddress !== "string" ||
    !isValidEvmAddress(input.magicWalletAddress) ||
    !isValidEvmAddress(input.settlementAddress)
  ) {
    return { code: "settlement_account_mismatch" as AccountErrorCode, ok: false, status: 422 };
  }

  if (
    input.chainId !== config.chainId ||
    input.kernelVersion !== config.kernelVersion ||
    input.entryPointVersion !== config.entryPointVersion ||
    input.configHash !== config.configHash ||
    accountType !== config.accountType
  ) {
    return { code: "zerodev_config_mismatch" as AccountErrorCode, ok: false, status: 422 };
  }

  if (accountType === "zerodev_kernel" && process.env.ZERODEV_ALLOW_KERNEL_FALLBACK !== "true") {
    return { code: "zerodev_config_mismatch" as AccountErrorCode, ok: false, status: 422 };
  }

  const submittedMagicWallet = input.magicWalletAddress.toLowerCase();
  const verifiedAddresses = verifiedWalletAddresses(verified.metadata);

  if (verifiedAddresses.size > 0 && !verifiedAddresses.has(submittedMagicWallet)) {
    return { code: "wallet_unavailable" as AccountErrorCode, ok: false, status: 422 };
  }

  if (
    accountType === "magic_eoa_7702" &&
    input.settlementAddress.toLowerCase() !== submittedMagicWallet
  ) {
    return { code: "settlement_account_mismatch" as AccountErrorCode, ok: false, status: 422 };
  }

  const userOperationHash = optionalHash(input.userOperationHash);
  const transactionHash = optionalHash(input.transactionHash);

  if (
    delegationStatus === "ready" &&
    (!userOperationHash || !transactionHash || paymasterPolicyStatus !== "available")
  ) {
    return { code: "zerodev_not_ready" as AccountErrorCode, ok: false, status: 422 };
  }

  const now = new Date();
  const sanitizedErrorCode = sanitizeShortText(input.lastErrorCode);
  const sanitizedErrorMessage = sanitizeShortText(input.lastErrorMessage, 180);

  try {
    const db = getDb();
    const [row] = await db
      .insert(userSettlementAccounts)
      .values({
        accountType,
        chainId: config.chainId,
        configHash: config.configHash,
        delegationConfirmedAt: delegationStatus === "ready" ? now : null,
        delegationStatus,
        entryPointVersion: config.entryPointVersion,
        kernelVersion: config.kernelVersion,
        lastCheckedAt: now,
        lastErrorCode: sanitizedErrorCode,
        lastErrorMessage: sanitizedErrorMessage,
        lastTransactionHash: transactionHash,
        lastUserOperationHash: userOperationHash,
        magicWalletAddress: input.magicWalletAddress.toLowerCase(),
        paymasterPolicyStatus,
        settlementAddress: input.settlementAddress.toLowerCase(),
        updatedAt: now,
        userId: verified.user.id,
        zeroDevProjectIdHash: config.zeroDevProjectIdHash,
      })
      .onConflictDoUpdate({
        set: {
          accountType,
          delegationConfirmedAt: delegationStatus === "ready" ? now : null,
          delegationStatus,
          lastCheckedAt: now,
          lastErrorCode: sanitizedErrorCode,
          lastErrorMessage: sanitizedErrorMessage,
          lastTransactionHash: transactionHash,
          lastUserOperationHash: userOperationHash,
          magicWalletAddress: input.magicWalletAddress.toLowerCase(),
          paymasterPolicyStatus,
          settlementAddress: input.settlementAddress.toLowerCase(),
          updatedAt: now,
          zeroDevProjectIdHash: config.zeroDevProjectIdHash,
        },
        target: [userSettlementAccounts.userId, userSettlementAccounts.configHash],
      })
      .returning();

    if (userOperationHash) {
      await upsertUserOperationRecord({
        didToken: input.didToken,
        purpose: "diagnostic_batch",
        settlementAccountId: row.id,
        status: transactionHash ? "confirmed" : "submitted",
        transactionHash,
        userOperationHash,
      });
    }

    return { ok: true as const, readiness: toReadiness(row) };
  } catch {
    return { code: "account_unavailable" as AccountErrorCode, ok: false, status: 503 };
  }
}

export async function upsertUserOperationRecord(input: {
  didToken: unknown;
  failureCode?: unknown;
  failureMessage?: unknown;
  purpose: unknown;
  settlementAccountId?: string | null;
  status: unknown;
  transactionHash?: unknown;
  userOperationHash: unknown;
}) {
  const verified = await getVerifiedUserFromDidToken(input.didToken);

  if (!verified.ok) {
    return verified;
  }

  const purpose = parseOperationPurpose(input.purpose);
  const status = parseOperationStatus(input.status);
  const userOperationHash = optionalHash(input.userOperationHash);
  const transactionHash = optionalHash(input.transactionHash);

  if (!purpose || !status || !userOperationHash) {
    return { code: "account_unavailable" as AccountErrorCode, ok: false, status: 422 };
  }

  if (purpose === "final_tab_settlement" && status !== "submitted") {
    return { code: "account_unavailable" as AccountErrorCode, ok: false, status: 422 };
  }

  const now = new Date();
  const confirmedAt = status === "confirmed" ? now : null;

  try {
    const db = getDb();
    const [record] = await db
      .insert(userOperationRecords)
      .values({
        confirmedAt,
        failureCode: sanitizeShortText(input.failureCode),
        failureMessage: sanitizeShortText(input.failureMessage, 180),
        purpose,
        settlementAccountId: input.settlementAccountId ?? null,
        status,
        transactionHash,
        updatedAt: now,
        userId: verified.user.id,
        userOperationHash,
      })
      .onConflictDoUpdate({
        set: {
          confirmedAt,
          failureCode: sanitizeShortText(input.failureCode),
          failureMessage: sanitizeShortText(input.failureMessage, 180),
          status,
          transactionHash,
          updatedAt: now,
        },
        target: userOperationRecords.userOperationHash,
      })
      .returning();

    return { ok: true as const, record: toOperationRecord(record) };
  } catch {
    return { code: "account_unavailable" as AccountErrorCode, ok: false, status: 503 };
  }
}

function parseAccountType(value: unknown): SettlementAccountType | null {
  return value === "magic_eoa_7702" || value === "zerodev_kernel" ? value : null;
}

function parseDelegationStatus(value: unknown): DelegationStatus | null {
  return value === "not_initialized" ||
    value === "pending" ||
    value === "ready" ||
    value === "failed" ||
    value === "fallback_required"
    ? value
    : null;
}

function parsePaymasterStatus(value: unknown): PaymasterPolicyStatus {
  return value === "available" || value === "rejected" || value === "misconfigured"
    ? value
    : "unknown";
}

function parseOperationPurpose(value: unknown): UserOperationPurpose | null {
  return value === "diagnostic_batch" ||
    value === "account_initialization" ||
    value === "final_tab_registration" ||
    value === "final_tab_authorization" ||
    value === "final_tab_revocation" ||
    value === "final_tab_cancellation" ||
    value === "final_tab_settlement"
    ? value
    : null;
}

function parseOperationStatus(value: unknown): UserOperationStatus | null {
  return value === "submitted" ||
    value === "confirmed" ||
    value === "failed" ||
    value === "timed_out"
    ? value
    : null;
}

function optionalHash(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return HEX_32_PATTERN.test(value) ? value.toLowerCase() : null;
}

function sanitizeShortText(value: unknown, maxLength = 80) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.replace(/\s+/g, " ").trim();

  return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
}
