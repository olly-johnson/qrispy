import { describe, expect, it, vi } from "vitest";

import {
  groupStockbeeBreadthRowsByYear,
  readStockbeeBreadthRows,
  selectedStockbeeBreadthYear,
  stockbeeBreadthUpsertPayload,
  syncStockbeeBreadthRows,
} from "./stockbee-breadth-store";
import type { StockbeeBreadthRow } from "./breadth";

const sourceUrl = "https://example.test/stockbee.csv";
const fetchedAt = new Date("2026-06-10T12:00:00.000Z");

describe("stockbeeBreadthUpsertPayload", () => {
  it("maps raw Stockbee CSV fields to persisted column names", () => {
    expect(
      stockbeeBreadthUpsertPayload(row({ date: "2026-06-09" }), sourceUrl, fetchedAt),
    ).toEqual({
      date: "2026-06-09",
      down_13_in_34_days: 11,
      down_25_month: 6,
      down_25_quarter: 4,
      down_4_percent: 2,
      down_50_month: 8,
      ratio_10_day: 1.2,
      ratio_5_day: 1.1,
      source_fetched_at: "2026-06-10T12:00:00.000Z",
      source_url: sourceUrl,
      sp500: 7553.68,
      t2108: 39.31,
      universe_count: 6462,
      up_13_in_34_days: 10,
      up_25_month: 5,
      up_25_quarter: 3,
      up_4_percent: 1,
      up_50_month: 7,
      updated_at: "2026-06-10T12:00:00.000Z",
    });
  });
});

describe("syncStockbeeBreadthRows", () => {
  it("upserts rows by date", async () => {
    const client = fakeStockbeeClient([]);

    await syncStockbeeBreadthRows({
      client,
      fetchedAt,
      rows: [row({ date: "2026-06-10" }), row({ date: "2026-06-09" })],
      sourceUrl,
    });

    expect(client.upsertedRows).toHaveLength(2);
    expect(client.upsertOptions).toEqual({ onConflict: "date" });
  });

  it("does not call Supabase when there are no parsed rows", async () => {
    const client = fakeStockbeeClient([]);

    await syncStockbeeBreadthRows({ client, fetchedAt, rows: [], sourceUrl });

    expect(client.upsertedRows).toEqual([]);
  });
});

describe("readStockbeeBreadthRows", () => {
  it("maps persisted rows back to StockbeeBreadthRow in descending date order", async () => {
    const client = fakeStockbeeClient([
      {
        date: "2026-06-10",
        down_13_in_34_days: 11,
        down_25_month: 6,
        down_25_quarter: 4,
        down_4_percent: 2,
        down_50_month: 8,
        ratio_10_day: 1.2,
        ratio_5_day: 1.1,
        sp500: 7553.68,
        t2108: 39.31,
        universe_count: 6462,
        up_13_in_34_days: 10,
        up_25_month: 5,
        up_25_quarter: 3,
        up_4_percent: 1,
        up_50_month: 7,
      },
    ]);

    await expect(readStockbeeBreadthRows({ client })).resolves.toEqual([
      row({ date: "2026-06-10" }),
    ]);
    expect(client.orderCall).toEqual(["date", { ascending: false }]);
  });
});

describe("groupStockbeeBreadthRowsByYear", () => {
  it("groups rows into newest-first year buckets", () => {
    expect(
      groupStockbeeBreadthRowsByYear([
        row({ date: "2026-06-10" }),
        row({ date: "2025-12-31" }),
        row({ date: "2025-01-02" }),
      ]),
    ).toEqual([
      { rows: [row({ date: "2026-06-10" })], year: "2026" },
      {
        rows: [row({ date: "2025-12-31" }), row({ date: "2025-01-02" })],
        year: "2025",
      },
    ]);
  });
});

describe("selectedStockbeeBreadthYear", () => {
  it("uses a valid requested year or falls back to the newest year", () => {
    const groups = groupStockbeeBreadthRowsByYear([
      row({ date: "2026-06-10" }),
      row({ date: "2025-12-31" }),
    ]);

    expect(selectedStockbeeBreadthYear(groups, "2025")).toBe("2025");
    expect(selectedStockbeeBreadthYear(groups, "2024")).toBe("2026");
    expect(selectedStockbeeBreadthYear(groups, undefined)).toBe("2026");
  });
});

function row(overrides: Partial<StockbeeBreadthRow> = {}): StockbeeBreadthRow {
  return {
    date: "2026-06-10",
    down13In34Days: 11,
    down25Month: 6,
    down25Quarter: 4,
    down4Percent: 2,
    down50Month: 8,
    ratio10Day: 1.2,
    ratio5Day: 1.1,
    sp500: 7553.68,
    t2108: 39.31,
    universeCount: 6462,
    up13In34Days: 10,
    up25Month: 5,
    up25Quarter: 3,
    up4Percent: 1,
    up50Month: 7,
    ...overrides,
  };
}

function fakeStockbeeClient(storedRows: Record<string, unknown>[]) {
  const client = {
    orderCall: null as unknown,
    upsertedRows: [] as Record<string, unknown>[],
    upsertOptions: null as unknown,
    from(table: string) {
      expect(table).toBe("stockbee_breadth_rows");

      return {
        select: () => ({
          order: vi.fn((column, options) => {
            client.orderCall = [column, options];
            return Promise.resolve({ data: storedRows, error: null });
          }),
        }),
        upsert: vi.fn((rows, options) => {
          client.upsertedRows.push(...rows);
          client.upsertOptions = options;
          return Promise.resolve({ error: null });
        }),
      };
    },
  };

  return client;
}
