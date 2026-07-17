-- Development-only ETH Lisbon Team seed. Never runs from Next.js or a product route.
--
-- Required psql variables: magic_mira_user_id, magic_leo_user_id,
-- magic_camila_user_id, magic_noah_user_id, zerodev_account_type.
-- Run the read-only preflight first; this transaction intentionally refuses to
-- modify an existing ETH Lisbon Team tab.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE demo_member_bindings (
  role text PRIMARY KEY,
  display_name text NOT NULL,
  location_label text NOT NULL,
  magic_user_id text NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO demo_member_bindings (role, display_name, location_label, magic_user_id)
VALUES
  ('mira', 'Mira', 'India', :'magic_mira_user_id'),
  ('leo', 'Leo', 'Germany', :'magic_leo_user_id'),
  ('camila', 'Camila', 'Brazil', :'magic_camila_user_id'),
  ('noah', 'Noah', 'United States', :'magic_noah_user_id');

CREATE TEMP TABLE demo_seed_configuration (
  zerodev_account_type text NOT NULL
) ON COMMIT DROP;

INSERT INTO demo_seed_configuration (zerodev_account_type)
VALUES (:'zerodev_account_type');

DO $seed$
DECLARE
  configured_account_type text;
BEGIN
  SELECT zerodev_account_type INTO configured_account_type FROM demo_seed_configuration;
  IF configured_account_type NOT IN ('magic_eoa_7702', 'zerodev_kernel') THEN
    RAISE EXCEPTION 'Demo configuration does not match the deployed Arbitrum Sepolia settlement contract.';
  END IF;

  IF (SELECT count(*) FROM demo_member_bindings) <> 4
    OR (SELECT count(*) FROM public.users u JOIN demo_member_bindings b ON b.magic_user_id = u.magic_user_id) <> 4 THEN
    RAISE EXCEPTION 'Demo setup is missing one of the four prepared member accounts.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM demo_member_bindings b
    JOIN public.users u ON u.magic_user_id = b.magic_user_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.user_settlement_accounts usa
      WHERE usa.user_id = u.id
        AND usa.chain_id = 421614
        AND usa.account_type::text = configured_account_type
        AND usa.paymaster_policy_status = 'available'
        AND usa.delegation_status = 'ready'
        AND usa.settlement_address ~* '^0x[0-9a-f]{40}$'
    )
  ) THEN
    RAISE EXCEPTION 'A prepared member does not have a ready settlement account for this run.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tabs WHERE title = 'ETH Lisbon Team') THEN
    RAISE EXCEPTION 'An ETH Lisbon Team scenario already exists. Use a clean controlled database or the documented safe reset procedure.';
  END IF;
END
$seed$;

