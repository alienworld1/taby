create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  magic_user_id text not null,
  email text,
  display_name text not null,
  wallet_address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_magic_user_id_idx
  on public.users (magic_user_id);

alter table public.users enable row level security;
