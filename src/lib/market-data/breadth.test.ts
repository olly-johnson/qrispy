import { describe, expect, it } from "vitest";

import {
  buildDashboardBreadthSnapshot,
  buildMarketBreadthSnapshot,
  parseStockbeeMarketMonitorCsv,
  summarizeMarketIndexBars,
} from "./breadth";
import type { OhlcvBar } from "./types";

const STOCKBEE_CSV = `,Primary Breadth Indicators,,,,,,,,,,,,,,\nDate,Number of stocks up 4% plus today,Number of stocks down 4% plus today,5 day ratio,10 day  ratio ,Number of stocks up 25% plus in a quarter,Number of stocks down 25% + in a quarter,Number of stocks up 25% + in a month,Number of stocks down 25% + in a month,Number of stocks up 50% + in a month,Number of stocks down 50% + in a month,Number of stocks up 13% + in 34 days,Number of stocks down 13% + in 34 days, Worden Common stock universe,T2108 ,S&P\n6/3/2026,154,441,1.29,1.90,1469,967,215,156,65,30,1581,1649,6462,39.31,"7,553.68"\n6/2/2026,295,301,1.79,2.08,1582,903,284,137,94,30,1805,1460,6459,45.31,"7,609.78"\n`;

describe("parseStockbeeMarketMonitorCsv", () => {
  it("normalizes dated Stockbee rows and quoted market values", () => {
    expect(parseStockbeeMarketMonitorCsv(STOCKBEE_CSV)).toEqual([
      expect.objectContaining({
        date: "2026-06-03",
        up4Percent: 154,
        down4Percent: 441,
        ratio5Day: 1.29,
        ratio10Day: 1.9,
        up25Quarter: 1469,
        down25Quarter: 967,
        up13In34Days: 1581,
        down13In34Days: 1649,
        universeCount: 6462,
        t2108: 39.31,
        sp500: 7553.68,
      }),
      expect.objectContaining({
        date: "2026-06-02",
        sp500: 7609.78,
      }),
    ]);
  });
});

describe("buildMarketBreadthSnapshot", () => {
  it("keeps the latest row first for the table and oldest first for charts", () => {
    const snapshot = buildMarketBreadthSnapshot(
      parseStockbeeMarketMonitorCsv(STOCKBEE_CSV),
    );

    expect(snapshot.latest?.date).toBe("2026-06-03");
    expect(snapshot.tableRows.map((row) => row.date)).toEqual([
      "2026-06-03",
      "2026-06-02",
    ]);
    expect(snapshot.chartRows.map((row) => row.date)).toEqual([
      "2026-06-02",
      "2026-06-03",
    ]);
  });
});

describe("summarizeMarketIndexBars", () => {
  it("compares the latest close with key moving averages", () => {
    const bars = Array.from({ length: 220 }, (_, index) =>
      bar({
        close: index < 200 ? 100 : index === 219 ? 131 : 130,
        day: index + 1,
        symbol: "SPY",
      }),
    );

    const summary = summarizeMarketIndexBars("SPY", bars);

    expect(summary).toEqual(
      expect.objectContaining({
        symbol: "SPY",
        price: 131,
        priceAboveSma10: true,
        priceAboveSma20: true,
        sma10AboveSma20: true,
        sma50AboveSma200: true,
      }),
    );
  });
});

describe("buildDashboardBreadthSnapshot", () => {
  it("extracts latest 13/34, T2108, and SPY/QQQ short-term trend status", () => {
    const snapshot = buildDashboardBreadthSnapshot(
      buildMarketBreadthSnapshot(parseStockbeeMarketMonitorCsv(STOCKBEE_CSV)),
      [
        {
          symbol: "SPY",
          price: 754.24,
          priceAboveSma10: true,
          priceAboveSma20: true,
          sma10AboveSma20: true,
          sma50AboveSma200: true,
        },
        {
          symbol: "QQQ",
          price: 744.21,
          priceAboveSma10: false,
          priceAboveSma20: true,
          sma10AboveSma20: false,
          sma50AboveSma200: true,
        },
        {
          symbol: "IWM",
          price: 287.67,
          priceAboveSma10: false,
          priceAboveSma20: true,
          sma10AboveSma20: true,
          sma50AboveSma200: true,
        },
      ],
    );

    expect(snapshot).toEqual({
      date: "2026-06-03",
      up13In34Days: 1581,
      down13In34Days: 1649,
      t2108: 39.31,
      indexes: [
        {
          symbol: "SPY",
          priceAboveSma10: true,
          priceAboveSma20: true,
          sma10AboveSma20: true,
        },
        {
          symbol: "QQQ",
          priceAboveSma10: false,
          priceAboveSma20: true,
          sma10AboveSma20: false,
        },
      ],
    });
  });
});

function bar(input: {
  symbol: string;
  close: number;
  day: number;
}): OhlcvBar {
  const date = new Date(Date.UTC(2026, 0, input.day));

  return {
    adjusted: true,
    barStartAt: date.toISOString(),
    close: input.close,
    high: input.close + 1,
    low: input.close - 1,
    open: input.close,
    provider: "test",
    rawPayload: {},
    symbol: input.symbol,
    timeframe: "1d",
    volume: 1_000_000,
  };
}
