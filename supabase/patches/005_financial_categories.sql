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

alter table public.financial_categories enable row level security;

drop policy if exists "financial_categories_all_own" on public.financial_categories;
create policy "financial_categories_all_own" on public.financial_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
