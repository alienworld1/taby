ALTER TABLE "settlement_transactions"
ADD COLUMN IF NOT EXISTS "last_reconciled_at" timestamp with time zone,
ADD COLUMN IF NOT EXISTS "reconcile_attempt_count" integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "last_reconcile_error_code" text;
