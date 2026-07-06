drop index if exists public.settlement_proposals_proposal_hash_idx;

create index if not exists settlement_proposals_proposal_hash_idx
  on public.settlement_proposals(proposal_hash);
