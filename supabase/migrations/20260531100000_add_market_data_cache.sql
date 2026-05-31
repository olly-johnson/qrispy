create table public.ohlcv_bars (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  symbol text not null,
  timeframe text not null,
  adjusted boolean not null default false,
  bar_start_at timestamptz not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null default 0,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (provider, symbol, timeframe, adjusted, bar_start_at)
);

create table public.market_data_requests (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  symbol text not null,
  timeframe text not null,
  adjusted boolean not null default false,
  requested_from date not null,
  requested_to date not null,
  status text not null,
  error text,
  bar_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index ohlcv_bars_symbol_timeframe_start_idx
  on public.ohlcv_bars (symbol, timeframe, adjusted, bar_start_at);

create index market_data_requests_provider_symbol_created_idx
  on public.market_data_requests (provider, symbol, created_at desc);

alter table public.ohlcv_bars enable row level security;
alter table public.market_data_requests enable row level security;

grant select
on table public.ohlcv_bars, public.market_data_requests
to authenticated;

grant select, insert, update, delete
on table public.ohlcv_bars, public.market_data_requests
to service_role;

create policy "authenticated can select ohlcv bars"
on public.ohlcv_bars for select to authenticated
using (true);

create policy "authenticated can select market data requests"
on public.market_data_requests for select to authenticated
using (true);
