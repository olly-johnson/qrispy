import { describe, expect, it, vi } from "vitest";

import {
  buildGappersSnapshot,
  getExtendedHoursWindows,
  getGappersMode,
  type GappersDataProvider,
} from "./gappers";
import type { OhlcvBar } from "./types";

describe("getGappersMode", () => {
  it("uses extended-hours mode from 4:00 AM ET until 9:30 AM ET", () => {
    expect(getGappersMode(new Date("2026-06-04T07:59:59.000Z"))).toBe("regular");
    expect(getGappersMode(new Date("2026-06-04T08:00:00.000Z"))).toBe("extended");
    expect(getGappersMode(new Date("2026-06-04T13:29:59.000Z"))).toBe("extended");
    expect(getGappersMode(new Date("2026-06-04T13:30:00.000Z"))).toBe("regular");
    expect(getGappersMode(new Date("2026-06-04T21:00:00.000Z"))).toBe("regular");
  });

  it("keeps weekend mornings in regular mode", () => {
    expect(getGappersMode(new Date("2026-06-07T12:00:00.000Z"))).toBe("regular");
  });
});

describe("getExtendedHoursWindows", () => {
  it("builds yesterday after-hours and today premarket windows in Eastern time", () => {
    expect(getExtendedHoursWindows(new Date("2026-06-04T12:00:00.000Z"))).toEqual([
      {
        from: new Date("2026-06-03T20:00:00.000Z"),
        to: new Date("2026-06-04T00:00:00.000Z"),
      },
      {
        from: new Date("2026-06-04T08:00:00.000Z"),
        to: new Date("2026-06-04T13:30:00.000Z"),
      },
    ]);
  });

  it("uses the previous trading day for Monday premarket after-hours", () => {
    expect(getExtendedHoursWindows(new Date("2026-06-08T12:00:00.000Z"))).toEqual([
      {
        from: new Date("2026-06-05T20:00:00.000Z"),
        to: new Date("2026-06-06T00:00:00.000Z"),
      },
      {
        from: new Date("2026-06-08T08:00:00.000Z"),
        to: new Date("2026-06-08T13:30:00.000Z"),
      },
    ]);
  });
});

