import { describe, expect, it, vi } from "vitest";

import { replaceReconstructedTrades } from "@/lib/sync/tradezero-sync";

describe("replaceReconstructedTrades", () => {
  it("preserves trade ids for reconstructed trades that still exist", async () => {
    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        storedFill({
          id: "stable-entry",
          side: "BUY",
          quantity: 10,
          price: 20,
          executedAt: "2026-01-08T15:18:00.000Z",
          fees: 1,
          symbol: "STBL",
        }),
      ],
      error: null,
    });
    const fillsLte = vi.fn(() => ({ order: fillsOrder }));
    const fillsGte = vi.fn(() => ({ lte: fillsLte }));
    const fillsIn = vi.fn(() => ({ gte: fillsGte }));
    const fillsEq = vi.fn(() => ({ in: fillsIn }));
    const fillsSelect = vi.fn(() => ({ eq: fillsEq }));

    const existingTradesLt = vi.fn().mockResolvedValue({
      data: [
        {
          id: "existing-stable-trade",
          reconstruction_key: "account-1:STBL:stable-entry",
        },
        {
          id: "stale-trade",
          reconstruction_key: "account-1:OLD:old-entry",
        },
      ],
      error: null,
    });
    const existingTradesGte = vi.fn(() => ({ lt: existingTradesLt }));
    const existingTradesIn = vi.fn(() => ({ gte: existingTradesGte }));
    const existingTradesEq = vi.fn(() => ({ in: existingTradesIn }));
    const tradesSelect = vi.fn(() => ({ eq: existingTradesEq }));
    const deleteStaleTradesById = vi.fn().mockResolvedValue({ error: null });
    const deleteStaleTradesEq = vi.fn(() => ({ in: deleteStaleTradesById }));
    const deleteTrades = vi.fn(() => ({ eq: deleteStaleTradesEq }));
    const selectUpsertedTrades = vi.fn().mockResolvedValue({
      data: [
        {
          id: "existing-stable-trade",
          reconstruction_key: "account-1:STBL:stable-entry",
        },
      ],
      error: null,
    });
    const upsert = vi.fn(() => ({ select: selectUpsertedTrades }));
    const deleteTradeFillsByTradeId = vi.fn().mockResolvedValue({ error: null });
    const deleteTradeFillsEq = vi.fn(() => ({ in: deleteTradeFillsByTradeId }));
    const deleteTradeFills = vi.fn(() => ({ eq: deleteTradeFillsEq }));
    const insertTradeFills = vi.fn().mockResolvedValue({ error: null });
    const stopGroupsTable = emptyStopGroupsTable();
    const from = vi.fn((table: string) => {
      if (table === "fills") {
        return { select: fillsSelect };
      }
      if (table === "trade_fills") {
        return { delete: deleteTradeFills, insert: insertTradeFills };
      }
      if (table === "trade_stop_groups") {
        return stopGroupsTable;
      }

      return {
        delete: deleteTrades,
        select: tradesSelect,
        upsert,
      };
    });

    await replaceReconstructedTrades({
      client: { from },
      marketDataProvider: null,
      userId: "user-1",
      accountIds: ["account-1"],
      fromDate: "2026-01-01",
      toDate: "2026-05-28",
    });

    expect(tradesSelect).toHaveBeenCalledWith("id,reconstruction_key");
    expect(deleteStaleTradesById).toHaveBeenCalledWith("id", ["stale-trade"]);
    expect(deleteTradeFillsByTradeId).toHaveBeenCalledWith("trade_id", [
      "existing-stable-trade",
    ]);
    expect(insertTradeFills).toHaveBeenCalledWith([
      expect.objectContaining({
        trade_id: "existing-stable-trade",
        fill_id: "stable-entry",
        allocation_role: "ENTRY",
      }),
    ]);
  });

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
        return tradeFillsTable(insertTradeFills);
      }

      return {
        delete: deleteTrades,
        select: emptyTradesSelect(),
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

  it("rebuilds from stored historical fills when an incremental sync closes older trades", async () => {
    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        storedFill({
          id: "twlo-old-entry",
          side: "BUY",
          quantity: 5,
          price: 198.15,
          executedAt: "2026-06-01T13:39:12.000Z",
          fees: 1,
          symbol: "TWLO",
        }),
        storedFill({
          id: "twlo-window-exit",
          side: "SELL",
          quantity: 5,
          price: 195.55,
          executedAt: "2026-06-09T16:20:37.000Z",
          fees: 1,
          symbol: "TWLO",
        }),
      ],
      error: null,
    });
    const fillsLte = vi.fn(() => ({ order: fillsOrder }));
    const fillsGte = vi.fn(() => ({ lte: fillsLte }));
    const fillsIn = vi.fn(() => ({ gte: fillsGte }));
    const fillsEq = vi.fn(() => ({ in: fillsIn }));
    const fillsSelect = vi.fn(() => ({ eq: fillsEq }));

    const existingTradesLt = vi.fn().mockResolvedValue({
      data: [
        {
          id: "existing-twlo-open",
          reconstruction_key: "account-1:TWLO:twlo-old-entry",
        },
        {
          id: "stale-twlo-short",
          reconstruction_key: "account-1:TWLO:twlo-window-exit",
        },
      ],
      error: null,
    });
    const existingTradesGte = vi.fn(() => ({ lt: existingTradesLt }));
    const existingTradesIn = vi.fn(() => ({ gte: existingTradesGte }));
    const existingTradesEq = vi.fn(() => ({ in: existingTradesIn }));
    const tradesSelect = vi.fn(() => ({ eq: existingTradesEq }));
    const deleteStaleTradesById = vi.fn().mockResolvedValue({ error: null });
    const deleteStaleTradesEq = vi.fn(() => ({ in: deleteStaleTradesById }));
    const deleteTrades = vi.fn(() => ({ eq: deleteStaleTradesEq }));
    const selectUpsertedTrades = vi.fn().mockResolvedValue({
      data: [
        {
          id: "existing-twlo-open",
          reconstruction_key: "account-1:TWLO:twlo-old-entry",
        },
      ],
      error: null,
    });
    const upsert = vi.fn(() => ({ select: selectUpsertedTrades }));
    const insertTradeFills = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "fills") {
        return { select: fillsSelect };
      }
      if (table === "trade_fills") {
        return tradeFillsTable(insertTradeFills);
      }

      return {
        delete: deleteTrades,
        select: tradesSelect,
        upsert,
      };
    });

    await replaceReconstructedTrades({
      client: { from },
      userId: "user-1",
      accountIds: ["account-1"],
      fromDate: "2026-06-07",
      toDate: "2026-06-10",
    });

    expect(fillsGte).toHaveBeenCalledWith("trade_date", "2025-12-01");
    expect(existingTradesGte).toHaveBeenCalledWith(
      "opened_at",
      "2025-12-01T00:00:00.000Z",
    );
    expect(deleteStaleTradesById).toHaveBeenCalledWith("id", ["stale-twlo-short"]);
    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        reconstruction_key: "account-1:TWLO:twlo-old-entry",
        symbol: "TWLO",
        direction: "LONG",
        status: "CLOSED",
        closed_at: "2026-06-09T16:20:37.000Z",
        entry_quantity: 5,
        avg_exit_price: 195.55,
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
        return tradeFillsTable(insertTradeFills);
      }

      return {
        delete: deleteTrades,
        select: emptyTradesSelect(),
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
        return tradeFillsTable(insertTradeFills);
      }
      if (table === "trade_stop_groups") {
        return stopGroupsTable;
      }

      return {
        delete: deleteTrades,
        select: emptyTradesSelect(),
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

  it("reduces entry-day stop quantities by later partial exits", async () => {
    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        storedFill({
          id: "entry-day-1",
          side: "BUY",
          quantity: 10,
          price: 20,
          executedAt: "2026-01-08T15:18:00.000Z",
          fees: 1,
          symbol: "PART",
        }),
        storedFill({
          id: "entry-day-2",
          side: "BUY",
          quantity: 8,
          price: 25,
          executedAt: "2026-01-09T15:18:00.000Z",
          fees: 1,
          symbol: "PART",
        }),
        storedFill({
          id: "partial-exit",
          side: "SELL",
          quantity: 12,
          price: 24,
          executedAt: "2026-01-10T15:18:00.000Z",
          fees: 1,
          symbol: "PART",
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
      data: [{ id: "trade-part", reconstruction_key: "account-1:PART:entry-day-1" }],
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
        return tradeFillsTable(insertTradeFills);
      }
      if (table === "trade_stop_groups") {
        return stopGroupsTable;
      }

      return {
        delete: deleteTrades,
        select: emptyTradesSelect(),
        upsert,
      };
    });

    await replaceReconstructedTrades({
      client: { from },
      marketDataProvider: null,
      userId: "user-1",
      accountIds: ["account-1"],
      fromDate: "2026-01-01",
      toDate: "2026-05-28",
    });

    expect(stopGroupsTable.deleteByReconstructionKey).toHaveBeenCalledWith(
      "reconstruction_key",
      ["account-1:PART:entry-day-1"],
    );
    expect(stopGroupsTable.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          entry_date: "2026-01-09",
          quantity: 6,
          avg_entry_price: 25,
        }),
      ],
      { onConflict: "user_id,reconstruction_key,entry_date" },
    );
  });

  it("caps persisted stop groups to the live broker position quantity", async () => {
    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        storedFill({
          id: "entry",
          side: "BUY",
          quantity: 20,
          price: 14.47,
          executedAt: "2026-05-11T13:51:49.000Z",
          fees: 1,
          symbol: "FCEL",
        }),
        storedFill({
          id: "known-exit",
          side: "SELL",
          quantity: 6,
          price: 17.8,
          executedAt: "2026-05-13T12:58:55.000Z",
          fees: 1,
          symbol: "FCEL",
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
      data: [{ id: "trade-fcel", reconstruction_key: "account-1:FCEL:entry" }],
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
        return tradeFillsTable(insertTradeFills);
      }
      if (table === "trade_stop_groups") {
        return stopGroupsTable;
      }

      return {
        delete: deleteTrades,
        select: emptyTradesSelect(),
        upsert,
      };
    });

    await replaceReconstructedTrades({
      client: { from },
      marketDataProvider: null,
      userId: "user-1",
      accountIds: ["account-1"],
      fromDate: "2026-01-01",
      toDate: "2026-05-28",
      positionSnapshots: [
        {
          accountId: "account-1",
          symbol: "FCEL",
          quantity: 7,
        },
      ],
    });

    expect(stopGroupsTable.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          entry_date: "2026-05-11",
          quantity: 7,
          avg_entry_price: 14.47,
        }),
      ],
      { onConflict: "user_id,reconstruction_key,entry_date" },
    );
  });

  it("continues rebuilding trades when stop group migration is not applied yet", async () => {
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
      data: [{ id: "trade-long", reconstruction_key: "account-1:LONG:long-open" }],
      error: null,
    });
    const upsert = vi.fn(() => ({ select: selectUpsertedTrades }));
    const insertTradeFills = vi.fn().mockResolvedValue({ error: null });
    const stopGroupsTable = missingStopGroupsTable();
    const from = vi.fn((table: string) => {
      if (table === "fills") {
        return { select: fillsSelect };
      }
      if (table === "trade_fills") {
        return tradeFillsTable(insertTradeFills);
      }
      if (table === "trade_stop_groups") {
        return stopGroupsTable;
      }

      return {
        delete: deleteTrades,
        select: emptyTradesSelect(),
        upsert,
      };
    });

    await expect(
      replaceReconstructedTrades({
        client: { from },
        marketDataProvider: null,
        userId: "user-1",
        accountIds: ["account-1"],
        fromDate: "2026-01-01",
        toDate: "2026-05-28",
      }),
    ).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledOnce();
    expect(insertTradeFills).toHaveBeenCalledOnce();
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

function emptyTradesSelect() {
  const lt = vi.fn().mockResolvedValue({ data: [], error: null });
  const gte = vi.fn(() => ({ lt }));
  const accountIn = vi.fn(() => ({ gte }));
  const userEq = vi.fn(() => ({ in: accountIn }));

  return vi.fn(() => ({ eq: userEq }));
}

function tradeFillsTable(insertTradeFills: ReturnType<typeof vi.fn>) {
  const deleteByTradeId = vi.fn().mockResolvedValue({ error: null });

  return {
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: deleteByTradeId,
      })),
    })),
    insert: insertTradeFills,
  };
}

function emptyStopGroupsTable() {
  const deleteByReconstructionKey = vi.fn().mockResolvedValue({ error: null });

  return {
    deleteByReconstructionKey,
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: deleteByReconstructionKey,
      })),
    })),
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  };
}

function missingStopGroupsTable() {
  const error = {
    code: "PGRST205",
    message: "Could not find the table 'public.trade_stop_groups'",
  };

  return {
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ error }),
      })),
    })),
    upsert: vi.fn().mockResolvedValue({ error }),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        in: vi.fn().mockResolvedValue({ data: null, error }),
      })),
    })),
  };
}
