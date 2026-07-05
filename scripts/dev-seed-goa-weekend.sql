-- Development-only seed for local QA.
-- Usage:
--   psql "$DATABASE_URL" \
--     -v magic_user_id='did:ethr:...' \
--     -f scripts/dev-seed-goa-weekend.sql
--
-- This script requires an existing users.magic_user_id and never runs automatically.

\set ON_ERROR_STOP on

with organizer as (
  select id, display_name, wallet_address
  from public.users
  where magic_user_id = :'magic_user_id'
  limit 1
),
created_tab as (
  insert into public.tabs (
    title,
    description,
    owner_user_id,
    network_chain_id,
    token_address,
    status,
    default_cap_base_units,
    default_expiry_hours
  )
  select
    'Goa Weekend',
    'Shared trip costs for local development QA.',
    organizer.id,
    421614,
    '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
    'active',
    30000000,
    48
  from organizer
  returning *
),
owner_member as (
  insert into public.tab_members (
    tab_id,
    user_id,
    display_name,
    wallet_address,
    role,
    join_status,
    readiness_status
  )
  select
    created_tab.id,
    organizer.id,
    organizer.display_name,
    lower(organizer.wallet_address),
    'owner',
    'joined',
    'reviewing'
  from created_tab, organizer
  returning *
),
invited_members as (
  insert into public.tab_members (tab_id, display_name, role, join_status, readiness_status)
  select created_tab.id, member_name, 'member', 'invited', 'not_ready'
  from created_tab,
  unnest(array['Mira', 'Dev', 'Anya']) as member_name
  returning *
),
dinner as (
  insert into public.expenses (
    tab_id,
    payer_member_id,
    title,
    note,
    amount_base_units,
    token_address,
    split_method,
    status,
    created_by_user_id
  )
  select
    created_tab.id,
    owner_member.id,
    'Beach dinner',
    'First night together.',
    18400000,
    created_tab.token_address,
    'equal',
    'pending',
    organizer.id
  from created_tab, owner_member, organizer
  returning *
),
dinner_members as (
  select id from owner_member
  union all
  select id from invited_members
),
dinner_splits as (
  insert into public.expense_splits (expense_id, member_id, share_base_units)
  select dinner.id, dinner_members.id, 4600000
  from dinner, dinner_members
  returning *
),
dinner_confirmations as (
  insert into public.expense_confirmations (expense_id, member_id, status)
  select dinner.id, dinner_members.id, case when dinner_members.id = owner_member.id then 'confirmed' else 'pending' end
  from dinner, dinner_members, owner_member
  returning *
),
tab_event as (
  insert into public.activity_events (tab_id, actor_user_id, event_type, event_data)
  select created_tab.id, organizer.id, 'tab_created', jsonb_build_object('title', created_tab.title)
  from created_tab, organizer
),
member_event as (
  insert into public.activity_events (tab_id, actor_user_id, event_type, event_data)
  select created_tab.id, organizer.id, 'member_added', jsonb_build_object('count', 3)
  from created_tab, organizer
),
expense_event as (
  insert into public.activity_events (tab_id, actor_user_id, event_type, event_data)
  select
    created_tab.id,
    organizer.id,
    'expense_added',
    jsonb_build_object('expenseId', dinner.id, 'title', dinner.title, 'amountBaseUnits', dinner.amount_base_units::text)
  from created_tab, organizer, dinner
)
select
  created_tab.id as tab_id,
  created_tab.title,
  (select count(*) from public.tab_members where tab_id = created_tab.id) as member_count
from created_tab;
