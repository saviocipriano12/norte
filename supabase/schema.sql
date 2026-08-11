create extension if not exists "pgcrypto";

create type public.entry_context as enum ('Pessoal', 'Negocio', 'Compartilhado');
create type public.entry_type as enum ('income', 'expense');
create type public.entry_source as enum ('IA', 'Manual');
create type public.goal_status as enum ('active', 'paused', 'completed');
create type public.draft_status as enum ('pending', 'confirmed', 'discarded');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  onboarding_profile text check (onboarding_profile in ('personal', 'freelancer', 'business')),
  selected_pain_points text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  document_type text,
  document_number text,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  kind text not null default 'cash',
  currency text not null default 'BRL',
  balance numeric(14,2) not null default 0,
  is_business boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_account_id uuid references public.wallet_accounts(id) on delete set null,
  name text not null,
  limit_amount numeric(14,2) not null default 0,
  used_amount numeric(14,2) not null default 0,
  closing_day integer not null default 8 check (closing_day between 1 and 28),
  due_day integer not null default 15 check (due_day between 1 and 28),
  brand text not null default 'Credito',
  is_business boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.card_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  card_id uuid not null references public.cards(id) on delete cascade,
  wallet_account_id uuid references public.wallet_accounts(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 48),
  icon text not null default 'pricetag-outline',
  color text not null default '#5B8CFF',
  context public.entry_context,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

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

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  kind text not null default 'client',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Conversa Norte',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  text text not null,
  response_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  thread_id uuid references public.assistant_threads(id) on delete set null,
  source_message_id uuid references public.assistant_messages(id) on delete set null,
  title text not null,
  amount numeric(14,2) not null,
  type public.entry_type not null,
  context public.entry_context,
  question text,
  note text not null,
  occurred_at date,
  category text not null default 'Outros',
  status public.draft_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_account_id uuid references public.wallet_accounts(id) on delete set null,
  card_id uuid references public.cards(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  draft_id uuid references public.transaction_drafts(id) on delete set null,
  title text not null,
  amount numeric(14,2) not null,
  type public.entry_type not null,
  context public.entry_context not null,
  source public.entry_source not null,
  category text not null default 'Outros',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.scheduled_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  amount numeric(14,2) not null,
  due_date date not null,
  context public.entry_context not null default 'Pessoal',
  is_recurring boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  target_amount numeric(14,2) not null,
  current_amount numeric(14,2) not null default 0,
  status public.goal_status not null default 'active',
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.business_profiles enable row level security;
alter table public.wallet_accounts enable row level security;
alter table public.cards enable row level security;
alter table public.card_payments enable row level security;
alter table public.financial_categories enable row level security;
alter table public.financial_connections enable row level security;
alter table public.contacts enable row level security;
alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.transaction_drafts enable row level security;
alter table public.transactions enable row level security;
alter table public.scheduled_bills enable row level security;
alter table public.goals enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

create policy "business_profiles_all_own" on public.business_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "wallet_accounts_all_own" on public.wallet_accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cards_all_own" on public.cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "card_payments_all_own" on public.card_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "financial_categories_all_own" on public.financial_categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "financial_connections_all_own" on public.financial_connections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "contacts_all_own" on public.contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assistant_threads_all_own" on public.assistant_threads for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "assistant_messages_all_own" on public.assistant_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transaction_drafts_all_own" on public.transaction_drafts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_all_own" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "scheduled_bills_all_own" on public.scheduled_bills for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_all_own" on public.goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