WITH resolved_members AS (
  SELECT b.role, b.display_name, u.id AS user_id, settlement_account.settlement_address AS wallet_address
  FROM demo_member_bindings b
  JOIN public.users u ON u.magic_user_id = b.magic_user_id
  JOIN LATERAL (
    SELECT usa.settlement_address
    FROM public.user_settlement_accounts usa
    WHERE usa.user_id = u.id
      AND usa.chain_id = 421614
      AND usa.account_type::text = (SELECT zerodev_account_type FROM demo_seed_configuration)
      AND usa.paymaster_policy_status = 'available'
      AND usa.delegation_status = 'ready'
    ORDER BY usa.updated_at DESC
    LIMIT 1
  ) settlement_account ON true
),
created_tab AS (
  INSERT INTO public.tabs (
    title, description, owner_user_id, network_chain_id, token_address,
    status, default_cap_base_units, default_expiry_hours
  )
  SELECT
    'ETH Lisbon Team',
    'A shared tab for a globally distributed team meeting in Lisbon.',
    (SELECT user_id FROM resolved_members WHERE role = 'mira'),
    421614,
    '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
    'active',
    30000000,
    48
  RETURNING *
),
members AS (
  INSERT INTO public.tab_members (
    tab_id, user_id, display_name, wallet_address, role, join_status, readiness_status
  )
  SELECT
    created_tab.id,
    resolved_members.user_id,
    resolved_members.display_name,
    resolved_members.wallet_address,
    CASE WHEN resolved_members.role = 'mira' THEN 'owner'::public.tab_member_role ELSE 'member'::public.tab_member_role END,
    'joined'::public.tab_member_join_status,
    'reviewing'::public.tab_member_readiness_status
  FROM created_tab
  CROSS JOIN resolved_members
  RETURNING *
),
expense_data (title, amount_base_units, payer_name, status, note) AS (
  VALUES
    ('Workshop venue', 40000000::bigint, 'Mira', 'confirmed'::public.expense_status, 'Lisbon venue hire'),
    ('Team dinner', 30000000::bigint, 'Leo', 'confirmed'::public.expense_status, 'Shared dinner'),
    ('Printing', 20000000::bigint, 'Camila', 'confirmed'::public.expense_status, 'Workshop materials'),
    ('Local transit', 30000000::bigint, 'Noah', 'confirmed'::public.expense_status, 'Group travel'),
    ('Coffee run', 20000000::bigint, 'Mira', 'confirmed'::public.expense_status, 'Morning session'),
    ('Equipment rental', 20000000::bigint, 'Leo', 'confirmed'::public.expense_status, 'Demo equipment'),
    ('Airport taxi', 4260000::bigint, 'Camila', 'disputed'::public.expense_status, 'Disputed fare — outside settlement')
),
created_expenses AS (
  INSERT INTO public.expenses (
    tab_id, payer_member_id, title, note, amount_base_units, token_address,
    split_method, status, created_by_user_id
  )
  SELECT
    created_tab.id, members.id, expense_data.title, expense_data.note,
    expense_data.amount_base_units, created_tab.token_address, 'custom',
    expense_data.status, created_tab.owner_user_id
  FROM expense_data
  JOIN members ON members.display_name = expense_data.payer_name
  CROSS JOIN created_tab
  RETURNING *
),
split_data (title, member_name, share_base_units) AS (
  VALUES
    ('Workshop venue', 'Mira', 10000000::bigint), ('Workshop venue', 'Leo', 22000000::bigint), ('Workshop venue', 'Camila', 3000000::bigint), ('Workshop venue', 'Noah', 5000000::bigint),
    ('Team dinner', 'Leo', 10000000::bigint), ('Team dinner', 'Camila', 10000000::bigint), ('Team dinner', 'Noah', 10000000::bigint),
    ('Printing', 'Camila', 6000000::bigint), ('Printing', 'Noah', 14000000::bigint),
    ('Local transit', 'Noah', 10000000::bigint), ('Local transit', 'Mira', 10000000::bigint), ('Local transit', 'Camila', 10000000::bigint),
    ('Coffee run', 'Mira', 10000000::bigint), ('Coffee run', 'Leo', 10000000::bigint),
    ('Equipment rental', 'Leo', 18000000::bigint), ('Equipment rental', 'Camila', 1000000::bigint), ('Equipment rental', 'Noah', 1000000::bigint)
),
splits AS (
  INSERT INTO public.expense_splits (expense_id, member_id, share_base_units)
  SELECT created_expenses.id, members.id, split_data.share_base_units
  FROM split_data
  JOIN created_expenses USING (title)
  JOIN members ON members.display_name = split_data.member_name
  RETURNING *
),
confirmations AS (
  INSERT INTO public.expense_confirmations (expense_id, member_id, status, reason)
  SELECT
    created_expenses.id,
    members.id,
    CASE WHEN created_expenses.status = 'disputed' THEN 'disputed'::public.expense_confirmation_status ELSE 'confirmed'::public.expense_confirmation_status END,
    CASE WHEN created_expenses.status = 'disputed' THEN 'Taxi is disputed and remains outside settlement.' ELSE NULL END
  FROM created_expenses
  CROSS JOIN members
),
scenario AS (
  SELECT id FROM created_tab
)
SELECT id AS tab_id, 'ETH Lisbon Team created. Verify: 6 included, 1 disputed, 11 implied obligations, 2 final transfers.' AS result
FROM scenario;

DO $verify$
DECLARE
  scenario_tab_id uuid;
  included_count integer;
  disputed_count integer;
  implied_obligation_count integer;
  final_transfer_count integer;
BEGIN
  SELECT id INTO scenario_tab_id FROM public.tabs WHERE title = 'ETH Lisbon Team';

  SELECT count(*) FILTER (WHERE status = 'confirmed'), count(*) FILTER (WHERE status = 'disputed')
  INTO included_count, disputed_count
  FROM public.expenses WHERE tab_id = scenario_tab_id;

  SELECT count(*) INTO implied_obligation_count
  FROM public.expense_splits es
  JOIN public.expenses e ON e.id = es.expense_id
  WHERE e.tab_id = scenario_tab_id AND e.status = 'confirmed' AND es.member_id <> e.payer_member_id;

  WITH balances AS (
    SELECT m.id,
      COALESCE((SELECT sum(e.amount_base_units) FROM public.expenses e WHERE e.tab_id = scenario_tab_id AND e.status = 'confirmed' AND e.payer_member_id = m.id), 0)
      - COALESCE((SELECT sum(es.share_base_units) FROM public.expense_splits es JOIN public.expenses e ON e.id = es.expense_id WHERE e.tab_id = scenario_tab_id AND e.status = 'confirmed' AND es.member_id = m.id), 0) AS net
    FROM public.tab_members m WHERE m.tab_id = scenario_tab_id
  )
  SELECT count(*) FILTER (WHERE net < 0) INTO final_transfer_count FROM balances;

  IF included_count <> 6 OR disputed_count <> 1 OR implied_obligation_count <> 11 OR final_transfer_count <> 2
    OR NOT EXISTS (SELECT 1 FROM public.expenses WHERE tab_id = scenario_tab_id AND title = 'Airport taxi' AND status = 'disputed' AND note ILIKE '%outside settlement%') THEN
    RAISE EXCEPTION 'The ETH Lisbon scenario no longer has the required agreed and disputed expense state.';
  END IF;
END
$verify$;

COMMIT;
