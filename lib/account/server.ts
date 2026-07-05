import { eq } from "drizzle-orm";
import { Magic } from "@magic-sdk/admin";
import { getDb, hasDatabaseConfig } from "@/lib/db/client";
import { users, type User } from "@/lib/db/schema";
import {
  isValidEvmAddress,
  normalizeDisplayName,
  normalizeEmail,
  validateDisplayName,
} from "@/lib/account/validation";
import type { AccountResponse, AccountErrorCode } from "@/lib/account/types";

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

function toAccount(user: User): AccountResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
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

async function verifyMagicToken(didToken: string) {
  const secretKey = process.env.MAGIC_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  const magic = await Magic.init(secretKey);
  magic.token.validate(didToken);
  return magic.users.getMetadataByToken(didToken) as Promise<MagicMetadata>;
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

    return { account: toAccount(user), ok: true };
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

    return { account: toAccount(user), ok: true };
  } catch {
    return { code: "account_unavailable", ok: false, status: 503 };
  }
}
