ALTER TYPE "user_operation_purpose" ADD VALUE IF NOT EXISTS 'delegated_permission_installation';
ALTER TYPE "user_operation_purpose" ADD VALUE IF NOT EXISTS 'delegated_final_tab_authorization';

DO $$ BEGIN
  CREATE TYPE "delegated_authorization_permission_status" AS ENUM (
    'preparing',
    'permission_pending',
    'execution_submitted',
    'confirmed',
    'cancelled',
    'revoked',
    'expired',
    'failed',
    'unknown'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "delegated_authorization_custody_mode" AS ENUM (
    'remote_signer',
    'envelope_encrypted'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "delegated_authorization_permissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tab_id" uuid NOT NULL REFERENCES "tabs"("id"),
  "proposal_id" uuid NOT NULL REFERENCES "settlement_proposals"("id"),
  "member_id" uuid NOT NULL REFERENCES "tab_members"("id"),
  "settlement_account_id" uuid NOT NULL REFERENCES "user_settlement_accounts"("id"),
  "proposal_hash" text NOT NULL,
  "tab_key" text NOT NULL,
  "wallet_address" text NOT NULL,
  "exact_amount_base_units" bigint NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "permission_signer_address" text NOT NULL,
  "policy_digest" text NOT NULL,
  "permission_serialization" jsonb NOT NULL,
  "credential_reference" text NOT NULL,
  "custody_mode" "delegated_authorization_custody_mode" NOT NULL,
  "status" "delegated_authorization_permission_status" NOT NULL DEFAULT 'preparing',
  "installation_user_operation_hash" text,
  "installation_transaction_hash" text,
  "execution_user_operation_hash" text,
  "execution_transaction_hash" text,
  "execution_attempt_count" integer NOT NULL DEFAULT 0,
  "last_execution_at" timestamp with time zone,
  "last_error_code" text,
  "used_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "credential_destroyed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "delegated_authorization_permissions_positive_amount"
    CHECK ("exact_amount_base_units" > 0),
  CONSTRAINT "delegated_authorization_permissions_nonnegative_attempts"
    CHECK ("execution_attempt_count" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "delegated_authorization_permissions_active_member_idx"
ON "delegated_authorization_permissions" ("proposal_id", "member_id")
WHERE "status" IN ('preparing', 'permission_pending', 'execution_submitted', 'unknown');

CREATE UNIQUE INDEX IF NOT EXISTS "delegated_authorization_permissions_installation_userop_idx"
ON "delegated_authorization_permissions" ("installation_user_operation_hash")
WHERE "installation_user_operation_hash" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "delegated_authorization_permissions_execution_userop_idx"
ON "delegated_authorization_permissions" ("execution_user_operation_hash")
WHERE "execution_user_operation_hash" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "delegated_authorization_permissions_proposal_status_idx"
ON "delegated_authorization_permissions" ("proposal_id", "status");

CREATE INDEX IF NOT EXISTS "delegated_authorization_permissions_expiry_status_idx"
ON "delegated_authorization_permissions" ("expires_at", "status");

ALTER TABLE "delegated_authorization_permissions" ENABLE ROW LEVEL SECURITY;

-- This table contains private, server-only delegated-authorization metadata.
-- No browser client may read or write it through the Supabase Data API.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "delegated_authorization_permissions" FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "delegated_authorization_permissions" FROM authenticated;
  END IF;
END $$;
