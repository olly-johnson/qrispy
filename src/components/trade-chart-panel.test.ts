import { describe, expect, it } from "vitest";

import {
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
          side: "SELL",
          role: "ENTRY",
          text: "ENTRY 10 @ $20",
        },
        {
          time: "2026-01-08T19:05:00.000Z",
          price: 21,
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
        text: "ENTRY",
      }),
      expect.objectContaining({
        position: "aboveBar",
        shape: "arrowDown",
        color: "#fb7185",
        text: "EXIT",
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
