ALTER TYPE "settlement_transaction_status" ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE "settlement_transaction_status" ADD VALUE IF NOT EXISTS 'userop_submitted';
ALTER TYPE "settlement_transaction_status" ADD VALUE IF NOT EXISTS 'included';
ALTER TYPE "settlement_transaction_status" ADD VALUE IF NOT EXISTS 'reverted';
ALTER TYPE "settlement_transaction_status" ADD VALUE IF NOT EXISTS 'unknown';

ALTER TYPE "user_operation_purpose" ADD VALUE IF NOT EXISTS 'final_tab_settlement';

ALTER TABLE "settlement_transactions"
ALTER COLUMN "tx_hash" DROP NOT NULL;

ALTER TABLE "settlement_transactions"
ADD COLUMN IF NOT EXISTS "attempt_number" integer,
ADD COLUMN IF NOT EXISTS "idempotency_key" text,
ADD COLUMN IF NOT EXISTS "submitted_by_user_id" uuid REFERENCES "users"("id"),
ADD COLUMN IF NOT EXISTS "settlement_account_id" uuid REFERENCES "user_settlement_accounts"("id"),
ADD COLUMN IF NOT EXISTS "user_operation_hash" text,
ADD COLUMN IF NOT EXISTS "confirmed_block_number" bigint,
ADD COLUMN IF NOT EXISTS "event_log_index" integer,
ADD COLUMN IF NOT EXISTS "event_name" text,
ADD COLUMN IF NOT EXISTS "event_proposal_hash" text,
ADD COLUMN IF NOT EXISTS "event_tab_key" text,
ADD COLUMN IF NOT EXISTS "event_transfers_hash" text,
ADD COLUMN IF NOT EXISTS "event_total_amount_base_units" bigint,
ADD COLUMN IF NOT EXISTS "event_transfer_count" integer,
ADD COLUMN IF NOT EXISTS "failure_code" text;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "proposal_id" ORDER BY "created_at", "id") AS attempt_number
  FROM "settlement_transactions"
)
UPDATE "settlement_transactions" AS st
SET
  "attempt_number" = ranked.attempt_number,
  "idempotency_key" = COALESCE(st."idempotency_key", st."proposal_id"::text || ':' || ranked.attempt_number::text),
  "submitted_by_user_id" = COALESCE(st."submitted_by_user_id", sp."created_by_user_id")
FROM ranked
, "settlement_proposals" AS sp
WHERE st."id" = ranked."id"
  AND sp."id" = st."proposal_id";

ALTER TABLE "settlement_transactions"
ALTER COLUMN "attempt_number" SET NOT NULL,
ALTER COLUMN "idempotency_key" SET NOT NULL,
ALTER COLUMN "submitted_by_user_id" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "settlement_transactions_status_idx"
ON "settlement_transactions" ("status");

CREATE UNIQUE INDEX IF NOT EXISTS "settlement_transactions_proposal_attempt_idx"
ON "settlement_transactions" ("proposal_id", "attempt_number");

CREATE UNIQUE INDEX IF NOT EXISTS "settlement_transactions_idempotency_idx"
ON "settlement_transactions" ("idempotency_key");
