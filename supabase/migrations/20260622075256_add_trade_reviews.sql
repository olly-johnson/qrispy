create type public.trade_setup_type as enum (
  'breakout',
  'episodic_pivot',
  'parabolic_short',
  'mean_reversion',
  'backside',
  'other'
);

create type public.trade_grade as enum ('A', 'B', 'C', 'D', 'F');

create table public.trade_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  setup_type public.trade_setup_type,
  grade public.trade_grade,
  summary text,
  what_went_well text,
  what_went_wrong text,
  lessons_learned text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trade_id)
);

create index trade_reviews_user_created_idx
  on public.trade_reviews (user_id, created_at desc);

alter table public.trade_reviews enable row level security;

grant select, insert, update, delete
on table public.trade_reviews
to authenticated, service_role;

create policy "owner can select trade reviews"
on public.trade_reviews for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can insert trade reviews"
on public.trade_reviews for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "owner can update trade reviews"
on public.trade_reviews for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owner can delete trade reviews"
on public.trade_reviews for delete to authenticated
using ((select auth.uid()) = user_id);
