import { describe, expect, it } from "vitest";

import { normalizeTradeZeroFill } from "./normalize";

describe("normalizeTradeZeroFill", () => {
  it("maps a TradeZero fill payload into a canonical idempotent fill", () => {
    const fill = normalizeTradeZeroFill({
      userId: "user-1",
      accountId: "account-1",
      brokerAccountId: "TZ123",
      payload: {
        tradeId: "9001",
        symbol: "AAPL",
        side: "B",
        qty: "15",
        price: "180.25",
        commission: "1.50",
        totalFees: "2.10",
        netProceeds: "-2705.85",
        executedAt: "2026-01-05T09:35:12-05:00",
      },
    });

    expect(fill).toMatchObject({
      userId: "user-1",
      accountId: "account-1",
      broker: "tradezero",
      sourceType: "api",
      sourceFillId: "9001",
      idempotencyKey: "tradezero_api|TZ123|9001",
      symbol: "AAPL",
      side: "BUY",
      quantity: 15,
      price: 180.25,
      commission: 1.5,
      fees: 2.1,
      netProceeds: -2705.85,
      executedAt: "2026-01-05T14:35:12.000Z",
      executedTz: "America/New_York",
      tradeDate: "2026-01-05",
      currency: "USD",
    });
  });
});
