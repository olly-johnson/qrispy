create table public.stock_classifications (
  ticker text primary key,
  name text not null,
  sector text not null,
  industry text not null,
  source text not null,
  source_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stock_classifications_sector_industry_idx
  on public.stock_classifications (sector, industry, ticker);

alter table public.stock_classifications enable row level security;

grant select on table public.stock_classifications to authenticated;

grant select, insert, update, delete on table public.stock_classifications to service_role;

create policy "authenticated can select stock classifications"
on public.stock_classifications for select to authenticated
using (true);
