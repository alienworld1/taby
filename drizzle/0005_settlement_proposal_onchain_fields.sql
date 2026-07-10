ALTER TABLE "settlement_proposals"
ADD COLUMN "registration_tx_hash" text,
ADD COLUMN "registered_at" timestamp with time zone,
ADD COLUMN "cancellation_tx_hash" text,
ADD COLUMN "onchain_cancelled_at" timestamp with time zone;
