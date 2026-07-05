create extension if not exists pgcrypto;

do $$
begin
  create type public.tab_status as enum ('draft', 'active', 'review', 'locked', 'settling', 'settled', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.tab_member_role as enum ('owner', 'member');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.tab_member_join_status as enum ('invited', 'joined', 'removed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.tab_member_readiness_status as enum ('not_ready', 'reviewing', 'ready', 'needs_action', 'settled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.expense_split_method as enum ('equal', 'custom');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.expense_status as enum ('pending', 'confirmed', 'disputed', 'excluded', 'locked', 'settled');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.expense_confirmation_status as enum ('pending', 'confirmed', 'disputed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.authorization_method as enum ('erc20_allowance', 'zerodev_session_key');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.settlement_proposal_status as enum ('draft', 'open', 'locked', 'cancelled', 'executed', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.settlement_transaction_status as enum ('submitted', 'confirmed', 'failed');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.tabs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 2 and 80),
  description text check (description is null or char_length(trim(description)) <= 240),
  owner_user_id uuid not null references public.users(id),
  network_chain_id integer not null check (network_chain_id = 421614),
  token_address text not null check (token_address ~* '^0x[0-9a-f]{40}$'),
  status public.tab_status not null default 'active',
  default_cap_base_units bigint not null check (default_cap_base_units > 0),
  default_expiry_hours integer not null check (default_expiry_hours > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz
);

create table if not exists public.tab_members (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id),
  user_id uuid references public.users(id),
  display_name text not null check (char_length(trim(display_name)) between 2 and 40),
  wallet_address text check (wallet_address is null or wallet_address ~* '^0x[0-9a-f]{40}$'),
  role public.tab_member_role not null default 'member',
  join_status public.tab_member_join_status not null default 'invited',
  readiness_status public.tab_member_readiness_status not null default 'not_ready',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id),
  payer_member_id uuid not null references public.tab_members(id),
  title text not null check (char_length(trim(title)) between 2 and 80),
  note text check (note is null or char_length(trim(note)) <= 240),
  amount_base_units bigint not null check (amount_base_units > 0),
  token_address text not null check (token_address ~* '^0x[0-9a-f]{40}$'),
  split_method public.expense_split_method not null,
  status public.expense_status not null default 'pending',
  created_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id),
  member_id uuid not null references public.tab_members(id),
  share_base_units bigint not null check (share_base_units > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.expense_confirmations (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id),
  member_id uuid not null references public.tab_members(id),
  status public.expense_confirmation_status not null default 'pending',
  reason text check (reason is null or char_length(trim(reason)) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tab_authorizations (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id),
  member_id uuid not null references public.tab_members(id),
  wallet_address text not null check (wallet_address ~* '^0x[0-9a-f]{40}$'),
  token_address text not null check (token_address ~* '^0x[0-9a-f]{40}$'),
  settlement_contract_address text not null check (settlement_contract_address ~* '^0x[0-9a-f]{40}$'),
  cap_base_units bigint not null check (cap_base_units > 0),
  max_single_settlement_base_units bigint not null check (max_single_settlement_base_units > 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  authorization_method public.authorization_method not null default 'erc20_allowance',
  allowance_tx_hash text check (allowance_tx_hash is null or allowance_tx_hash ~* '^0x[0-9a-f]{64}$'),
  session_key_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cap_base_units >= max_single_settlement_base_units)
);

create table if not exists public.settlement_proposals (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id),
  proposal_hash text not null,
  status public.settlement_proposal_status not null default 'draft',
  included_expense_ids uuid[] not null,
  excluded_expense_ids uuid[] not null,
  net_balances_json jsonb not null default '{}'::jsonb,
  transfers_json jsonb not null default '[]'::jsonb,
  total_amount_base_units bigint not null default 0 check (total_amount_base_units >= 0),
  created_by_user_id uuid not null references public.users(id),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  executed_at timestamptz
);

create table if not exists public.settlement_transactions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.settlement_proposals(id),
  tab_id uuid not null references public.tabs(id),
  chain_id integer not null check (chain_id = 421614),
  token_address text not null check (token_address ~* '^0x[0-9a-f]{40}$'),
  settlement_contract_address text not null check (settlement_contract_address ~* '^0x[0-9a-f]{40}$'),
  tx_hash text not null check (tx_hash ~* '^0x[0-9a-f]{64}$'),
  block_number bigint check (block_number is null or block_number > 0),
  status public.settlement_transaction_status not null,
  error_message text check (error_message is null or char_length(trim(error_message)) <= 240),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  tab_id uuid not null references public.tabs(id),
  actor_user_id uuid references public.users(id),
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tabs_owner_user_id_idx on public.tabs(owner_user_id);
create index if not exists tabs_status_idx on public.tabs(status);

create index if not exists tab_members_tab_id_idx on public.tab_members(tab_id);
create index if not exists tab_members_user_id_idx on public.tab_members(user_id);
create unique index if not exists tab_members_tab_user_idx
  on public.tab_members(tab_id, user_id)
  where user_id is not null;

create index if not exists expenses_tab_id_idx on public.expenses(tab_id);
create index if not exists expenses_payer_member_id_idx on public.expenses(payer_member_id);
create index if not exists expenses_status_idx on public.expenses(status);

create index if not exists expense_splits_expense_id_idx on public.expense_splits(expense_id);
create index if not exists expense_splits_member_id_idx on public.expense_splits(member_id);
create unique index if not exists expense_splits_expense_member_idx
  on public.expense_splits(expense_id, member_id);

create index if not exists expense_confirmations_expense_id_idx on public.expense_confirmations(expense_id);
create index if not exists expense_confirmations_member_id_idx on public.expense_confirmations(member_id);
create unique index if not exists expense_confirmations_expense_member_idx
  on public.expense_confirmations(expense_id, member_id);

create index if not exists tab_authorizations_tab_id_idx on public.tab_authorizations(tab_id);
create index if not exists tab_authorizations_member_id_idx on public.tab_authorizations(member_id);

create index if not exists settlement_proposals_tab_id_idx on public.settlement_proposals(tab_id);
create unique index if not exists settlement_proposals_proposal_hash_idx
  on public.settlement_proposals(proposal_hash);

create index if not exists settlement_transactions_proposal_id_idx
  on public.settlement_transactions(proposal_id);
create index if not exists settlement_transactions_tab_id_idx on public.settlement_transactions(tab_id);
create unique index if not exists settlement_transactions_chain_tx_idx
  on public.settlement_transactions(chain_id, tx_hash);

create index if not exists activity_events_tab_id_created_at_idx
  on public.activity_events(tab_id, created_at desc);
create index if not exists activity_events_actor_user_id_idx on public.activity_events(actor_user_id);

alter table public.users enable row level security;
alter table public.tabs enable row level security;
alter table public.tab_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.expense_confirmations enable row level security;
alter table public.tab_authorizations enable row level security;
alter table public.settlement_proposals enable row level security;
alter table public.settlement_transactions enable row level security;
alter table public.activity_events enable row level security;

revoke all on table
  public.users,
  public.tabs,
  public.tab_members,
  public.expenses,
  public.expense_splits,
  public.expense_confirmations,
  public.tab_authorizations,
  public.settlement_proposals,
  public.settlement_transactions,
  public.activity_events
from anon, authenticated;

grant select, insert, update, delete on table
  public.users,
  public.tabs,
  public.tab_members,
  public.expenses,
  public.expense_splits,
  public.expense_confirmations,
  public.tab_authorizations,
  public.settlement_proposals,
  public.settlement_transactions,
  public.activity_events
to service_role;
