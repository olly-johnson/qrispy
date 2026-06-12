import { describe, expect, it } from "vitest";

import {
  buildGappersSummaryRequests,
  getCachedGappersSummaryResults,
  getLastGappersSummaryResults,
  DEFAULT_GAPPERS_FILTERS,
  filterGappersRows,
  parseGappersFiltersSearchParams,
  saveLastGappersSummaryResults,
  saveGappersSummaryResults,
  serializeGappersFiltersSearchParams,
} from "./gappers-client";
import type { GappersRow } from "./gappers";

describe("filterGappersRows", () => {
  it("uses default price, gap, dollar volume, and type filters", () => {
    expect(
      filterGappersRows(
        [
          row("ACME", "Stock", 1, 6, 100_000),
          row("LOWP", "Stock", 0.5, 20, 200_000),
          row("LOWG", "Stock", 4, 5.9, 200_000),
          row("LOWD", "ETF", 4, 8, 99_999),
          row("IETF", "ETF", 4, 8, 250_000),
        ],
        DEFAULT_GAPPERS_FILTERS,
      ).map((item) => item.symbol),
    ).toEqual(["ACME", "IETF"]);
  });

  it("can hide stocks or ETFs independently", () => {
    const rows = [row("ACME", "Stock", 1, 6, 100_000), row("IETF", "ETF", 4, 8, 250_000)];

    expect(
      filterGappersRows(rows, {
        ...DEFAULT_GAPPERS_FILTERS,
        includeEtfs: false,
      }).map((item) => item.symbol),
    ).toEqual(["ACME"]);

    expect(
      filterGappersRows(rows, {
        ...DEFAULT_GAPPERS_FILTERS,
        includeStocks: false,
      }).map((item) => item.symbol),
    ).toEqual(["IETF"]);
  });
});

describe("buildGappersSummaryRequests", () => {
  it("builds summary API rows for selected visible symbols", () => {
    const rows = [
      row("ACME", "Stock", 1, 6, 100_000),
      row("IETF", "ETF", 4, 8, 250_000),
    ];

    expect(
      buildGappersSummaryRequests(rows, new Set(["IETF", "MISS"])),
    ).toEqual([
      {
        previousCloseAt: "2026-06-03T20:00:00.000Z",
        symbol: "IETF",
      },
    ]);
  });
});

describe("gappers search params", () => {
  it("parses numeric and type criteria from search params", () => {
    expect(
      parseGappersFiltersSearchParams({
        includeEtfs: "false",
        includeStocks: "true",
        minDollarVolume: "250000",
        minGapPercent: "3.5",
        minPrice: "0.1",
      }),
    ).toEqual({
      includeEtfs: false,
      includeStocks: true,
      minDollarVolume: 250_000,
      minGapPercent: 3.5,
      minPrice: 0.1,
    });
  });

  it("serializes criteria so URL changes can refresh server results", () => {
    expect(
      serializeGappersFiltersSearchParams({
        includeEtfs: false,
        includeStocks: true,
        minDollarVolume: 250_000,
        minGapPercent: 3.5,
        minPrice: 0.1,
      }).toString(),
    ).toBe(
      "minPrice=0.1&minGapPercent=3.5&minDollarVolume=250000&includeStocks=true&includeEtfs=false",
    );
  });
});

describe("gapper summary cache", () => {
  it("restores fresh summary results for matching request/provider/model", () => {
    const storage = new MemoryStorage();
    const requests = [
      {
        previousCloseAt: "2026-06-05T20:00:00.000Z",
        symbol: "STI",
      },
    ];
    const results = [
      {
        message: "No Massive news found after previous close.",
        status: "no_news" as const,
        symbol: "STI",
      },
    ];

    saveGappersSummaryResults({
      model: "gpt-4o-mini",
      now: 1000,
      provider: "openai",
      requests,
      results,
      storage,
    });

    expect(
      getCachedGappersSummaryResults({
        maxAgeMs: 60_000,
        model: "gpt-4o-mini",
        now: 2000,
        provider: "openai",
        requests,
        storage,
      }),
    ).toEqual({
      cachedResults: results,
      missingRequests: [],
    });
  });

  it("returns expired or unmatched summary requests as missing", () => {
    const storage = new MemoryStorage();
    const requests = [
      {
        previousCloseAt: "2026-06-05T20:00:00.000Z",
        symbol: "STI",
      },
    ];

    saveGappersSummaryResults({
      model: "gpt-4o-mini",
      now: 1000,
      provider: "openai",
      requests,
      results: [
        {
          message: "No Massive news found after previous close.",
          status: "no_news",
          symbol: "STI",
        },
      ],
      storage,
    });

    expect(
      getCachedGappersSummaryResults({
        maxAgeMs: 60_000,
        model: "gpt-4o-mini",
        now: 70_001,
        provider: "openai",
        requests,
        storage,
      }),
    ).toEqual({
      cachedResults: [],
      missingRequests: requests,
    });

    expect(
      getCachedGappersSummaryResults({
        maxAgeMs: 60_000,
        model: "gpt-4o-2024-08-06",
        now: 2000,
        provider: "openai",
        requests,
        storage,
      }),
    ).toEqual({
      cachedResults: [],
      missingRequests: requests,
    });
  });

  it("restores the last displayed summary results while they are fresh", () => {
    const storage = new MemoryStorage();
    const results = [
      {
        message: "No Massive news found after previous close.",
        status: "no_news" as const,
        symbol: "STI",
      },
    ];

    saveLastGappersSummaryResults({ now: 1000, results, storage });

    expect(
      getLastGappersSummaryResults({
        maxAgeMs: 60_000,
        now: 2000,
        storage,
      }),
    ).toEqual(results);
    expect(
      getLastGappersSummaryResults({
        maxAgeMs: 60_000,
        now: 70_001,
        storage,
      }),
    ).toEqual([]);
  });
});

function row(
  symbol: string,
  securityType: GappersRow["securityType"],
  price: number,
  gapPercent: number,
  activeDollarVolume: number,
): GappersRow {
  return {
    activeDollarVolume,
    activeVolume: 10_000,
    gapPercent,
    lastUpdatedAt: null,
    name: symbol,
    previousClose: 1,
    previousCloseAt: "2026-06-03T20:00:00.000Z",
    price,
    securityType,
    symbol,
  };
}

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
