alter table public.cards
  add column if not exists closing_day integer not null default 8 check (closing_day between 1 and 28),
  add column if not exists due_day integer not null default 15 check (due_day between 1 and 28),
  add column if not exists brand text not null default 'Credito',
  add column if not exists is_business boolean not null default false;

create table if not exists public.card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  wallet_account_id uuid references public.wallet_accounts(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.card_payments enable row level security;
drop policy if exists "card_payments_all_own" on public.card_payments;
create policy "card_payments_all_own" on public.card_payments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
