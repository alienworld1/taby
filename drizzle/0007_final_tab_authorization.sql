ALTER TYPE "authorization_method" ADD VALUE IF NOT EXISTS 'zerodev_final_tab';

ALTER TYPE "user_operation_purpose" ADD VALUE IF NOT EXISTS 'final_tab_registration';
ALTER TYPE "user_operation_purpose" ADD VALUE IF NOT EXISTS 'final_tab_authorization';
ALTER TYPE "user_operation_purpose" ADD VALUE IF NOT EXISTS 'final_tab_revocation';
ALTER TYPE "user_operation_purpose" ADD VALUE IF NOT EXISTS 'final_tab_cancellation';

ALTER TABLE "tab_authorizations"
ADD COLUMN IF NOT EXISTS "proposal_id" uuid REFERENCES "settlement_proposals"("id"),
ADD COLUMN IF NOT EXISTS "proposal_hash" text,
ADD COLUMN IF NOT EXISTS "authorization_amount_base_units" bigint,
ADD COLUMN IF NOT EXISTS "authorization_nonce" bigint,
ADD COLUMN IF NOT EXISTS "user_operation_hash" text,
ADD COLUMN IF NOT EXISTS "authorization_tx_hash" text,
ADD COLUMN IF NOT EXISTS "revocation_tx_hash" text,
ADD COLUMN IF NOT EXISTS "confirmed_block" bigint;

CREATE INDEX IF NOT EXISTS "tab_authorizations_proposal_idx"
ON "tab_authorizations" ("proposal_id");

CREATE INDEX IF NOT EXISTS "tab_authorizations_proposal_hash_idx"
ON "tab_authorizations" ("proposal_hash");
