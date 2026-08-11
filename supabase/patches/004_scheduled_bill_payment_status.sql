alter table public.scheduled_bills
  add column if not exists status text not null default 'pending' check (status in ('pending', 'paid')),
  add column if not exists paid_at timestamptz;

alter table public.goals
  add column if not exists target_date date;
