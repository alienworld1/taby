import "server-only";

import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import { actionIdempotencyRecords } from "@/lib/db/schema";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/tabs/validation";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MUTATION_LIMIT = 5;
const RECONCILIATION_LIMIT = 12;
const WINDOW_MS = 10 * 60 * 1000;
const RECORD_TTL_MS = 24 * 60 * 60 * 1000;

export type ProtectedAction =
  | "lock_final_tab"
  | "authorize_final_tab"
  | "revoke_final_tab"
  | "cancel_final_tab"
  | "settle_final_tab"
  | "delegated_prepare"
  | "delegated_install"
  | "delegated_cancel"
  | "delegated_reconcile";

type ActionStartResult =
  | { kind: "started"; recordId: string }
  | { kind: "replay"; resultReference: string | null }
  | { kind: "in_progress" }
  | { kind: "conflict" }
  | { kind: "rate_limited" }
  | { kind: "invalid_key" };

export function createRequestFingerprint(input: Record<string, string | null | undefined>) {
  return createHash("sha256")
    .update(JSON.stringify(Object.entries(input).sort(([left], [right]) => left.localeCompare(right))))
    .digest("hex");
}

export async function beginProtectedAction(input: {
  action: ProtectedAction;
  actorUserId: string;
  idempotencyKey: unknown;
  proposalId?: string | null;
  requestFingerprint: string;
  tabId: string;
}): Promise<ActionStartResult> {
  if (!isUuid(input.actorUserId) || !isUuid(input.tabId) || !IDEMPOTENCY_KEY_PATTERN.test(String(input.idempotencyKey))) {
    return { kind: "invalid_key" };
  }

  const idempotencyKey = String(input.idempotencyKey);
  const now = new Date();
  const db = getDb();
  const [existing] = await db
    .select()
    .from(actionIdempotencyRecords)
    .where(
      and(
        eq(actionIdempotencyRecords.actorUserId, input.actorUserId),
        eq(actionIdempotencyRecords.action, input.action),
        eq(actionIdempotencyRecords.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.requestFingerprint !== input.requestFingerprint) return { kind: "conflict" };
    if (existing.status === "started") return { kind: "in_progress" };
    return { kind: "replay", resultReference: existing.resultReference };
  }

  const limit = input.action === "delegated_reconcile" ? RECONCILIATION_LIMIT : MUTATION_LIMIT;
  const [count] = await db
    .select({ count: sql<number>`count(*)` })
    .from(actionIdempotencyRecords)
    .where(
      and(
        eq(actionIdempotencyRecords.actorUserId, input.actorUserId),
        eq(actionIdempotencyRecords.action, input.action),
        gte(actionIdempotencyRecords.createdAt, new Date(now.getTime() - WINDOW_MS)),
      ),
    );

  if (Number(count?.count ?? 0) >= limit) return { kind: "rate_limited" };

  const [record] = await db
    .insert(actionIdempotencyRecords)
    .values({
      action: input.action,
      actorUserId: input.actorUserId,
      expiresAt: new Date(now.getTime() + RECORD_TTL_MS),
      idempotencyKey,
      proposalId: input.proposalId && isUuid(input.proposalId) ? input.proposalId : null,
      requestFingerprint: input.requestFingerprint,
      tabId: input.tabId,
    })
    .returning({ id: actionIdempotencyRecords.id });

  return record ? { kind: "started", recordId: record.id } : { kind: "in_progress" };
}

export async function finishProtectedAction(input: {
  recordId: string;
  resultReference?: string | null;
  succeeded: boolean;
}) {
  if (!isUuid(input.recordId)) return;
  await getDb()
    .update(actionIdempotencyRecords)
    .set({
      resultReference: input.resultReference ?? null,
      status: input.succeeded ? "completed" : "failed",
      updatedAt: new Date(),
    })
    .where(eq(actionIdempotencyRecords.id, input.recordId));
}
