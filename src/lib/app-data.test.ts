import { describe, expect, it, vi } from "vitest";

import { getTradeDetail, getTradeHistory, mapLatestPositions } from "@/lib/app-data";

describe("mapLatestPositions", () => {
  it("keeps only one row per account and symbol from the latest snapshot", () => {
    expect(
      mapLatestPositions([
        {
          id: "latest-docn",
          account_id: "account-1",
          snapshot_at: "2026-05-28T16:39:00Z",
          symbol: "DOCN",
          quantity: 4,
          average_price: 102.36,
          market_value: 614.16,
          unrealized_pnl: 204.72,
        },
        {
          id: "latest-fcel",
          account_id: "account-1",
          snapshot_at: "2026-05-28T16:39:00Z",
          symbol: "FCEL",
          quantity: 14,
          average_price: 14.47,
          market_value: 336.84,
          unrealized_pnl: 134.26,
        },
        {
          id: "older-docn",
          account_id: "account-1",
          snapshot_at: "2026-05-28T16:37:00Z",
          symbol: "DOCN",
          quantity: 4,
          average_price: 102.36,
          market_value: 614.16,
          unrealized_pnl: 204.72,
        },
      ]),
    ).toEqual([
      {
        id: "latest-docn",
        symbol: "DOCN",
        quantity: 4,
        averagePrice: 102.36,
        marketValue: 614.16,
        unrealizedPnl: 204.72,
      },
      {
        id: "latest-fcel",
        symbol: "FCEL",
        quantity: 14,
        averagePrice: 14.47,
        marketValue: 336.84,
        unrealizedPnl: 134.26,
      },
    ]);
  });
});

describe("getTradeHistory", () => {
  it("loads all trades that overlap Jan 1 through today's date without the dashboard limit", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "trade-1",
          symbol: "SNDK",
          direction: "LONG",
          status: "CLOSED",
          opened_at: "2025-12-19T14:50:30.000Z",
          closed_at: "2026-01-06T14:31:11.000Z",
          entry_quantity: 2,
          max_abs_quantity: 2,
          avg_entry_price: 238.875,
          avg_exit_price: 435,
          realized_pnl: 12.5,
          total_fees: 1.25,
        },
        {
          id: "trade-2",
          symbol: "OLD",
          direction: "LONG",
          status: "CLOSED",
          opened_at: "2025-12-18T15:00:00.000Z",
          closed_at: "2025-12-20T16:00:00.000Z",
          realized_pnl: 9,
          total_fees: 1,
        },
      ],
      error: null,
    });
    const lt = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ lt }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(
      getTradeHistory("user-1", {
        client: { from },
        now: new Date("2026-05-28T12:00:00.000Z"),
      }),
    ).resolves.toEqual([
      {
        id: "trade-1",
        symbol: "SNDK",
        direction: "LONG",
        status: "CLOSED",
        openedAt: "2025-12-19T14:50:30.000Z",
        closedAt: "2026-01-06T14:31:11.000Z",
        entryQuantity: 2,
        maxAbsQuantity: 2,
        avgEntryPrice: 238.875,
        avgExitPrice: 435,
        realizedPnl: 12.5,
        totalFees: 1.25,
      },
    ]);

    expect(from).toHaveBeenCalledWith("trades");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(lt).toHaveBeenCalledWith("opened_at", "2026-05-29T00:00:00.000Z");
    expect(order).toHaveBeenCalledWith("opened_at", { ascending: false });
    expect(JSON.stringify({ from: from.mock.calls })).not.toContain("limit");
  });
});

