# Data Model

Supabase Postgres replaces SQLite as the system of record. The schema should be written as migrations and designed for single-user use now, with a clean path to multi-user later.

Every user-owned table includes `user_id uuid not null references auth.users(id)`. RLS policies should restrict normal browser/API access to the authenticated owner. Server-only job steps may use service-role access, but service keys must never be exposed client-side.

## Core Tables

```sql
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

create index fills_account_symbol_time_idx
  on public.fills (user_id, account_id, symbol, executed_at, id);
```

## Trades

```sql
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
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
  updated_at timestamptz not null default now()
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
```

## Evaluations

```sql
create table public.trade_classifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  setup_type text not null,
  setup_confidence numeric not null,
  market_regime text,
  sector_context text,
  thesis_summary text,
  evidence jsonb not null,
  prompt_version text not null,
  model text not null,
  created_at timestamptz not null default now(),
  unique (trade_id, prompt_version)
);

create table public.quantitative_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  classification_id uuid references public.trade_classifications(id),
  evaluation_version text not null,
  scores jsonb not null,
  metrics jsonb not null,
  missing_inputs jsonb not null,
  overall_score numeric,
  created_at timestamptz not null default now(),
  unique (trade_id, evaluation_version)
);

create table public.narrative_evaluations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  classification_id uuid references public.trade_classifications(id),
  quantitative_evaluation_id uuid references public.quantitative_evaluations(id),
  prompt_version text not null,
  model text not null,
  narrative_markdown text not null,
  cited_kb_files jsonb not null,
  created_at timestamptz not null default now(),
  unique (trade_id, prompt_version)
);

create table public.meta_pattern_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_label text not null,
  trade_count integer not null,
  trade_ids jsonb not null,
  prompt_version text not null,
  model text not null,
  report_markdown text not null,
  created_at timestamptz not null default now()
);
```

## Market Data Cache

Market data can be shared across users later because OHLCV bars are not user-private. For now, keep it in `public` but do not expose direct writes to clients.

```sql
create table public.ohlcv_bars (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  symbol text not null,
  timeframe text not null,
  session text not null,
  bar_start timestamptz not null,
  bar_end timestamptz not null,
  adjusted boolean not null,
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume numeric not null,
  vwap numeric,
  transaction_count integer,
  source_request_id text,
  fetched_at timestamptz not null default now(),
  unique (provider, symbol, timeframe, session, bar_start, adjusted)
);

create table public.market_data_requests (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  endpoint text not null,
  cache_key text not null,
  requested_at timestamptz not null default now(),
  status text not null,
  response_hash text,
  error text,
  unique (provider, endpoint, cache_key)
);
```

## KB, Reports, Jobs, Chat

```sql
create table public.kb_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_layer text not null,
  raw_path text not null,
  storage_bucket text,
  storage_object_path text,
  source_url text,
  title text,
  author text,
  published_date date,
  content_hash text not null,
  source_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, knowledge_layer, raw_path)
);

create table public.kb_wiki_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  knowledge_layer text not null,
  wiki_path text not null,
  storage_bucket text,
  storage_object_path text,
  title text not null,
  content_hash text not null,
  compile_version text not null,
  source_ids jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, knowledge_layer, wiki_path)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null,
  title text not null,
  report_markdown text not null,
  trade_date date,
  trade_ids jsonb,
  created_at timestamptz not null default now()
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

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null,
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
```

## RLS Baseline

All user-owned tables:

```sql
alter table public.fills enable row level security;

create policy "owner can read fills"
on public.fills for select
using (auth.uid() = user_id);

create policy "owner can insert fills"
on public.fills for insert
with check (auth.uid() = user_id);
```

Repeat the owner policy pattern for accounts, trades, evaluations, reports, KB metadata, jobs, and chat. For market-data cache tables, use read-only client policies or keep access server-only.

## Position Reconstruction

Definition: a trade starts when net quantity for an account/symbol leaves zero and ends when net quantity returns to zero. Direct flips are split at the zero crossing.

Pseudocode:

```text
for each user_id, account_id, symbol ordered by executed_at, fill_id:
  net_qty = 0
  current_trade = null

  for fill in fills:
    remaining_qty = signed_quantity(fill)

    while remaining_qty != 0:
      if net_qty == 0:
        current_trade = start_trade(fill, direction = sign(remaining_qty))

      if sign(net_qty) == 0 or sign(net_qty) == sign(remaining_qty):
        allocate all remaining_qty to current_trade as entry/add
        net_qty += remaining_qty
        remaining_qty = 0
      else:
        closing_qty = min(abs(net_qty), abs(remaining_qty))
        allocate closing_qty to current_trade as exit/reduce
        net_qty += sign(remaining_qty) * closing_qty
        remaining_qty -= sign(remaining_qty) * closing_qty

        if net_qty == 0:
          close current_trade at this fill timestamp
          current_trade = null

        if remaining_qty != 0:
          continue loop
```

Flip example:

| Fill | Side | Qty | Signed | Net Before | Net After | Allocation |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | Buy | 20 | +20 | 0 | +20 | Trade A long entry 20 |
| 2 | Sell | 40 | -40 | +20 | -20 | 20 closes Trade A, 20 opens Trade B short |
| 3 | Buy | 20 | +20 | -20 | 0 | Trade B short exit 20 |

`trade_fills` stores two allocations for fill 2.
