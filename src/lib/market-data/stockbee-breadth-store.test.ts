import { describe, expect, it, vi } from "vitest";

import {
  groupStockbeeBreadthRowsByYear,
  loadStockbeeBreadthHistory,
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

describe("loadStockbeeBreadthHistory", () => {
  it("syncs live rows, then renders persisted rows grouped by selected year", async () => {
    const persisted = [
      storedRow({ date: "2026-06-10" }),
      storedRow({ date: "2025-12-31" }),
    ];
    const client = fakeStockbeeClient(persisted);
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => csvForDates(["6/10/2026", "12/31/2025"]),
    });

    await expect(
      loadStockbeeBreadthHistory({
        client,
        fetcher,
        requestedYear: "2025",
        sourceUrl,
      }),
    ).resolves.toMatchObject({
      groups: [
        { rows: [row({ date: "2026-06-10" })], year: "2026" },
        { rows: [row({ date: "2025-12-31" })], year: "2025" },
      ],
      liveRows: [row({ date: "2026-06-10" }), row({ date: "2025-12-31" })],
      selectedRows: [row({ date: "2025-12-31" })],
      selectedYear: "2025",
      syncError: null,
    });
    expect(client.upsertedRows.map((item) => item.date)).toEqual([
      "2026-06-10",
      "2025-12-31",
    ]);
  });

  it("syncs the current published CSV by default instead of every workbook sheet", async () => {
    const client = fakeStockbeeClient([
      storedRow({ date: "2026-06-10" }),
    ]);
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe(
        "https://docs.google.com/spreadsheet/pub?key=0Am_cU8NLIU20dEhiQnVHN3Nnc3B1S3J6eGhKZFo0N3c&output=csv",
      );

      return response(csvForDates(["6/10/2026"]));
    });

    const result = await loadStockbeeBreadthHistory({
      client,
      fetcher,
      requestedYear: undefined,
    });

    expect(result.syncError).toBeNull();
    expect(result.liveRows.map((item) => item.date)).toEqual(["2026-06-10"]);
    expect(result.selectedRows).toEqual([row({ date: "2026-06-10" })]);
    expect(client.upsertedRows.map((item) => item.date)).toEqual(["2026-06-10"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("can sync rows from every discovered workbook year sheet for explicit backfills", async () => {
    const client = fakeStockbeeClient([
      storedRow({ date: "2026-06-10" }),
      storedRow({ date: "2008-12-31" }),
    ]);
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("output=html")) {
        return response(
          [
            'items.push({name: "2026", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE\\/pubhtml\\/sheet?headers\\x3dfalse&gid=1082103394", gid: "1082103394",initialSheet: ("1082103394" == gid)});',
            'items.push({name: "Copy of 2008 reformatted", pageUrl: "https:\\/\\/docs.google.com\\/spreadsheets\\/d\\/1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE\\/pubhtml\\/sheet?headers\\x3dfalse&gid=1770823350", gid: "1770823350",initialSheet: ("1770823350" == gid)});',
          ].join(""),
        );
      }

      if (url.includes("gid=1082103394")) {
        return response(csvForDates(["6/10/2026"]));
      }

      return response(
        "Date,# of Stocks Up >4%  on high volume,# of stocks down >4%  on high volume,Oscillator % ratio,Primary Indicator,# of stocks up >25% in a quarter,# of stocks down >25% in a quarter,Oscillator % ratio,Secondary Indicators,# of stocks up >50% in a month,# of stocks down >50% in a month,,# of stocks up >25% in a month,# of stocks down >25% in a month,,# of stocks up >100% in a year,# of stocks up >200% in a year,,MM 34/13 +,MM 34/13 -,,,# of stocks in Worden Database\n12/31,952,92,,,2849,2415,,,74,11,,533,68,,304,54,,3780,1202,,,6172\n",
      );
    });

    const result = await loadStockbeeBreadthHistory({
      client,
      fetcher,
      requestedYear: "2008",
      syncSource: "workbook",
    });

    expect(result.syncError).toBeNull();
    expect(result.liveRows.map((item) => item.date)).toEqual([
      "2026-06-10",
      "2008-12-31",
    ]);
    expect(result.selectedRows).toEqual([row({ date: "2008-12-31" })]);
    expect(client.upsertedRows.map((item) => item.date)).toEqual([
      "2026-06-10",
      "2008-12-31",
    ]);
  });

  it("falls back to persisted rows when live Stockbee fetch fails", async () => {
    const client = fakeStockbeeClient([storedRow({ date: "2026-06-10" })]);
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "",
    });

    const result = await loadStockbeeBreadthHistory({
      client,
      fetcher,
      requestedYear: undefined,
      sourceUrl,
    });

    expect(result.syncError).toBe(
      "Stockbee Market Monitor request failed with 503",
    );
    expect(result.selectedRows).toEqual([row({ date: "2026-06-10" })]);
    expect(client.upsertedRows).toEqual([]);
  });

  it("falls back to live rows when persisted read fails after a successful fetch", async () => {
    const client = fakeStockbeeClient([], {
      readError: new Error("database unavailable"),
    });
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => csvForDates(["6/10/2026"]),
    });

    const result = await loadStockbeeBreadthHistory({
      client,
      fetcher,
      requestedYear: undefined,
      sourceUrl,
    });

    expect(result.syncError).toBe(
      "Persisted Stockbee history unavailable: database unavailable",
    );
    expect(result.selectedRows).toEqual([row({ date: "2026-06-10" })]);
  });

  it("formats structured Supabase errors when persisted read fails", async () => {
    const client = fakeStockbeeClient([], {
      readError: {
        code: "PGRST205",
        message: "Could not find the table 'public.stockbee_breadth_rows'",
      },
    });
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => csvForDates(["6/10/2026"]),
    });

    const result = await loadStockbeeBreadthHistory({
      client,
      fetcher,
      requestedYear: undefined,
      sourceUrl,
    });

    expect(result.syncError).toBe(
      "Persisted Stockbee history unavailable: PGRST205: Could not find the table 'public.stockbee_breadth_rows'",
    );
    expect(result.syncError).not.toContain("[object Object]");
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

