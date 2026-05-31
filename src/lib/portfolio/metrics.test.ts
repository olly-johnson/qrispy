import { describe, expect, it } from "vitest";

import { buildPortfolioSummary } from "./metrics";

describe("buildPortfolioSummary", () => {
  it("uses broker-reported values when present and computes missing exposure metrics from positions", () => {
    const summary = buildPortfolioSummary({
      snapshot: {
        equity: 100_000,
        cash: 25_000,
        buyingPower: 200_000,
        grossExposure: null,
        longMarketValue: null,
        shortMarketValue: null,
        netExposure: null,
        percentInvested: null,
        realizedPnl: 750,
      },
      positions: [
        { symbol: "AAPL", quantity: 100, marketValue: 19_000 },
        { symbol: "TSLA", quantity: -50, marketValue: -12_500 },
      ],
      openTradesCount: 2,
    });

    expect(summary.metrics.equity).toEqual({
      value: 100_000,
      provenance: "broker_reported",
    });
    expect(summary.metrics.grossExposure).toEqual({
      value: 31_500,
      provenance: "computed_from_positions",
    });
    expect(summary.metrics.longExposure).toEqual({
      value: 19_000,
      provenance: "computed_from_positions",
    });
    expect(summary.metrics.shortExposure).toEqual({
      value: 12_500,
      provenance: "computed_from_positions",
    });
    expect(summary.metrics.percentInvested).toEqual({
      value: 0.315,
      provenance: "computed_from_positions",
    });
    expect(summary.openPositionsCount).toBe(2);
  });

  it("displays stop-out equity when open trades have stop losses", () => {
    const summary = buildPortfolioSummary({
      snapshot: {
        equity: 10_000,
        cash: 2_000,
        buyingPower: 20_000,
        grossExposure: null,
        longMarketValue: null,
        shortMarketValue: null,
        netExposure: null,
        percentInvested: null,
        realizedPnl: 750,
      },
      positions: [
        {
          accountId: "account-1",
          symbol: "LONG",
          quantity: 100,
          marketValue: 5_000,
        },
        {
          accountId: "account-1",
          symbol: "SHORT",
          quantity: -50,
          marketValue: 2_000,
        },
      ],
      openTrades: [
        {
          accountId: "account-1",
          symbol: "LONG",
          direction: "LONG",
          quantity: 100,
          stopLossPrice: 45,
        },
        {
          accountId: "account-1",
          symbol: "SHORT",
          direction: "SHORT",
          quantity: 50,
          stopLossPrice: 45,
        },
      ],
      openTradesCount: 2,
    });

    expect(summary.metrics.equity).toEqual({
      value: 9_250,
      provenance: "computed_from_stops",
    });
  });
});
