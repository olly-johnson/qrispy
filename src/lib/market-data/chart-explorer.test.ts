import { describe, expect, it } from "vitest";

import {
  chartExplorerOverlays,
  dailyViewport,
  filterRegularSessionBars,
  parseChartExplorerSearchParams,
  serializeChartExplorerSearchParams,
  validateChartExplorerFilters,
} from "./chart-explorer";
import type { OhlcvBar } from "./types";

describe("chart explorer filters", () => {
  it("normalizes ticker and serializes a shareable URL query", () => {
    const filters = parseChartExplorerSearchParams({
      symbol: "  acme ",
      from: "2026-01-05",
      to: "2026-01-09",
    });

    expect(filters).toEqual({
      symbol: "ACME",
      from: "2026-01-05",
      to: "2026-01-09",
    });
    expect(serializeChartExplorerSearchParams(filters).toString()).toBe(
      "symbol=ACME&from=2026-01-05&to=2026-01-09",
    );
  });

  it("rejects missing values and reversed date ranges", () => {
    expect(validateChartExplorerFilters({ symbol: "", from: "", to: "" })).toBe(
      "Enter a ticker, start date, and end date.",
    );
    expect(
      validateChartExplorerFilters({
        symbol: "ACME",
        from: "2026-01-09",
        to: "2026-01-05",
      }),
    ).toBe("The start date must be on or before the end date.");
  });
});

describe("chart explorer regular-session data", () => {
  it("keeps only weekday 09:30 through 16:00 New York bars", () => {
    const bars = [
      bar("2026-01-05T14:29:00.000Z"),
      bar("2026-01-05T14:30:00.000Z"),
      bar("2026-01-05T21:00:00.000Z"),
      bar("2026-01-05T21:01:00.000Z"),
      bar("2026-01-10T15:00:00.000Z"),
    ];

    expect(filterRegularSessionBars(bars).map((item) => item.barStartAt)).toEqual([
      "2026-01-05T14:30:00.000Z",
      "2026-01-05T21:00:00.000Z",
    ]);
  });

  it("centers a short selected range inside a 50-session daily view", () => {
    const bars = Array.from({ length: 120 }, (_, index) =>
      bar(new Date(Date.UTC(2025, 8, 1 + index)).toISOString(), "1d"),
    );

    expect(dailyViewport(bars, "2025-10-06", "2025-10-10")).toEqual({
      startIndex: 13,
      visibleBars: 50,
    });
  });
});

describe("chart explorer overlays", () => {
  it("uses the requested daily and intraday indicator colors", () => {
    const daily = chartExplorerOverlays(
      Array.from({ length: 220 }, (_, index) => bar(`2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`, "1d", index + 10)),
      "1d",
    );
    const intraday = chartExplorerOverlays(
      [bar("2026-01-05T14:30:00.000Z", "1m", 10), bar("2026-01-05T14:31:00.000Z", "1m", 11)],
      "1m",
    );

    expect(daily.map((overlay) => [overlay.id, overlay.color])).toEqual([
      ["sma10", "#d946ef"],
      ["sma20", "#facc15"],
      ["sma50", "#ef4444"],
      ["sma100", "#22c55e"],
      ["sma200", "#3b82f6"],
    ]);
    expect(intraday.map((overlay) => [overlay.id, overlay.color])).toEqual([
      ["ema10", "#d946ef"],
      ["ema20", "#facc15"],
      ["ema65", "#ffffff"],
      ["vwap", "#f97316"],
    ]);
  });
});

function bar(
  barStartAt: string,
  timeframe: OhlcvBar["timeframe"] = "1m",
  close = 10,
): OhlcvBar {
  return {
    provider: "massive",
    symbol: "ACME",
    timeframe,
    barStartAt,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 100,
    adjusted: false,
    rawPayload: {},
  };
}
