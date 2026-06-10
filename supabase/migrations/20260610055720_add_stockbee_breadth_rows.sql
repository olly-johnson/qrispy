create table public.stockbee_breadth_rows (
  date date primary key,
  up_4_percent numeric not null,
  down_4_percent numeric not null,
  ratio_5_day numeric not null,
  ratio_10_day numeric not null,
  up_25_quarter numeric not null,
  down_25_quarter numeric not null,
  up_25_month numeric not null,
  down_25_month numeric not null,
  up_50_month numeric not null,
  down_50_month numeric not null,
  up_13_in_34_days numeric not null,
  down_13_in_34_days numeric not null,
  universe_count numeric not null,
  t2108 numeric not null,
  sp500 numeric not null,
  source_url text not null,
  source_fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stockbee_breadth_rows_date_desc_idx
  on public.stockbee_breadth_rows (date desc);

alter table public.stockbee_breadth_rows enable row level security;

grant select on table public.stockbee_breadth_rows to authenticated;

grant select, insert, update, delete on table public.stockbee_breadth_rows to service_role;

create policy "authenticated can select stockbee breadth rows"
on public.stockbee_breadth_rows for select to authenticated
using (true);
