create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null,
  broker_account_id text not null,
  display_name text,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  unique (user_id, broker, broker_account_id)
);

create table public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null,
  display_name text,
  credential_mode text not null,
  status text not null,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, broker, display_name)
);

create table public.account_equity_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  snapshot_date date not null,
  equity numeric not null,
  buying_power numeric,
  cash numeric,
  source text not null,
  source_ref text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, snapshot_date, source, source_ref)
);

create table public.account_portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  snapshot_at timestamptz not null,
  snapshot_date date not null,
  equity numeric,
  cash numeric,
  buying_power numeric,
  long_market_value numeric,
  short_market_value numeric,
  gross_exposure numeric,
  net_exposure numeric,
  percent_invested numeric,
  day_pnl numeric,
  unrealized_pnl numeric,
  realized_pnl numeric,
  source text not null,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, snapshot_at, source)
);

create table public.broker_position_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  snapshot_at timestamptz not null,
  symbol text not null,
  asset_class text not null default 'equity',
  quantity numeric not null,
  side text,
  average_price numeric,
  last_price numeric,
  market_value numeric,
  unrealized_pnl numeric,
  currency text not null default 'USD',
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, snapshot_at, symbol, asset_class)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_path text,
  source_hash text,
  broker_account_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null,
  row_count integer not null default 0,
  error text,
  unique (user_id, source_type, source_path, source_hash)
);

create table public.fills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  import_batch_id uuid references public.import_batches(id),
  broker text not null,
  source_type text not null,
  source_fill_id text,
  idempotency_key text not null,
  symbol text not null,
  asset_class text not null default 'equity',
  side text not null,
  open_close text,
  quantity numeric not null,
  price numeric not null,
  executed_at timestamptz not null,
  executed_tz text not null default 'America/New_York',
  trade_date date not null,
  settlement_date date,
  currency text not null default 'USD',
  gross_proceeds numeric,
  net_proceeds numeric,
  commission numeric not null default 0,
  sec_fee numeric not null default 0,
  taf_fee numeric not null default 0,
  nscc_fee numeric not null default 0,
  nasdaq_fee numeric not null default 0,
  ecn_remove_fee numeric not null default 0,
  ecn_add_rebate numeric not null default 0,
  clearing_broker text,
  liquidity_flag text,
  note text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  reconstruction_key text not null,
  symbol text not null,
  asset_class text not null default 'equity',
  direction text not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  status text not null,
  entry_quantity numeric not null,
  max_abs_quantity numeric not null,
  avg_entry_price numeric,
  avg_exit_price numeric,
  realized_pnl numeric,
  total_fees numeric,
  initial_stop_price numeric,
  initial_risk_per_share numeric,
  initial_risk_amount numeric,
  account_equity_at_entry numeric,
  user_notes text,
  reconstruction_version integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reconstruction_key)
);

create table public.trade_fills (
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  fill_id uuid not null references public.fills(id) on delete cascade,
  allocated_quantity numeric not null,
  allocation_role text not null,
  allocation_price numeric not null,
  primary key (trade_id, fill_id, allocation_role)
);

create table public.job_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text not null,
  trade_date date,
  status text not null,
  idempotency_key text not null,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, job_type, idempotency_key)
);

create table public.job_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_run_id uuid not null references public.job_runs(id) on delete cascade,
  step_type text not null,
  status text not null,
  attempt_count integer not null default 0,
  locked_at timestamptz,
  completed_at timestamptz,
  error text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sync_cursors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  provider text not null,
  cursor_type text not null,
  cursor_value text,
  last_success_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, account_id, provider, cursor_type)
);

create index fills_account_symbol_time_idx
  on public.fills (user_id, account_id, symbol, executed_at, id);

create index trades_user_status_opened_idx
  on public.trades (user_id, status, opened_at desc);

create index positions_latest_idx
  on public.broker_position_snapshots (user_id, account_id, snapshot_at desc);

create index job_runs_user_created_idx
  on public.job_runs (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.broker_connections enable row level security;
alter table public.account_equity_snapshots enable row level security;
alter table public.account_portfolio_snapshots enable row level security;
alter table public.broker_position_snapshots enable row level security;
alter table public.import_batches enable row level security;
alter table public.fills enable row level security;
alter table public.trades enable row level security;
alter table public.trade_fills enable row level security;
alter table public.job_runs enable row level security;
alter table public.job_steps enable row level security;
alter table public.sync_cursors enable row level security;

grant select, insert, update, delete
on table
  public.profiles,
  public.accounts,
  public.broker_connections,
  public.account_equity_snapshots,
  public.account_portfolio_snapshots,
  public.broker_position_snapshots,
  public.import_batches,
  public.fills,
  public.trades,
  public.trade_fills,
  public.job_runs,
  public.job_steps,
  public.sync_cursors
to authenticated, service_role;

create policy "owner can select profiles"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "owner can update profiles"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "owner can select accounts"
on public.accounts for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can insert accounts"
on public.accounts for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "owner can update accounts"
on public.accounts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owner can select broker connections"
on public.broker_connections for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can update broker connections"
on public.broker_connections for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owner can select account equity snapshots"
on public.account_equity_snapshots for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can select account portfolio snapshots"
on public.account_portfolio_snapshots for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can select broker position snapshots"
on public.broker_position_snapshots for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can select import batches"
on public.import_batches for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can select fills"
on public.fills for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can select trades"
on public.trades for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can update trades"
on public.trades for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "owner can select trade fills"
on public.trade_fills for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can select job runs"
on public.job_runs for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can select job steps"
on public.job_steps for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owner can select sync cursors"
on public.sync_cursors for select to authenticated
using ((select auth.uid()) = user_id);
