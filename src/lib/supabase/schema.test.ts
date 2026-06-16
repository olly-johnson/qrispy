import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260528101000_milestone_1_core.sql",
);

describe("Milestone 1 Supabase migration", () => {
  it("creates core broker, portfolio, trade, and job tables with owner-scoped RLS", () => {
    const sql = readFileSync(migrationPath, "utf8");

    for (const table of [
      "profiles",
      "accounts",
      "broker_connections",
      "account_portfolio_snapshots",
      "broker_position_snapshots",
      "fills",
      "trades",
      "trade_fills",
      "job_runs",
      "job_steps",
      "sync_cursors",
    ]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    expect(sql).toContain("unique (user_id, idempotency_key)");
    expect(sql).toContain("unique (account_id, snapshot_at, source)");
    expect(sql).toContain("using ((select auth.uid()) = user_id)");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("grant select, insert, update, delete");
  });
});

describe("Supabase foreign key index migration", () => {
  it("adds indexes for relationship columns used by deletes and joins", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260528135000_add_foreign_key_indexes.sql",
      ),
      "utf8",
    );

    for (const indexName of [
      "account_equity_snapshots_user_id_idx",
      "account_portfolio_snapshots_user_id_idx",
      "fills_account_id_idx",
      "fills_import_batch_id_idx",
      "job_steps_job_run_id_idx",
      "job_steps_user_id_idx",
      "sync_cursors_account_id_idx",
      "trade_fills_fill_id_idx",
      "trade_fills_user_id_idx",
      "trades_account_id_idx",
    ]) {
      expect(sql).toContain(indexName);
    }
  });
});

describe("Market data cache migration", () => {
  it("adds OHLCV bar and provider request cache tables with RLS", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260531100000_add_market_data_cache.sql",
      ),
      "utf8",
    );

    for (const table of ["ohlcv_bars", "market_data_requests"]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }

    expect(sql).toContain(
      "unique (provider, symbol, timeframe, adjusted, bar_start_at)",
    );
    expect(sql).toContain("ohlcv_bars_symbol_timeframe_start_idx");
    expect(sql).toContain("market_data_requests_provider_symbol_created_idx");
    expect(sql).toContain("to authenticated");
    expect(sql).toContain("using (true)");
  });
});

describe("Trade stop groups migration", () => {
  it("adds per-entry stop groups with owner-scoped RLS", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260531200000_add_trade_stop_groups.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("create table public.trade_stop_groups");
    expect(sql).toContain("reconstruction_key text not null");
    expect(sql).toContain("unique (user_id, reconstruction_key, entry_date)");
    expect(sql).toContain("trade_stop_groups_user_trade_idx");
    expect(sql).toContain(
      "alter table public.trade_stop_groups enable row level security",
    );
    expect(sql).toContain("owner can select trade stop groups");
    expect(sql).toContain("owner can update trade stop groups");
  });
});

describe("Stockbee breadth rows migration", () => {
  it("adds persisted raw Stockbee rows with authenticated read access", () => {
    const migrationName = readdirSync(
      join(process.cwd(), "supabase", "migrations"),
    ).find((name) => name.endsWith("_add_stockbee_breadth_rows.sql"));
    expect(migrationName).toBeDefined();

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", migrationName!),
      "utf8",
    );

    expect(sql).toContain("create table public.stockbee_breadth_rows");
    expect(sql).toContain("date date primary key");
    expect(sql).toContain("up_4_percent numeric not null");
    expect(sql).toContain("down_4_percent numeric not null");
    expect(sql).toContain("ratio_5_day numeric not null");
    expect(sql).toContain("ratio_10_day numeric not null");
    expect(sql).toContain("up_13_in_34_days numeric not null");
    expect(sql).toContain("down_13_in_34_days numeric not null");
    expect(sql).toContain("source_url text not null");
    expect(sql).toContain("source_fetched_at timestamptz not null");
    expect(sql).toContain("stockbee_breadth_rows_date_desc_idx");
    expect(sql).toContain(
      "alter table public.stockbee_breadth_rows enable row level security",
    );
    expect(sql).toContain(
      "grant select on table public.stockbee_breadth_rows to authenticated",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.stockbee_breadth_rows to service_role",
    );
    expect(sql).toContain("authenticated can select stockbee breadth rows");
    expect(sql).toContain("using (true)");
  });
});

describe("Stock classifications migration", () => {
  it("adds SIC-derived sector classification cache with authenticated read access", () => {
    const migrationName = readdirSync(
      join(process.cwd(), "supabase", "migrations"),
    ).find((name) => name.endsWith("_add_stock_classifications.sql"));
    expect(migrationName).toBeDefined();

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", migrationName!),
      "utf8",
    );

    expect(sql).toContain("create table public.stock_classifications");
    expect(sql).toContain("ticker text primary key");
    expect(sql).toContain("name text not null");
    expect(sql).toContain("sector text not null");
    expect(sql).toContain("industry text not null");
    expect(sql).toContain("source text not null");
    expect(sql).toContain("source_updated_at timestamptz not null");
    expect(sql).toContain("stock_classifications_sector_industry_idx");
    expect(sql).toContain(
      "alter table public.stock_classifications enable row level security",
    );
    expect(sql).toContain(
      "grant select on table public.stock_classifications to authenticated",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.stock_classifications to service_role",
    );
    expect(sql).toContain("authenticated can select stock classifications");
    expect(sql).toContain("using (true)");
  });
});

describe("Cached sector breadth metrics migration", () => {
  it("adds an RPC for calculating cached historical breadth metrics in Postgres", () => {
    const migrationName = readdirSync(
      join(process.cwd(), "supabase", "migrations"),
    ).find((name) => name.endsWith("_add_cached_breadth_metrics_rpc.sql"));
    expect(migrationName).toBeDefined();

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", migrationName!),
      "utf8",
    );

    expect(sql).toContain(
      "create or replace function public.calculate_cached_breadth_metrics",
    );
    expect(sql).toContain("today_up4 integer");
    expect(sql).toContain("today_down4 integer");
    expect(sql).toContain("ohlcv_bars");
    expect(sql).toContain(
      "grant execute on function public.calculate_cached_breadth_metrics",
    );
  });

  it("adds freshness metadata and avoids double-counting the live as-of date", () => {
    const migrationName = readdirSync(
      join(process.cwd(), "supabase", "migrations"),
    ).find((name) =>
      name.endsWith("_add_cached_breadth_metrics_freshness.sql"),
    );
    expect(migrationName).toBeDefined();

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", migrationName!),
      "utf8",
    );

    expect(sql).toContain("history_end_date date");
    expect(sql).toContain("is_stale boolean");
    expect(sql).toContain("minimum_fresh_date");
    expect(sql.replace(/\s+/g, " ")).toContain(
      "from daily_counts where trade_date < as_of_date",
    );
  });
});

describe("Cached breadth metrics index migration", () => {
  it("adds a covering OHLCV index for the sector breadth RPC", () => {
    const migrationName = readdirSync(
      join(process.cwd(), "supabase", "migrations"),
    ).find((name) => name.endsWith("_add_cached_breadth_metrics_index.sql"));
    expect(migrationName).toBeDefined();

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", migrationName!),
      "utf8",
    );

    expect(sql).toContain(
      "create index if not exists ohlcv_bars_breadth_metrics_idx",
    );
    expect(sql.replace(/\s+/g, " ")).toContain(
      "provider, timeframe, adjusted, symbol, bar_start_at",
    );
    expect(sql).toContain("include (close)");
  });
});
