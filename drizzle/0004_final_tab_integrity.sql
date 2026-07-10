alter table public.settlement_proposals
  add column if not exists schema_version integer not null default 1,
  add column if not exists proposal_version integer,
  add column if not exists canonical_payload_json jsonb,
  add column if not exists tab_id_hash text,
  add column if not exists tab_key text,
  add column if not exists included_expenses_hash text,
  add column if not exists excluded_expenses_hash text,
  add column if not exists transfers_hash text,
  add column if not exists chain_id integer,
  add column if not exists token_address text,
  add column if not exists settlement_contract_address text,
  add column if not exists coordinator_wallet_address text,
  add column if not exists locked_at timestamptz,
  add column if not exists cancelled_at timestamptz;

update public.settlement_proposals
set
  status = 'cancelled',
  cancelled_at = coalesce(cancelled_at, now()),
  updated_at = now()
where status in ('open', 'locked')
  and (
    proposal_hash !~ '^0x[0-9a-fA-F]{64}$'
    or canonical_payload_json is null
    or tab_id_hash is null
    or tab_key is null
  );

with numbered as (
  select
    id,
    row_number() over (partition by tab_id order by created_at, id)::integer as proposal_version
  from public.settlement_proposals
  where proposal_version is null
)
update public.settlement_proposals sp
set proposal_version = numbered.proposal_version
from numbered
where sp.id = numbered.id;

update public.settlement_proposals
set
  canonical_payload_json = coalesce(canonical_payload_json, '{}'::jsonb),
  tab_id_hash = coalesce(tab_id_hash, '0x0000000000000000000000000000000000000000000000000000000000000000'),
  tab_key = coalesce(tab_key, '0x0000000000000000000000000000000000000000000000000000000000000000'),
  included_expenses_hash = coalesce(included_expenses_hash, '0x0000000000000000000000000000000000000000000000000000000000000000'),
  excluded_expenses_hash = coalesce(excluded_expenses_hash, '0x0000000000000000000000000000000000000000000000000000000000000000'),
  transfers_hash = coalesce(transfers_hash, '0x0000000000000000000000000000000000000000000000000000000000000000'),
  chain_id = coalesce(chain_id, 421614),
  token_address = coalesce(token_address, '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d'),
  settlement_contract_address = coalesce(settlement_contract_address, '0x0000000000000000000000000000000000000000'),
  coordinator_wallet_address = coalesce(coordinator_wallet_address, '0x0000000000000000000000000000000000000000')
where status not in ('open', 'locked');

alter table public.settlement_proposals
  alter column proposal_version set not null,
  alter column canonical_payload_json set not null,
  alter column tab_id_hash set not null,
  alter column tab_key set not null,
  alter column included_expenses_hash set not null,
  alter column excluded_expenses_hash set not null,
  alter column transfers_hash set not null,
  alter column chain_id set not null,
  alter column token_address set not null,
  alter column settlement_contract_address set not null,
  alter column coordinator_wallet_address set not null;

create index if not exists settlement_proposals_tab_key_idx
  on public.settlement_proposals(tab_key);

create unique index if not exists settlement_proposals_tab_version_idx
  on public.settlement_proposals(tab_id, proposal_version);

create unique index if not exists settlement_proposals_one_active_idx
  on public.settlement_proposals(tab_id)
  where status in ('open', 'locked');
