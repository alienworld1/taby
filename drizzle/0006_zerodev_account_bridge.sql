CREATE TYPE "settlement_account_type" AS ENUM ('magic_eoa_7702', 'zerodev_kernel');
CREATE TYPE "delegation_status" AS ENUM ('not_initialized', 'pending', 'ready', 'failed', 'fallback_required');
CREATE TYPE "paymaster_policy_status" AS ENUM ('unknown', 'available', 'rejected', 'misconfigured');
CREATE TYPE "user_operation_purpose" AS ENUM ('diagnostic_batch', 'account_initialization');
CREATE TYPE "user_operation_status" AS ENUM ('submitted', 'confirmed', 'failed', 'timed_out');

CREATE TABLE "user_settlement_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "magic_wallet_address" text NOT NULL,
  "settlement_address" text NOT NULL,
  "account_type" "settlement_account_type" NOT NULL,
  "chain_id" integer NOT NULL,
  "zerodev_project_id_hash" text NOT NULL,
  "kernel_version" text NOT NULL,
  "entry_point_version" text NOT NULL,
  "paymaster_policy_status" "paymaster_policy_status" DEFAULT 'unknown' NOT NULL,
  "last_user_operation_hash" text,
  "last_transaction_hash" text,
  "delegation_status" "delegation_status" DEFAULT 'not_initialized' NOT NULL,
  "delegation_confirmed_at" timestamp with time zone,
  "config_hash" text NOT NULL,
  "last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error_code" text,
  "last_error_message" text,
  "diagnostics" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "user_settlement_accounts_status_idx"
ON "user_settlement_accounts" ("delegation_status");

CREATE UNIQUE INDEX "user_settlement_accounts_user_config_idx"
ON "user_settlement_accounts" ("user_id", "config_hash");

CREATE TABLE "user_operation_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_operation_hash" text NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "settlement_account_id" uuid REFERENCES "user_settlement_accounts"("id"),
  "purpose" "user_operation_purpose" NOT NULL,
  "status" "user_operation_status" NOT NULL,
  "submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "confirmed_at" timestamp with time zone,
  "transaction_hash" text,
  "failure_code" text,
  "failure_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "user_operation_records_user_idx"
ON "user_operation_records" ("user_id");

CREATE INDEX "user_operation_records_status_idx"
ON "user_operation_records" ("status");

CREATE UNIQUE INDEX "user_operation_records_hash_idx"
ON "user_operation_records" ("user_operation_hash");

ALTER TABLE "user_settlement_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_operation_records" ENABLE ROW LEVEL SECURITY;

-- These tables are written and read through server-side Magic-verified API routes.
-- Do not expose them directly to browser clients with anon/authenticated Supabase keys.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "user_settlement_accounts" FROM anon;
    REVOKE ALL ON TABLE "user_operation_records" FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "user_settlement_accounts" FROM authenticated;
    REVOKE ALL ON TABLE "user_operation_records" FROM authenticated;
  END IF;
END $$;
