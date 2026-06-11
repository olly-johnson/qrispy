import { describe, expect, it } from "vitest";

import {
  buildCommonStockUniverse,
  normalizeMarketSnapshotTicker,
} from "./market-universe";

describe("buildCommonStockUniverse", () => {
  it("keeps active US common stocks and excludes ETFs, funds, inactive rows, and OTC rows", () => {
    const universe = buildCommonStockUniverse([
      ticker("ACME", "Acme Corp", "CS", "stocks", "us", true),
      ticker("IETF", "Index ETF", "ETF", "stocks", "us", true),
      ticker("FUNDX", "Mutual Fund", "FUND", "stocks", "us", true),
      ticker("DEAD", "Inactive", "CS", "stocks", "us", false),
      ticker("OTCM", "OTC Name", "CS", "otc", "us", true),
      ticker("FOREIGN", "Foreign Name", "CS", "stocks", "global", true),
    ]);

    expect([...universe.values()]).toEqual([
      { name: "Acme Corp", symbol: "ACME" },
    ]);
  });
});

describe("normalizeMarketSnapshotTicker", () => {
  it("extracts current price, previous close, volume, and update time from Massive snapshot shapes", () => {
    expect(
      normalizeMarketSnapshotTicker({
        day: { c: 10.5, v: 100_000 },
        min: { c: 11 },
        prevDay: { c: 10 },
        ticker: "ACME",
        updated: 1_780_000_000_000,
      }),
    ).toEqual({
      lastUpdatedAt: "2026-05-28T20:26:40.000Z",
      price: 11,
      previousClose: 10,
      symbol: "ACME",
      volume: 100_000,
    });
  });

  it("returns null when price or previous close is missing", () => {
    expect(normalizeMarketSnapshotTicker({ ticker: "ACME" })).toBeNull();
  });
});

function ticker(
  tickerSymbol: string,
  name: string,
  type: string,
  market: string,
  locale: string,
  active: boolean,
) {
  return {
    active,
    locale,
    market,
    name,
    ticker: tickerSymbol,
    type,
  };
}
