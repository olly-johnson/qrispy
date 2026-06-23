create table public.market_daily_briefs (
  market_date date primary key,
  headline text not null,
  notable_news jsonb not null,
  events jsonb not null,
  sources jsonb not null,
  generated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.market_daily_briefs enable row level security;

grant select on table public.market_daily_briefs to authenticated;
grant select, insert, update, delete on table public.market_daily_briefs to service_role;

create policy "authenticated can select market daily briefs"
on public.market_daily_briefs for select to authenticated
using (true);