describe("getTradeDetail", () => {
  it("loads the trade summary with allocated fills for analysis", async () => {
    const tradeSecondEq = vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "trade-1",
          symbol: "ZSL",
          direction: "LONG",
          status: "CLOSED",
          opened_at: "2026-01-08T15:18:00.000Z",
          closed_at: "2026-01-08T19:05:00.000Z",
          entry_quantity: 10,
          max_abs_quantity: 10,
          avg_entry_price: 20,
          avg_exit_price: 21,
          realized_pnl: 8,
          total_fees: 2,
        },
        error: null,
      }),
    }));
    const tradeFirstEq = vi.fn(() => ({ eq: tradeSecondEq }));
    const tradeSelect = vi.fn(() => ({ eq: tradeFirstEq }));

    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          allocated_quantity: 10,
          allocation_role: "ENTRY",
          allocation_price: 20,
          fills: {
            id: "fill-1",
            source_fill_id: "exec-1",
            side: "BUY",
            quantity: 10,
            price: 20,
            executed_at: "2026-01-08T15:18:00.000Z",
            commission: 0,
            sec_fee: 1,
            raw_payload: { route: "ARCA" },
          },
        },
        {
          allocated_quantity: 10,
          allocation_role: "EXIT",
          allocation_price: 21,
          fills: {
            id: "fill-2",
            source_fill_id: "exec-2",
            side: "SELL",
            quantity: 10,
            price: 21,
            executed_at: "2026-01-08T19:05:00.000Z",
            commission: 0,
            sec_fee: 1,
            raw_payload: { route: "NSDQ" },
          },
        },
      ],
      error: null,
    });
    const fillsSecondEq = vi.fn(() => ({ order: fillsOrder }));
    const fillsFirstEq = vi.fn(() => ({ eq: fillsSecondEq }));
    const fillsSelect = vi.fn(() => ({ eq: fillsFirstEq }));
    const from = vi.fn((table: string) => {
      if (table === "trades") {
        return { select: tradeSelect };
      }

      return { select: fillsSelect };
    });

    await expect(
      getTradeDetail("user-1", "trade-1", { client: { from } }),
    ).resolves.toMatchObject({
      id: "trade-1",
      symbol: "ZSL",
      entryQuantity: 10,
      avgEntryPrice: 20,
      avgExitPrice: 21,
      fills: [
        {
          id: "fill-1",
          sourceFillId: "exec-1",
          allocationRole: "ENTRY",
          side: "BUY",
          allocatedQuantity: 10,
          fees: 1,
        },
        {
          id: "fill-2",
          sourceFillId: "exec-2",
          allocationRole: "EXIT",
          side: "SELL",
          allocatedQuantity: 10,
          fees: 1,
        },
      ],
    });
  });

  it("reconstructs detail fills from stored fills when trade allocations are not persisted yet", async () => {
    const tradeSecondEq = vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "trade-1",
          account_id: "account-1",
          reconstruction_key: "account-1:ZSL:fill-1",
          symbol: "ZSL",
          direction: "LONG",
          status: "CLOSED",
          opened_at: "2026-01-08T15:18:00.000Z",
          closed_at: "2026-01-08T19:05:00.000Z",
          entry_quantity: 10,
          max_abs_quantity: 10,
          avg_entry_price: 20,
          avg_exit_price: 21,
          realized_pnl: 8,
          total_fees: 2,
        },
        error: null,
      }),
    }));
    const tradeFirstEq = vi.fn(() => ({ eq: tradeSecondEq }));
    const tradeSelect = vi.fn(() => ({ eq: tradeFirstEq }));

    const tradeFillsOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const tradeFillsSecondEq = vi.fn(() => ({ order: tradeFillsOrder }));
    const tradeFillsFirstEq = vi.fn(() => ({ eq: tradeFillsSecondEq }));
    const tradeFillsSelect = vi.fn(() => ({ eq: tradeFillsFirstEq }));

    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        detailStoredFill({
          id: "fill-1",
          side: "BUY",
          quantity: 10,
          price: 20,
          executedAt: "2026-01-08T15:18:00.000Z",
          fees: 1,
        }),
        detailStoredFill({
          id: "fill-2",
          side: "SELL",
          quantity: 10,
          price: 21,
          executedAt: "2026-01-08T19:05:00.000Z",
          fees: 1,
        }),
      ],
      error: null,
    });
    const fillsLte = vi.fn(() => ({ order: fillsOrder }));
    const fillsGte = vi.fn(() => ({ lte: fillsLte }));
    const fillsSymbolEq = vi.fn(() => ({ gte: fillsGte }));
    const fillsAccountEq = vi.fn(() => ({ eq: fillsSymbolEq }));
    const fillsUserEq = vi.fn(() => ({ eq: fillsAccountEq }));
    const fillsSelect = vi.fn(() => ({ eq: fillsUserEq }));
    const from = vi.fn((table: string) => {
      if (table === "trades") {
        return { select: tradeSelect };
      }
      if (table === "trade_fills") {
        return { select: tradeFillsSelect };
      }

      return { select: fillsSelect };
    });

    await expect(
      getTradeDetail("user-1", "trade-1", {
        client: { from },
        now: new Date("2026-05-28T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      fills: [
        {
          id: "fill-1",
          allocationRole: "ENTRY",
          side: "BUY",
          allocatedQuantity: 10,
        },
        {
          id: "fill-2",
          allocationRole: "EXIT",
          side: "SELL",
          allocatedQuantity: 10,
        },
      ],
    });
  });

  it("adds trade chart datasets when a market data provider is available", async () => {
    const tradeSecondEq = vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "trade-1",
          account_id: "account-1",
          reconstruction_key: "account-1:ZSL:fill-1",
          symbol: "ZSL",
          direction: "LONG",
          status: "CLOSED",
          opened_at: "2026-01-08T15:18:00.000Z",
          closed_at: "2026-01-08T19:05:00.000Z",
          entry_quantity: 10,
          max_abs_quantity: 10,
          avg_entry_price: 20,
          avg_exit_price: 21,
          realized_pnl: 8,
          total_fees: 2,
        },
        error: null,
      }),
    }));
    const tradeFirstEq = vi.fn(() => ({ eq: tradeSecondEq }));
    const tradeSelect = vi.fn(() => ({ eq: tradeFirstEq }));
    const tradeFillsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          allocated_quantity: 10,
          allocation_role: "ENTRY",
          allocation_price: 20,
          fills: detailStoredFill({
            id: "fill-1",
            side: "BUY",
            quantity: 10,
            price: 20,
            executedAt: "2026-01-08T15:18:00.000Z",
            fees: 1,
          }),
        },
      ],
      error: null,
    });
    const tradeFillsSecondEq = vi.fn(() => ({ order: tradeFillsOrder }));
    const tradeFillsFirstEq = vi.fn(() => ({ eq: tradeFillsSecondEq }));
    const tradeFillsSelect = vi.fn(() => ({ eq: tradeFillsFirstEq }));
    const marketDataOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const marketDataSelect = vi.fn(() => ({
      eq: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({ order: marketDataOrder }),
              }),
            }),
          }),
        }),
      }),
    }));
    const marketDataUpsert = vi.fn().mockResolvedValue({ error: null });
    const requestInsert = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from: vi.fn((table: string) => {
        if (table === "trades") {
          return { select: tradeSelect };
        }
        if (table === "trade_fills") {
          return { select: tradeFillsSelect };
        }
        if (table === "ohlcv_bars") {
          return { select: marketDataSelect, upsert: marketDataUpsert };
        }

        return { insert: requestInsert };
      }),
    };
    const provider = {
      name: "massive",
      getAggregateBars: vi.fn().mockResolvedValue([]),
    };

    await expect(
      getTradeDetail("user-1", "trade-1", {
        client,
        marketDataClient: client,
        marketDataProvider: provider,
      }),
    ).resolves.toMatchObject({
      charts: {
        charts: expect.arrayContaining([
          expect.objectContaining({ id: "daily" }),
          expect.objectContaining({ id: "weekly" }),
        ]),
        error: null,
      },
    });
  });

  it("keeps the trade detail page available when market data fails", async () => {
    const tradeSecondEq = vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "trade-1",
          account_id: "account-1",
          reconstruction_key: "account-1:ZSL:fill-1",
          symbol: "ZSL",
          direction: "LONG",
          status: "CLOSED",
          opened_at: "2026-01-08T15:18:00.000Z",
          closed_at: "2026-01-08T19:05:00.000Z",
          entry_quantity: 10,
          max_abs_quantity: 10,
          avg_entry_price: 20,
          avg_exit_price: 21,
          realized_pnl: 8,
          total_fees: 2,
        },
        error: null,
      }),
    }));
    const tradeFirstEq = vi.fn(() => ({ eq: tradeSecondEq }));
    const tradeSelect = vi.fn(() => ({ eq: tradeFirstEq }));
    const tradeFillsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          allocated_quantity: 10,
          allocation_role: "ENTRY",
          allocation_price: 20,
          fills: detailStoredFill({
            id: "fill-1",
            side: "BUY",
            quantity: 10,
            price: 20,
            executedAt: "2026-01-08T15:18:00.000Z",
            fees: 1,
          }),
        },
      ],
      error: null,
    });
    const tradeFillsSecondEq = vi.fn(() => ({ order: tradeFillsOrder }));
    const tradeFillsFirstEq = vi.fn(() => ({ eq: tradeFillsSecondEq }));
    const tradeFillsSelect = vi.fn(() => ({ eq: tradeFillsFirstEq }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "trades") {
          return { select: tradeSelect };
        }

        return { select: tradeFillsSelect };
      }),
    };
    const marketDataOrder = vi.fn().mockResolvedValue({
      data: null,
      error: new Error("relation ohlcv_bars does not exist"),
    });
    const marketDataClient = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    lte: () => ({ order: marketDataOrder }),
                  }),
                }),
              }),
            }),
          }),
        }),
      })),
    };
    const provider = {
      name: "massive",
      getAggregateBars: vi.fn().mockResolvedValue([]),
    };

    await expect(
      getTradeDetail("user-1", "trade-1", {
        client,
        marketDataClient,
        marketDataProvider: provider,
      }),
    ).resolves.toMatchObject({
      id: "trade-1",
      charts: {
        charts: [],
        error: "Market data unavailable: relation ohlcv_bars does not exist",
      },
    });
  });
});

function detailStoredFill(input: {
  id: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  executedAt: string;
  fees: number;
}) {
  return {
    id: input.id,
    user_id: "user-1",
    account_id: "account-1",
    broker: "tradezero",
    source_type: "api",
    source_fill_id: input.id,
    idempotency_key: `tradezero_api|TZ123|${input.id}`,
    symbol: "ZSL",
    asset_class: "equity",
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    executed_at: input.executedAt,
    executed_tz: "America/New_York",
    trade_date: input.executedAt.slice(0, 10),
    currency: "USD",
    commission: 0,
    sec_fee: input.fees,
    raw_payload: {},
  };
}