function storedRow(overrides: Partial<StockbeeBreadthRow> = {}) {
  const item = row(overrides);

  return {
    date: item.date,
    down_13_in_34_days: item.down13In34Days,
    down_25_month: item.down25Month,
    down_25_quarter: item.down25Quarter,
    down_4_percent: item.down4Percent,
    down_50_month: item.down50Month,
    ratio_10_day: item.ratio10Day,
    ratio_5_day: item.ratio5Day,
    sp500: item.sp500,
    t2108: item.t2108,
    universe_count: item.universeCount,
    up_13_in_34_days: item.up13In34Days,
    up_25_month: item.up25Month,
    up_25_quarter: item.up25Quarter,
    up_4_percent: item.up4Percent,
    up_50_month: item.up50Month,
  };
}

function csvForDates(dates: string[]) {
  return [
    "Date,Number of stocks up 4% plus today,Number of stocks down 4% plus today,5 day ratio,10 day  ratio ,Number of stocks up 25% plus in a quarter,Number of stocks down 25% + in a quarter,Number of stocks up 25% + in a month,Number of stocks down 25% + in a month,Number of stocks up 50% + in a month,Number of stocks down 50% + in a month,Number of stocks up 13% + in 34 days,Number of stocks down 13% + in 34 days, Worden Common stock universe,T2108 ,S&P",
    ...dates.map(
      (date) =>
        `${date},1,2,1.1,1.2,3,4,5,6,7,8,10,11,6462,39.31,"7,553.68"`,
    ),
  ].join("\n");
}

function response(text: string) {
  return {
    ok: true,
    status: 200,
    text: async () => text,
  };
}

function fakeStockbeeClient(
  storedRows: Record<string, unknown>[],
  options: { readError?: unknown } = {},
) {
  const client = {
    orderCall: null as unknown,
    upsertedRows: [] as Record<string, unknown>[],
    upsertOptions: null as unknown,
    from(table: string) {
      expect(table).toBe("stockbee_breadth_rows");

      return {
        select: () => ({
          order: vi.fn((column, orderOptions) => {
            client.orderCall = [column, orderOptions];
            return Promise.resolve({
              data: options.readError ? null : storedRows,
              error: options.readError ?? null,
            });
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
