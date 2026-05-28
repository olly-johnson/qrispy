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
