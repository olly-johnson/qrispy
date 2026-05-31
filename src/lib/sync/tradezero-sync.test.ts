import { describe, expect, it, vi } from "vitest";

import { replaceReconstructedTrades } from "@/lib/sync/tradezero-sync";

describe("replaceReconstructedTrades", () => {
  it("rebuilds trades from stored fills and deletes stale reconstructed rows", async () => {
    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        storedFill({
          id: "fill-1",
          side: "SELL",
          quantity: 35,
          price: 14.65,
          executedAt: "2026-01-08T15:18:00.000Z",
          fees: 1,
        }),
        storedFill({
          id: "fill-2",
          side: "BUY",
          quantity: 35,
          price: 13.56,
          executedAt: "2026-01-08T19:05:00.000Z",
          fees: 0.99,
        }),
      ],
      error: null,
    });
    const fillsLte = vi.fn(() => ({ order: fillsOrder }));
    const fillsGte = vi.fn(() => ({ lte: fillsLte }));
    const fillsIn = vi.fn(() => ({ gte: fillsGte }));
    const fillsEq = vi.fn(() => ({ in: fillsIn }));
    const fillsSelect = vi.fn(() => ({ eq: fillsEq }));

    const deleteLt = vi.fn().mockResolvedValue({ error: null });
    const deleteGte = vi.fn(() => ({ lt: deleteLt }));
    const deleteIn = vi.fn(() => ({ gte: deleteGte }));
    const deleteEq = vi.fn(() => ({ in: deleteIn }));
    const deleteTrades = vi.fn(() => ({ eq: deleteEq }));
    const selectUpsertedTrades = vi.fn().mockResolvedValue({
      data: [{ id: "trade-crml", reconstruction_key: "account-1:CRML:fill-1" }],
      error: null,
    });
    const upsert = vi.fn(() => ({ select: selectUpsertedTrades }));
    const insertTradeFills = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "fills") {
        return { select: fillsSelect };
      }
      if (table === "trade_fills") {
        return { insert: insertTradeFills };
      }

      return {
        delete: deleteTrades,
        upsert,
      };
    });

    await replaceReconstructedTrades({
      client: { from },
      userId: "user-1",
      accountIds: ["account-1"],
      fromDate: "2026-01-01",
      toDate: "2026-05-28",
    });

    expect(deleteTrades).toHaveBeenCalledOnce();
    expect(deleteGte).toHaveBeenCalledWith("opened_at", "2026-01-01T00:00:00.000Z");
    expect(deleteLt).toHaveBeenCalledWith("opened_at", "2026-05-29T00:00:00.000Z");
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        symbol: "CRML",
        direction: "SHORT",
        status: "CLOSED",
        entry_quantity: 35,
        realized_pnl: 37.16,
      }),
    ]);
    expect(insertTradeFills).toHaveBeenCalledWith([
      expect.objectContaining({
        trade_id: "trade-crml",
        fill_id: "fill-1",
        allocation_role: "ENTRY",
      }),
      expect.objectContaining({
        trade_id: "trade-crml",
        fill_id: "fill-2",
        allocation_role: "EXIT",
      }),
    ]);
  });

  it("does not recreate ignored open December trades during reconstruction", async () => {
    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        storedFill({
          id: "agq-dec-open",
          side: "SELL",
          quantity: 13,
          price: 153.9992,
          executedAt: "2025-12-10T14:56:21.000Z",
          fees: 3,
          symbol: "AGQ",
        }),
        storedFill({
          id: "jan-closed-entry",
          side: "BUY",
          quantity: 10,
          price: 20,
          executedAt: "2026-01-08T15:18:00.000Z",
          fees: 1,
          symbol: "ZSL",
        }),
        storedFill({
          id: "jan-closed-exit",
          side: "SELL",
          quantity: 10,
          price: 21,
          executedAt: "2026-01-08T19:05:00.000Z",
          fees: 1,
          symbol: "ZSL",
        }),
      ],
      error: null,
    });
    const fillsLte = vi.fn(() => ({ order: fillsOrder }));
    const fillsGte = vi.fn(() => ({ lte: fillsLte }));
    const fillsIn = vi.fn(() => ({ gte: fillsGte }));
    const fillsEq = vi.fn(() => ({ in: fillsIn }));
    const fillsSelect = vi.fn(() => ({ eq: fillsEq }));

    const deleteLt = vi.fn().mockResolvedValue({ error: null });
    const deleteGte = vi.fn(() => ({ lt: deleteLt }));
    const deleteIn = vi.fn(() => ({ gte: deleteGte }));
    const deleteEq = vi.fn(() => ({ in: deleteIn }));
    const deleteTrades = vi.fn(() => ({ eq: deleteEq }));
    const selectUpsertedTrades = vi.fn().mockResolvedValue({
      data: [{ id: "trade-zsl", reconstruction_key: "account-1:ZSL:jan-closed-entry" }],
      error: null,
    });
    const upsert = vi.fn(() => ({ select: selectUpsertedTrades }));
    const insertTradeFills = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "fills") {
        return { select: fillsSelect };
      }
      if (table === "trade_fills") {
        return { insert: insertTradeFills };
      }

      return {
        delete: deleteTrades,
        upsert,
      };
    });

    await replaceReconstructedTrades({
      client: { from },
      userId: "user-1",
      accountIds: ["account-1"],
      fromDate: "2025-12-01",
      toDate: "2026-05-28",
    });

    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        symbol: "ZSL",
        status: "CLOSED",
      }),
    ]);
  });

  it("sets default stops for open trades from the entry day range", async () => {
    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        storedFill({
          id: "long-open",
          side: "BUY",
          quantity: 10,
          price: 20,
          executedAt: "2026-01-08T15:18:00.000Z",
          fees: 1,
          symbol: "LONG",
        }),
        storedFill({
          id: "short-open",
          side: "SELL",
          quantity: 5,
          price: 40,
          executedAt: "2026-01-08T15:20:00.000Z",
          fees: 1,
          symbol: "SHORT",
        }),
      ],
      error: null,
    });
    const fillsLte = vi.fn(() => ({ order: fillsOrder }));
    const fillsGte = vi.fn(() => ({ lte: fillsLte }));
    const fillsIn = vi.fn(() => ({ gte: fillsGte }));
    const fillsEq = vi.fn(() => ({ in: fillsIn }));
    const fillsSelect = vi.fn(() => ({ eq: fillsEq }));

    const deleteLt = vi.fn().mockResolvedValue({ error: null });
    const deleteGte = vi.fn(() => ({ lt: deleteLt }));
    const deleteIn = vi.fn(() => ({ gte: deleteGte }));
    const deleteEq = vi.fn(() => ({ in: deleteIn }));
    const deleteTrades = vi.fn(() => ({ eq: deleteEq }));
    const selectUpsertedTrades = vi.fn().mockResolvedValue({
      data: [
        { id: "trade-long", reconstruction_key: "account-1:LONG:long-open" },
        { id: "trade-short", reconstruction_key: "account-1:SHORT:short-open" },
      ],
      error: null,
    });
    const upsert = vi.fn(() => ({ select: selectUpsertedTrades }));
    const insertTradeFills = vi.fn().mockResolvedValue({ error: null });
    const stopGroupsTable = emptyStopGroupsTable();
    const from = vi.fn((table: string) => {
      if (table === "fills") {
        return { select: fillsSelect };
      }
      if (table === "trade_fills") {
        return { insert: insertTradeFills };
      }
      if (table === "trade_stop_groups") {
        return stopGroupsTable;
      }

      return {
        delete: deleteTrades,
        upsert,
      };
    });
    const marketDataProvider = {
      name: "massive",
      getAggregateBars: vi.fn(async (request) => [
        {
          provider: "massive",
          symbol: request.symbol,
          timeframe: "1d" as const,
          barStartAt: "2026-01-08T00:00:00.000Z",
          open: 30,
          high: request.symbol === "SHORT" ? 44 : 22,
          low: request.symbol === "LONG" ? 18 : 36,
          close: 31,
          volume: 1000,
          adjusted: false,
          rawPayload: {},
        },
      ]),
    };

    await replaceReconstructedTrades({
      client: { from },
      marketDataClient: emptyMarketDataClient(),
      marketDataProvider,
      userId: "user-1",
      accountIds: ["account-1"],
      fromDate: "2026-01-01",
      toDate: "2026-05-28",
    });

    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        symbol: "LONG",
        status: "OPEN",
        initial_stop_price: 18,
      }),
      expect.objectContaining({
        symbol: "SHORT",
        status: "OPEN",
        initial_stop_price: 44,
      }),
    ]);
    expect(stopGroupsTable.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          trade_id: "trade-long",
          reconstruction_key: "account-1:LONG:long-open",
          entry_date: "2026-01-08",
          quantity: 10,
          avg_entry_price: 20,
          stop_loss_price: 18,
        }),
        expect.objectContaining({
          trade_id: "trade-short",
          reconstruction_key: "account-1:SHORT:short-open",
          entry_date: "2026-01-08",
          quantity: 5,
          avg_entry_price: 40,
          stop_loss_price: 44,
        }),
      ],
      { onConflict: "user_id,reconstruction_key,entry_date" },
    );
  });
});

