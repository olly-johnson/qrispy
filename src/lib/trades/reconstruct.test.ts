import { describe, expect, it } from "vitest";

import { reconstructTrades } from "./reconstruct";
import type { CanonicalFill } from "./types";

const baseFill = {
  userId: "user-1",
  accountId: "account-1",
  broker: "tradezero",
  assetClass: "equity",
  currency: "USD",
  commission: 0,
  fees: 0,
} satisfies Partial<CanonicalFill>;

function fill(input: {
  id: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  executedAt: string;
  symbol?: string;
}): CanonicalFill {
  return {
    ...baseFill,
    id: input.id,
    sourceFillId: input.id,
    idempotencyKey: `test-${input.id}`,
    symbol: input.symbol ?? "NVDA",
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    executedAt: input.executedAt,
    tradeDate: input.executedAt.slice(0, 10),
  } as CanonicalFill;
}

describe("reconstructTrades", () => {
  it("reconstructs a direct flip as one closed long trade and one open short trade", () => {
    const trades = reconstructTrades([
      fill({
        id: "fill-1",
        side: "BUY",
        quantity: 20,
        price: 10,
        executedAt: "2026-01-02T14:31:00.000Z",
      }),
      fill({
        id: "fill-2",
        side: "SELL",
        quantity: 40,
        price: 12,
        executedAt: "2026-01-02T14:35:00.000Z",
      }),
    ]);

    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({
      symbol: "NVDA",
      direction: "LONG",
      status: "CLOSED",
      entryQuantity: 20,
      avgEntryPrice: 10,
      avgExitPrice: 12,
      realizedPnl: 40,
    });
    expect(trades[0].allocations).toEqual([
      expect.objectContaining({
        fillId: "fill-1",
        allocatedQuantity: 20,
        allocationRole: "ENTRY",
      }),
      expect.objectContaining({
        fillId: "fill-2",
        allocatedQuantity: 20,
        allocationRole: "EXIT",
      }),
    ]);
    expect(trades[1]).toMatchObject({
      direction: "SHORT",
      status: "OPEN",
      entryQuantity: 20,
      avgEntryPrice: 12,
      realizedPnl: null,
    });
    expect(trades[1].allocations).toEqual([
      expect.objectContaining({
        fillId: "fill-2",
        allocatedQuantity: 20,
        allocationRole: "ENTRY",
      }),
    ]);
  });

  it("keeps a multi-fill partial exit trade open with realized P&L for the exited shares", () => {
    const trades = reconstructTrades([
      fill({
        id: "fill-1",
        side: "BUY",
        quantity: 10,
        price: 20,
        executedAt: "2026-01-03T14:31:00.000Z",
      }),
      fill({
        id: "fill-2",
        side: "BUY",
        quantity: 10,
        price: 22,
        executedAt: "2026-01-03T14:32:00.000Z",
      }),
      fill({
        id: "fill-3",
        side: "SELL",
        quantity: 5,
        price: 25,
        executedAt: "2026-01-03T15:00:00.000Z",
      }),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      direction: "LONG",
      status: "OPEN",
      entryQuantity: 20,
      maxAbsQuantity: 20,
      avgEntryPrice: 21,
      realizedPnl: 20,
    });
  });

  it("does not close an open trade with fills from a different symbol", () => {
    const trades = reconstructTrades([
      fill({
        id: "fill-1",
        side: "BUY",
        quantity: 10,
        price: 100,
        executedAt: "2026-05-01T13:33:00.000Z",
        symbol: "DOCN",
      }),
      fill({
        id: "fill-2",
        side: "SELL",
        quantity: 10,
        price: 20,
        executedAt: "2026-05-02T13:33:00.000Z",
        symbol: "ZSL",
      }),
    ]);

    expect(trades).toHaveLength(2);
    expect(trades).toEqual([
      expect.objectContaining({
        symbol: "DOCN",
        status: "OPEN",
        closedAt: null,
        realizedPnl: null,
      }),
      expect.objectContaining({
        symbol: "ZSL",
        direction: "SHORT",
        status: "OPEN",
        closedAt: null,
        realizedPnl: null,
      }),
    ]);
  });
});
