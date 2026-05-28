import { describe, expect, it } from "vitest";

import {
  buildTradeZeroPortfolioSnapshot,
  buildTradeZeroPositionSnapshot,
} from "@/lib/tradezero/snapshot";

describe("TradeZero snapshot mapping", () => {
  const pnl = {
    pnl: [
      {
        symbol: "DOCN",
        exposure: 614.16,
        positionId: "position-docn",
        unrealizedPnL: 204.72,
      },
    ],
    accountValue: 4008.57,
    availableCash: 3540.57,
    dayPnl: 50.34,
    dayRealized: 0,
    exposure: 2556.06,
    totalUnrealized: 638.04,
  };

  it("maps account P&L fields from the live TradeZero payload", () => {
    expect(
      buildTradeZeroPortfolioSnapshot({
        pnl,
        positionSnapshots: [
          { quantity: 4, marketValue: 614.16 },
          { quantity: 14, marketValue: 336.84 },
        ],
      }),
    ).toEqual({
      cash: 3540.57,
      dayPnl: 50.34,
      equity: 4008.57,
      grossExposure: 2556.06,
      longMarketValue: 951,
      netExposure: 951,
      percentInvested: 2556.06 / 4008.57,
      realizedPnl: 0,
      shortMarketValue: 0,
      unrealizedPnl: 638.04,
    });
  });

  it("maps position fields from the live TradeZero payload and matching P&L row", () => {
    expect(
      buildTradeZeroPositionSnapshot({
        pnl,
        position: {
          positionId: "position-docn",
          shares: 4,
          symbol: "DOCN",
          priceAvg: 102.36,
        },
      }),
    ).toEqual({
      averagePrice: 102.36,
      lastPrice: 153.54,
      marketValue: 614.16,
      quantity: 4,
      symbol: "DOCN",
      unrealizedPnl: 204.72,
    });
  });
});
