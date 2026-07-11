-- Development-only ETH Lisbon Team seed for local QA. Never runs automatically.
-- Usage:
--   psql "$DATABASE_URL" -v magic_user_id='did:ethr:...' -f scripts/dev-seed-eth-lisbon-team.sql
-- The organizer must already exist. ON_ERROR_STOP ensures this is all-or-nothing.

\set ON_ERROR_STOP on

with organizer as (
  select id, wallet_address from public.users where magic_user_id = :'magic_user_id' limit 1
),
created_tab as (
  insert into public.tabs (title, description, owner_user_id, network_chain_id, token_address, status, default_cap_base_units, default_expiry_hours)
  select 'ETH Lisbon Team', 'A development-only shared-expense scenario for local QA.', id, 421614,
    '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', 'active', 30000000, 48 from organizer returning *
),
members as (
  insert into public.tab_members (tab_id, user_id, display_name, wallet_address, role, join_status, readiness_status)
  select created_tab.id, organizer.id, 'Mira', organizer.wallet_address, 'owner', 'joined', 'reviewing' from created_tab, organizer
  union all
  select created_tab.id, null, name, null, 'member', 'joined', 'reviewing'
  from created_tab, (values ('Leo'), ('Camila'), ('Noah')) as team(name)
  returning *
),
expense_data (title, amount_base_units, payer_name, status, note) as (
  values
    ('Workshop venue', 40000000::bigint, 'Mira', 'confirmed'::public.expense_status, 'Lisbon venue hire'),
    ('Team dinner', 30000000::bigint, 'Leo', 'confirmed'::public.expense_status, 'Shared dinner'),
    ('Printing', 20000000::bigint, 'Camila', 'confirmed'::public.expense_status, 'Workshop materials'),
    ('Local transit', 30000000::bigint, 'Noah', 'confirmed'::public.expense_status, 'Group travel'),
    ('Coffee run', 20000000::bigint, 'Mira', 'confirmed'::public.expense_status, 'Morning session'),
    ('Equipment rental', 30000000::bigint, 'Leo', 'confirmed'::public.expense_status, 'Demo equipment'),
    ('Airport taxi', 4260000::bigint, 'Camila', 'disputed'::public.expense_status, 'Disputed fare — outside settlement')
),
created_expenses as (
  insert into public.expenses (tab_id, payer_member_id, title, note, amount_base_units, token_address, split_method, status, created_by_user_id)
  select created_tab.id, members.id, expense_data.title, expense_data.note, expense_data.amount_base_units,
    created_tab.token_address, 'custom', expense_data.status, organizer.id
  from expense_data join members on members.display_name = expense_data.payer_name cross join created_tab cross join organizer
  returning *
),
split_data (title, member_name) as (
  values ('Workshop venue', 'Mira'), ('Workshop venue', 'Leo'), ('Workshop venue', 'Camila'), ('Workshop venue', 'Noah'),
    ('Team dinner', 'Leo'), ('Team dinner', 'Camila'), ('Team dinner', 'Noah'),
    ('Printing', 'Camila'), ('Printing', 'Noah'),
    ('Local transit', 'Noah'), ('Local transit', 'Mira'), ('Local transit', 'Camila'),
    ('Coffee run', 'Mira'), ('Coffee run', 'Leo'),
    ('Equipment rental', 'Leo'), ('Equipment rental', 'Camila'), ('Equipment rental', 'Noah')
),
splits as (
  insert into public.expense_splits (expense_id, member_id, share_base_units)
  select created_expenses.id, members.id, 10000000
  from split_data join created_expenses using (title) join members on members.display_name = split_data.member_name
  returning *
),
confirmations as (
  insert into public.expense_confirmations (expense_id, member_id, status, reason)
  select created_expenses.id, members.id,
    case when created_expenses.status = 'disputed' then 'disputed'::public.expense_confirmation_status else 'confirmed'::public.expense_confirmation_status end,
    case when created_expenses.status = 'disputed' then 'Taxi is disputed and remains outside settlement.' else null end
  from created_expenses cross join members
),
counts as (
  select count(*) filter (where status = 'confirmed') as agreed, count(*) filter (where status = 'disputed') as disputed
  from created_expenses
)
select created_tab.id as tab_id, created_tab.title, counts.agreed, counts.disputed,
  'Verified seed shape: 11 implied obligations and 2 final transfers from the six confirmed custom-split expenses.' as verification_note
from created_tab cross join counts;