function storedFill(input: {
  id: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  executedAt: string;
  fees: number;
  symbol?: string;
}) {
  return {
    id: input.id,
    user_id: "user-1",
    account_id: "account-1",
    broker: "tradezero",
    source_type: "api",
    source_fill_id: input.id,
    idempotency_key: `tradezero_api|TZ123|${input.id}`,
    symbol: input.symbol ?? "CRML",
    asset_class: "equity",
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    executed_at: input.executedAt,
    executed_tz: "America/New_York",
    trade_date: input.executedAt.slice(0, 10),
    currency: "USD",
    commission: 0,
    fees: input.fees,
    sec_fee: input.fees,
    net_proceeds: null,
    raw_payload: {},
  };
}

function emptyMarketDataClient() {
  const client = {
    upsertedBars: [] as Record<string, unknown>[],
    insertedRequests: [] as Record<string, unknown>[],
    from(table: string) {
      if (table === "ohlcv_bars") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    gte: () => ({
                      lte: () => ({
                        order: vi.fn().mockResolvedValue({ data: [], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          upsert: vi.fn((rows) => {
            client.upsertedBars.push(...rows);
            return Promise.resolve({ error: null });
          }),
        };
      }

      return {
        insert: vi.fn((row) => {
          client.insertedRequests.push(row);
          return Promise.resolve({ error: null });
        }),
      };
    },
  };

  return client;
}

function emptyStopGroupsTable() {
  return {
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  };
}
