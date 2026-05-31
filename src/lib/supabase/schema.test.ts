import { readFileSync } from "node:fs";
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
