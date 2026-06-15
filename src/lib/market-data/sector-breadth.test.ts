import { describe, expect, it } from "vitest";

import {
  buildSectorBreadthSnapshot,
  calculateHistoricalBreadthMetrics,
} from "./sector-breadth";
import type { NormalizedMarketSnapshot } from "./market-universe";
import type { SectorName, StockClassification } from "./sector-classifications";
import type { OhlcvBar } from "./types";

describe("buildSectorBreadthSnapshot", () => {
  it("groups mapped common stocks into sectors, industries, and ordered stocks", () => {
    const snapshot = buildSectorBreadthSnapshot({
      classifications: [
        classification("ACME", "Acme Semis", "Information Technology", "Semiconductors"),
        classification("SOFT", "Soft Co", "Information Technology", "Software"),
        classification("BANK", "Bank Co", "Financials", "Banks"),
      ],
      historicalMetrics: {
        down13In34Days: 1,
        historyEndDate: "2026-06-10",
        isStale: false,
        ratio10Day: 1.1,
        ratio5Day: 1.4,
        t2108: 66.67,
        t2108Covered: 3,
        up13In34Days: 1,
      },
      loadedAt: "2026-06-10T15:00:00.000Z",
      snapshots: [
        marketSnapshot("ACME", 110, 100, 100_000),
        marketSnapshot("SOFT", 95, 100, 50_000),
        marketSnapshot("BANK", 100, 100, 25_000),
        marketSnapshot("MISS", 120, 100, 20_000),
      ],
      totalCommonStocks: 4,
    });

    expect(snapshot.coverage).toEqual({
      mapped: 3,
      totalCommonStocks: 4,
      unmapped: 1,
      withLiveSnapshot: 3,
    });
    expect(snapshot.liveBreadth).toEqual({
      down13In34Days: 1,
      down4Percent: 1,
      flat: 1,
      green: 1,
      historyEndDate: "2026-06-10",
      isHistoricalStale: false,
      ratio10Day: 1.1,
      ratio5Day: 1.4,
      red: 1,
      t2108: 66.67,
      t2108Covered: 3,
      up13In34Days: 1,
      up4Percent: 1,
    });
    expect(snapshot.sectors.map((sector) => sector.name)).toEqual([
      "Information Technology",
      "Financials",
    ]);
    expect(snapshot.sectors[0]).toEqual(
      expect.objectContaining({
        averageTodayPercent: 2.5,
        down: 1,
        flat: 0,
        medianTodayPercent: 2.5,
        name: "Information Technology",
        up: 1,
      }),
    );
    expect(snapshot.sectors[0].industries[0].stocks[0]).toEqual(
      expect.objectContaining({ symbol: "ACME", todayPercent: 10 }),
    );
  });
});

describe("calculateHistoricalBreadthMetrics", () => {
  it("calculates T2108, 13-in-34 counts, and 5/10 day up-down ratios", () => {
    const metrics = calculateHistoricalBreadthMetrics({
      barsBySymbol: new Map([
        ["ACME", bars("ACME", 100, 150)],
        ["SOFT", bars("SOFT", 100, 80)],
        ["FLAT", bars("FLAT", 100, 101)],
      ]),
      todayDown4Percent: 1,
      todayUp4Percent: 2,
    });

    expect(metrics).toEqual({
      down13In34Days: 1,
      historyEndDate: null,
      isStale: false,
      ratio10Day: expect.any(Number),
      ratio5Day: expect.any(Number),
      t2108: 66.67,
      t2108Covered: 3,
      up13In34Days: 1,
    });
    expect(metrics.ratio5Day).toBeGreaterThan(0);
    expect(metrics.ratio10Day).toBeGreaterThan(0);
  });
});

function classification(
  ticker: string,
  name: string,
  sector: SectorName,
  industry: string,
): StockClassification {
  return {
    industry,
    name,
    sector,
    source: "sic-derived",
    ticker,
  };
}

function marketSnapshot(
  symbol: string,
  price: number,
  previousClose: number,
  volume: number,
): NormalizedMarketSnapshot {
  return {
    lastUpdatedAt: "2026-06-10T15:00:00.000Z",
    price,
    previousClose,
    symbol,
    volume,
  };
}

function bars(symbol: string, firstClose: number, lastClose: number): OhlcvBar[] {
  return Array.from({ length: 45 }, (_, index) => {
    const close = index === 44 ? lastClose : firstClose;

    return {
      adjusted: true,
      barStartAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      close,
      high: close,
      low: close,
      open: close,
      provider: "test",
      rawPayload: {},
      symbol,
      timeframe: "1d",
      volume: 1,
    };
  });
}
