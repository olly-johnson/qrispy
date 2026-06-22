create table public.trade_review_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  custom_name text,
  symbol text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.trade_review_group_members (
  group_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  reconstruction_key text not null,
  created_at timestamptz not null default now(),
  primary key (group_id, reconstruction_key),
  unique (user_id, reconstruction_key),
  foreign key (group_id, user_id)
    references public.trade_review_groups(id, user_id) on delete cascade
);

alter table public.trade_review_groups enable row level security;
alter table public.trade_review_group_members enable row level security;

grant select, insert, update, delete
on table public.trade_review_groups
to authenticated, service_role;

grant select, insert, update, delete
on table public.trade_review_group_members
to authenticated, service_role;

create policy "owner can select trade review groups"
on public.trade_review_groups for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can insert trade review groups"
on public.trade_review_groups for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "owner can update trade review groups"
on public.trade_review_groups for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owner can delete trade review groups"
on public.trade_review_groups for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can select trade review group members"
on public.trade_review_group_members for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can insert trade review group members"
on public.trade_review_group_members for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "owner can update trade review group members"
on public.trade_review_group_members for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owner can delete trade review group members"
on public.trade_review_group_members for delete to authenticated
using ((select auth.uid()) = user_id);
