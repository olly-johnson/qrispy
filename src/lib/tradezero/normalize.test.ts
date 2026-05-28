import { describe, expect, it } from "vitest";

import { isExecutableTradeZeroFillPayload, normalizeTradeZeroFill } from "./normalize";

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

  it("maps a live historical trading row into a canonical fill", () => {
    const fill = normalizeTradeZeroFill({
      userId: "user-1",
      accountId: "account-1",
      brokerAccountId: "TZ123",
      payload: {
        tradeId: 9001,
        symbol: "AAPL",
        side: "Sell",
        qty: 15,
        price: 180.25,
        commission: 1.5,
        totalFees: 2.1,
        netProceeds: 2701.65,
        tradeDate: "2026-01-30T00:00:00",
        execTime: "14:49:08",
      },
    });

    expect(fill).toMatchObject({
      sourceFillId: "9001",
      idempotencyKey: "tradezero_api|TZ123|9001",
      symbol: "AAPL",
      side: "SELL",
      quantity: 15,
      price: 180.25,
      executedAt: "2026-01-30T19:49:08.000Z",
      tradeDate: "2026-01-30",
    });
  });

  it("maps TradeZero cover rows into buy-side fills", () => {
    const fill = normalizeTradeZeroFill({
      userId: "user-1",
      accountId: "account-1",
      brokerAccountId: "TZ123",
      payload: {
        tradeId: 9002,
        symbol: "AAPL",
        side: "Cover",
        qty: 10,
        price: 175.1,
        tradeDate: "2026-01-30T00:00:00",
        execTime: "15:01:02",
      },
    });

    expect(fill.side).toBe("BUY");
  });

  it("maps TradeZero short-sale rows into sell-side fills", () => {
    const fill = normalizeTradeZeroFill({
      userId: "user-1",
      accountId: "account-1",
      brokerAccountId: "TZ123",
      payload: {
        tradeId: 9003,
        symbol: "AAPL",
        side: "Sell Short",
        qty: 10,
        price: 175.1,
        tradeDate: "2026-01-30T00:00:00",
        execTime: "15:01:02",
      },
    });

    expect(fill.side).toBe("SELL");
  });
});

describe("isExecutableTradeZeroFillPayload", () => {
  it("rejects canceled historical rows even when a quantity is present", () => {
    expect(
      isExecutableTradeZeroFillPayload({
        tradeId: 9004,
        symbol: "AAPL",
        side: "Buy",
        qty: 10,
        canceled: true,
      }),
    ).toBe(false);
  });

  it("accepts non-canceled rows with a fill quantity", () => {
    expect(
      isExecutableTradeZeroFillPayload({
        tradeId: 9005,
        symbol: "AAPL",
        side: "Buy",
        qty: "10",
        canceled: false,
      }),
    ).toBe(true);
  });
});
