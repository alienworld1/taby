ALTER TYPE "user_operation_purpose" ADD VALUE IF NOT EXISTS 'settlement_withdrawal';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'protected_action') THEN
    ALTER TYPE "protected_action" ADD VALUE IF NOT EXISTS 'settlement_withdrawal';
  END IF;
END $$;

DO $$ BEGIN
  CREATE TYPE "withdrawal_transaction_status" AS ENUM (
    'created', 'submitted', 'confirmed', 'rejected', 'reverted', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "withdrawal_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "settlement_account_id" uuid NOT NULL REFERENCES "user_settlement_accounts"("id"),
  "recipient_address" text NOT NULL,
  "amount_base_units" bigint NOT NULL CHECK ("amount_base_units" > 0),
  "reserved_amount_base_units" bigint NOT NULL CHECK ("reserved_amount_base_units" >= 0),
  "idempotency_key" text NOT NULL,
  "user_operation_hash" text,
  "tx_hash" text,
  "status" "withdrawal_transaction_status" NOT NULL,
  "failure_code" text,
  "error_message" text,
  "last_reconciled_at" timestamp with time zone,
  "reconcile_attempt_count" integer NOT NULL DEFAULT 0,
  "last_reconcile_error_code" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "withdrawal_transactions_nonnegative_attempts" CHECK ("reconcile_attempt_count" >= 0)
);

CREATE INDEX IF NOT EXISTS "withdrawal_transactions_user_status_idx"
ON "withdrawal_transactions" ("user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_transactions_idempotency_idx"
ON "withdrawal_transactions" ("user_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_transactions_userop_idx"
ON "withdrawal_transactions" ("user_operation_hash") WHERE "user_operation_hash" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawal_transactions_chain_tx_idx"
ON "withdrawal_transactions" ("tx_hash") WHERE "tx_hash" IS NOT NULL;

ALTER TABLE "withdrawal_transactions" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "withdrawal_transactions" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "withdrawal_transactions" FROM authenticated;
  END IF;
END $$;
