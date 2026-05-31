import { describe, expect, it } from "vitest";

import {
  CHART_FONT_SIZE,
  MARKER_OPTIONS,
  MARKER_SIZE,
  PRICE_LINE_DISABLED_OPTIONS,
  prepareChartData,
} from "./trade-chart-panel";
import type { TradeChartDataset } from "@/lib/market-data/trade-charts";

describe("prepareChartData", () => {
  it("places entry markers below bars and exit markers above bars", () => {
    const prepared = prepareChartData({
      id: "daily",
      label: "Daily",
      timeframe: "1d",
      bars: [],
      overlays: [],
      markers: [
        {
          time: "2026-01-08T15:18:00.000Z",
          price: 20,
          quantity: 10,
          side: "SELL",
          role: "ENTRY",
          text: "ENTRY 10 @ $20",
        },
        {
          time: "2026-01-08T19:05:00.000Z",
          price: 21,
          quantity: 5,
          side: "BUY",
          role: "EXIT",
          text: "EXIT 10 @ $21",
        },
      ],
    } satisfies TradeChartDataset);

    expect(prepared.markers).toEqual([
      expect.objectContaining({
        position: "belowBar",
        shape: "arrowUp",
        color: "#22d3ee",
        size: 1.8,
        text: "10",
      }),
      expect.objectContaining({
        position: "aboveBar",
        shape: "arrowDown",
        color: "#fb7185",
        size: 1.8,
        text: "5",
      }),
    ]);
  });
});

describe("PRICE_LINE_DISABLED_OPTIONS", () => {
  it("removes the current price line and last-value label from chart series", () => {
    expect(PRICE_LINE_DISABLED_OPTIONS).toEqual({
      lastValueVisible: false,
      priceLineVisible: false,
    });
  });
});

describe("MARKER_OPTIONS", () => {
  it("renders trade markers above candles and overlays", () => {
    expect(MARKER_OPTIONS).toEqual({ zOrder: "top" });
  });
});

describe("marker label visibility", () => {
  it("uses larger marker glyphs and chart text for readable quantity labels", () => {
    expect(MARKER_SIZE).toBe(1.8);
    expect(CHART_FONT_SIZE).toBe(14);
  });
});
