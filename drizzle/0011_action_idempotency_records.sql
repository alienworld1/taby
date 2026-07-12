DO $$ BEGIN
  CREATE TYPE "action_idempotency_status" AS ENUM ('started', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "protected_action" AS ENUM (
    'lock_final_tab', 'authorize_final_tab', 'revoke_final_tab', 'cancel_final_tab',
    'settle_final_tab', 'delegated_prepare', 'delegated_install',
    'delegated_cancel', 'delegated_reconcile'
  );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "action_idempotency_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "actor_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "tab_id" uuid NOT NULL REFERENCES "tabs"("id"),
  "proposal_id" uuid REFERENCES "settlement_proposals"("id"),
  "action" "protected_action" NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "status" "action_idempotency_status" NOT NULL DEFAULT 'started',
  "result_reference" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at" timestamp with time zone NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "action_idempotency_records_expiry_after_creation" CHECK ("expires_at" > "created_at")
);

CREATE UNIQUE INDEX IF NOT EXISTS "action_idempotency_records_actor_action_key_idx"
ON "action_idempotency_records" ("actor_user_id", "action", "idempotency_key");
CREATE INDEX IF NOT EXISTS "action_idempotency_records_rate_limit_idx"
ON "action_idempotency_records" ("actor_user_id", "action", "created_at");

ALTER TABLE "action_idempotency_records" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "action_idempotency_records" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "action_idempotency_records" FROM authenticated;
  END IF;
END $$;
