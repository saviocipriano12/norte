create table if not exists public.financial_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_account_id uuid references public.wallet_accounts(id) on delete set null,
  institution_name text not null,
  connection_type text not null check (connection_type in ('manual', 'import', 'open_finance')),
  status text not null default 'active' check (status in ('active', 'needs_attention', 'planned')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_connections enable row level security;
drop policy if exists "financial_connections_all_own" on public.financial_connections;
create policy "financial_connections_all_own" on public.financial_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
