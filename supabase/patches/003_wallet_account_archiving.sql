alter table public.wallet_accounts
  add column if not exists is_archived boolean not null default false;
