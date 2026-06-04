create table public.trade_stop_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  reconstruction_key text not null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  symbol text not null,
  direction text not null,
  entry_date date not null,
  quantity numeric not null,
  avg_entry_price numeric,
  stop_loss_price numeric,
  risk_per_share numeric,
  risk_amount numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reconstruction_key, entry_date)
);

create index trade_stop_groups_user_trade_idx
  on public.trade_stop_groups (user_id, trade_id, entry_date);

alter table public.trade_stop_groups enable row level security;

grant select, insert, update, delete
on table public.trade_stop_groups
to authenticated, service_role;

create policy "owner can select trade stop groups"
on public.trade_stop_groups for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can update trade stop groups"
on public.trade_stop_groups for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