describe("buildGappersSnapshot", () => {
  it("filters extended-hours common stocks and ETFs, sums volume, and sorts by dollar volume", async () => {
    const provider = providerWith({
      aggregateBars: {
        ACME: [
          bar("ACME", "2026-06-03T21:00:00.000Z", 11, 5_000),
          bar("ACME", "2026-06-04T12:00:00.000Z", 12, 8_000),
        ],
        IETF: [bar("IETF", "2026-06-04T12:15:00.000Z", 6, 40_000)],
      },
      snapshots: [
        snapshot("ACME", { price: 12, previousClose: 10, regularVolume: 20_000 }),
        snapshot("IETF", { price: 6, previousClose: 5, regularVolume: 50_000 }),
        snapshot("FUNDX", { price: 9, previousClose: 7, regularVolume: 80_000 }),
        snapshot("OTCM", { price: 9, previousClose: 7, regularVolume: 80_000 }),
      ],
      tickers: [
        ticker("ACME", "Acme Corp", "CS", "stocks"),
        ticker("IETF", "Index ETF", "ETF", "stocks"),
        ticker("FUNDX", "Mutual Fund", "FUND", "stocks"),
        ticker("OTCM", "OTC Name", "CS", "otc"),
      ],
    });

    await expect(
      buildGappersSnapshot({
        now: new Date("2026-06-04T12:00:00.000Z"),
        provider,
      }),
    ).resolves.toEqual({
      error: null,
      loadedAt: "2026-06-04T12:00:00.000Z",
      mode: "extended",
      rows: [
        expect.objectContaining({
          activeDollarVolume: 240_000,
          activeVolume: 40_000,
          gapPercent: 20,
          price: 6,
          previousCloseAt: "2026-06-03T20:00:00.000Z",
          securityType: "ETF",
          symbol: "IETF",
        }),
        expect.objectContaining({
          activeDollarVolume: 156_000,
          activeVolume: 13_000,
          gapPercent: 20,
          price: 12,
          previousCloseAt: "2026-06-03T20:00:00.000Z",
          securityType: "Stock",
          symbol: "ACME",
        }),
      ],
    });
  });

  it("does not fetch extended-hours volume for rows below the server gap floor", async () => {
    const provider = providerWith({
      aggregateBars: {
        HIGH: [bar("HIGH", "2026-06-04T12:00:00.000Z", 10.7, 20_000)],
        LOW: [bar("LOW", "2026-06-04T12:00:00.000Z", 10.5, 999_999)],
      },
      snapshots: [
        snapshot("LOW", { price: 10.5, previousClose: 10, regularVolume: 0 }),
        snapshot("HIGH", { price: 10.7, previousClose: 10, regularVolume: 0 }),
      ],
      tickers: [
        ticker("LOW", "Low Gap Corp", "CS", "stocks"),
        ticker("HIGH", "High Gap Corp", "CS", "stocks"),
      ],
    });

    const result = await buildGappersSnapshot({
      now: new Date("2026-06-04T12:00:00.000Z"),
      provider,
    });

    expect(result.error).toBeNull();
    expect(result.rows.map((row) => row.symbol)).toEqual(["HIGH"]);
    expect(provider.getAggregateBars).toHaveBeenCalledTimes(2);
    expect(provider.getAggregateBars).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "HIGH" }),
    );
    expect(provider.getAggregateBars).not.toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "LOW" }),
    );
  });

  it("uses requested search criteria when choosing extended-hours candidates", async () => {
    const provider = providerWith({
      aggregateBars: {
        HIGH: [bar("HIGH", "2026-06-04T12:00:00.000Z", 10.7, 20_000)],
        LOW: [bar("LOW", "2026-06-04T12:00:00.000Z", 10.5, 30_000)],
      },
      snapshots: [
        snapshot("LOW", { price: 10.5, previousClose: 10, regularVolume: 0 }),
        snapshot("HIGH", { price: 10.7, previousClose: 10, regularVolume: 0 }),
      ],
      tickers: [
        ticker("LOW", "Low Gap Corp", "CS", "stocks"),
        ticker("HIGH", "High Gap Corp", "CS", "stocks"),
      ],
    });

    const result = await buildGappersSnapshot({
      filters: {
        minGapPercent: 4,
        minPrice: 0.5,
      },
      now: new Date("2026-06-04T12:00:00.000Z"),
      provider,
    });

    expect(result.error).toBeNull();
    expect(result.rows.map((row) => row.symbol)).toEqual(["LOW", "HIGH"]);
    expect(provider.getAggregateBars).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "LOW" }),
    );
  });

  it("uses regular-session volume outside premarket and keeps sorting by dollar volume", async () => {
    const provider = providerWith({
      aggregateBars: {},
      snapshots: [
        snapshot("ACME", { price: 12, previousClose: 10, regularVolume: 20_000 }),
        snapshot("IETF", { price: 6, previousClose: 5, regularVolume: 50_000 }),
      ],
      tickers: [
        ticker("ACME", "Acme Corp", "CS", "stocks"),
        ticker("IETF", "Index ETF", "ETF", "stocks"),
      ],
    });

    const result = await buildGappersSnapshot({
      now: new Date("2026-06-04T21:00:00.000Z"),
      provider,
    });

    expect(result.mode).toBe("regular");
    expect(result.rows.map((row) => row.symbol)).toEqual(["IETF", "ACME"]);
    expect(result.rows.map((row) => row.activeDollarVolume)).toEqual([300_000, 240_000]);
    expect(provider.getAggregateBars).not.toHaveBeenCalled();
  });

  it("uses previous-session volume before premarket when the current session has no volume", async () => {
    const provider = providerWith({
      aggregateBars: {},
      snapshots: [
        snapshot("ACME", {
          previousClose: 10,
          previousRegularVolume: 70_000,
          price: 12,
          regularVolume: 0,
        }),
      ],
      tickers: [ticker("ACME", "Acme Corp", "CS", "stocks")],
    });

    const result = await buildGappersSnapshot({
      now: new Date("2026-06-07T12:00:00.000Z"),
      provider,
    });

    expect(result.mode).toBe("regular");
    expect(result.rows).toEqual([
      expect.objectContaining({
        activeDollarVolume: 840_000,
        activeVolume: 70_000,
        previousCloseAt: "2026-06-05T20:00:00.000Z",
        symbol: "ACME",
      }),
    ]);
    expect(provider.getAggregateBars).not.toHaveBeenCalled();
  });

  it("keeps current regular-session volume during market hours", async () => {
    const provider = providerWith({
      aggregateBars: {},
      snapshots: [
        snapshot("ACME", {
          previousClose: 10,
          previousRegularVolume: 70_000,
          price: 12,
          regularVolume: 20_000,
        }),
      ],
      tickers: [ticker("ACME", "Acme Corp", "CS", "stocks")],
    });

    const result = await buildGappersSnapshot({
      now: new Date("2026-06-04T15:00:00.000Z"),
      provider,
    });

    expect(result.mode).toBe("regular");
    expect(result.rows).toEqual([
      expect.objectContaining({
        activeDollarVolume: 240_000,
        activeVolume: 20_000,
        symbol: "ACME",
      }),
    ]);
  });

  it("returns a configuration error when Massive is unavailable", async () => {
    await expect(
      buildGappersSnapshot({
        now: new Date("2026-06-04T12:00:00.000Z"),
        provider: null,
      }),
    ).resolves.toEqual({
      error: "Massive API key is not configured.",
      loadedAt: "2026-06-04T12:00:00.000Z",
      mode: "extended",
      rows: [],
    });
  });
});

function providerWith(input: {
  aggregateBars: Record<string, OhlcvBar[]>;
  snapshots: Record<string, unknown>[];
  tickers: Record<string, unknown>[];
}): GappersDataProvider {
  return {
    getActiveStockTickers: vi.fn(async () => input.tickers),
    getAggregateBars: vi.fn(async ({ from, symbol, to }) =>
      (input.aggregateBars[symbol] ?? []).filter((bar) => {
        const time = Date.parse(bar.barStartAt);

        return time >= Number(from) && time < Number(to);
      }),
    ),
    getFullMarketSnapshot: vi.fn(async () => input.snapshots),
  };
}

function ticker(tickerSymbol: string, name: string, type: string, market: string) {
  return {
    active: true,
    locale: "us",
    market,
    name,
    ticker: tickerSymbol,
    type,
  };
}

function snapshot(
  tickerSymbol: string,
  input: {
    previousClose: number;
    previousRegularVolume?: number;
    price: number;
    regularVolume: number;
  },
) {
  return {
    day: { v: input.regularVolume },
    min: { c: input.price },
    prevDay: { c: input.previousClose, v: input.previousRegularVolume },
    ticker: tickerSymbol,
    updated: 1_780_000_000_000,
  };
}

function bar(symbol: string, barStartAt: string, close: number, volume: number): OhlcvBar {
  return {
    adjusted: false,
    barStartAt,
    close,
    high: close,
    low: close,
    open: close,
    provider: "test",
    rawPayload: {},
    symbol,
    timeframe: "5m",
    volume,
  };
}
