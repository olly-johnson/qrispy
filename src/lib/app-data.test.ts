import { describe, expect, it, vi } from "vitest";

import {
  attachPositionStopGroups,
  getDashboardData,
  getTradeDetail,
  getTradeHistory,
  getTradeReviewGroupDetail,
  loadStopGroupRows,
  mapLatestPositions,
} from "@/lib/app-data";
import { getTradeReviewGroupCharts } from "@/lib/market-data/trade-charts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: vi.fn(() => null),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/market-data/trade-charts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/market-data/trade-charts")>();

  return {
    ...actual,
    getTradeReviewGroupCharts: vi.fn(),
  };
});

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
        accountId: "account-1",
        symbol: "DOCN",
        quantity: 4,
        averagePrice: 102.36,
        marketValue: 614.16,
        unrealizedPnl: 204.72,
        stopUnrealizedPnl: null,
        stopGroups: [],
      },
      {
        id: "latest-fcel",
        accountId: "account-1",
        symbol: "FCEL",
        quantity: 14,
        averagePrice: 14.47,
        marketValue: 336.84,
        unrealizedPnl: 134.26,
        stopUnrealizedPnl: null,
        stopGroups: [],
      },
    ]);
  });
});

describe("attachPositionStopGroups", () => {
  it("adds one editable stop group per open entry date", () => {
    const positions = mapLatestPositions([
      {
        id: "latest-docn",
        account_id: "account-1",
        snapshot_at: "2026-05-28T16:39:00Z",
        symbol: "DOCN",
        quantity: 15,
        average_price: 100,
        market_value: 1500,
        unrealized_pnl: 0,
      },
      {
        id: "latest-zsl",
        account_id: "account-1",
        snapshot_at: "2026-05-28T16:39:00Z",
        symbol: "ZSL",
        quantity: -5,
        average_price: 40,
        market_value: -225,
        unrealized_pnl: -25,
      },
    ]);

    expect(
      attachPositionStopGroups(positions, [
        {
          stopGroupId: "group-1",
          tradeId: "trade-1",
          accountId: "account-1",
          symbol: "DOCN",
          direction: "LONG",
          openedAt: "2026-03-12T14:30:00.000Z",
          quantity: 10,
          avgEntryPrice: 90,
          stopLossPrice: 86,
        },
        {
          tradeId: "trade-2",
          accountId: "account-1",
          symbol: "DOCN",
          direction: "LONG",
          openedAt: "2026-04-04T14:30:00.000Z",
          quantity: 5,
          avgEntryPrice: 80,
          stopLossPrice: 82,
        },
        {
          tradeId: "trade-3",
          accountId: "account-1",
          symbol: "ZSL",
          direction: "SHORT",
          openedAt: "2026-01-29T14:30:00.000Z",
          quantity: 5,
          avgEntryPrice: 40,
          stopLossPrice: 45,
        },
      ]),
    ).toMatchObject([
      {
        symbol: "DOCN",
        stopUnrealizedPnl: -30,
        stopGroups: [
          {
            id: "group-1",
            tradeId: "trade-1",
            entryDate: "2026-03-12",
            quantity: 10,
            stopLossPrice: 86,
            stopUnrealizedPnl: -40,
          },
          {
            tradeId: "trade-2",
            entryDate: "2026-04-04",
            quantity: 5,
            stopLossPrice: 82,
            stopUnrealizedPnl: 10,
          },
        ],
      },
      {
        symbol: "ZSL",
        stopUnrealizedPnl: -25,
        stopGroups: [
          {
            tradeId: "trade-3",
            entryDate: "2026-01-29",
            quantity: 5,
            stopLossPrice: 45,
            stopUnrealizedPnl: -25,
          },
        ],
      },
    ]);
  });

  it("leaves the stop unrealized total empty when no stop groups have stop prices", () => {
    const positions = mapLatestPositions([
      {
        id: "latest-docn",
        account_id: "account-1",
        snapshot_at: "2026-05-28T16:39:00Z",
        symbol: "DOCN",
        quantity: 15,
        average_price: 100,
        market_value: 1500,
        unrealized_pnl: 0,
      },
    ]);

    expect(
      attachPositionStopGroups(positions, [
        {
          tradeId: "trade-1",
          accountId: "account-1",
          symbol: "DOCN",
          direction: "LONG",
          openedAt: "2026-03-12T14:30:00.000Z",
          quantity: 10,
          avgEntryPrice: 90,
          stopLossPrice: null,
        },
      ]),
    ).toMatchObject([
      {
        symbol: "DOCN",
        stopUnrealizedPnl: null,
      },
    ]);
  });

  it("caps stop groups to the latest broker position quantity", () => {
    const positions = mapLatestPositions([
      {
        id: "latest-fcel",
        account_id: "account-1",
        snapshot_at: "2026-06-01T13:54:40Z",
        symbol: "FCEL",
        quantity: 7,
        average_price: 14.47,
        market_value: 145.95,
        unrealized_pnl: 44.66,
      },
    ]);

    expect(
      attachPositionStopGroups(positions, [
        {
          stopGroupId: "group-1",
          tradeId: "trade-1",
          accountId: "account-1",
          symbol: "FCEL",
          direction: "LONG",
          openedAt: "2026-05-11T13:51:49.000Z",
          quantity: 14,
          avgEntryPrice: 14.47,
          stopLossPrice: 15.99,
        },
      ]),
    ).toMatchObject([
      {
        symbol: "FCEL",
        stopUnrealizedPnl: 10.64,
        stopGroups: [
          {
            id: "group-1",
            quantity: 7,
            stopUnrealizedPnl: 10.64,
          },
        ],
      },
    ]);
  });

  it("allocates a live position across multiple stop groups without over-counting", () => {
    const positions = mapLatestPositions([
      {
        id: "latest-docn",
        account_id: "account-1",
        snapshot_at: "2026-06-01T13:54:40Z",
        symbol: "DOCN",
        quantity: 12,
        average_price: 100,
        market_value: 1200,
        unrealized_pnl: 0,
      },
    ]);

    expect(
      attachPositionStopGroups(positions, [
        {
          stopGroupId: "older",
          tradeId: "trade-1",
          accountId: "account-1",
          symbol: "DOCN",
          direction: "LONG",
          openedAt: "2026-05-01T13:51:49.000Z",
          quantity: 10,
          avgEntryPrice: 100,
          stopLossPrice: 90,
        },
        {
          stopGroupId: "newer",
          tradeId: "trade-2",
          accountId: "account-1",
          symbol: "DOCN",
          direction: "LONG",
          openedAt: "2026-05-29T13:51:49.000Z",
          quantity: 10,
          avgEntryPrice: 100,
          stopLossPrice: 95,
        },
      ]),
    ).toMatchObject([
      {
        symbol: "DOCN",
        stopUnrealizedPnl: -110,
        stopGroups: [
          {
            id: "older",
            quantity: 10,
            stopUnrealizedPnl: -100,
          },
          {
            id: "newer",
            quantity: 2,
            stopUnrealizedPnl: -10,
          },
        ],
      },
    ]);
  });
});

describe("loadStopGroupRows", () => {
  it("falls back to no stop groups when the migration has not been applied", async () => {
    const order = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "PGRST205",
        message: "Could not find the table 'public.trade_stop_groups'",
      },
    });
    const inFilter = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ in: inFilter }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(
      loadStopGroupRows({
        client: { from },
        userId: "user-1",
        tradeIds: ["trade-1"],
      }),
    ).resolves.toEqual([]);
  });
});

describe("getDashboardData", () => {
  it("loads closed trades for all-trade and last-30 expectancy snapshots", async () => {
    const from = vi.fn((table: string) => {
      if (table === "account_portfolio_snapshots") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        };
      }

      if (table === "broker_position_snapshots") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        };
      }

      if (table === "trades") {
        const statusEq = vi.fn((column: string, value: string) => {
          if (column === "status" && value === "OPEN") {
            return {
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            };
          }

          if (column === "status" && value === "CLOSED") {
            return {
              order: vi.fn().mockResolvedValue({
                data: [
                  dashboardTradeRow({
                    id: "win",
                    closed_at: "2026-03-02T16:00:00.000Z",
                    realized_pnl: 120,
                  }),
                  dashboardTradeRow({
                    id: "loss",
                    closed_at: "2026-03-01T16:00:00.000Z",
                    realized_pnl: -60,
                  }),
                ],
                error: null,
              }),
            };
          }

          throw new Error(`Unexpected trades filter ${column}=${value}`);
        });

        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: string) => {
              if (column === "user_id" && value === "user-1") {
                return {
                  order: vi.fn(() => ({
                    limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                  })),
                  eq: statusEq,
                };
              }

              return {
                order: vi.fn(() => ({
                  limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
                eq: statusEq,
              };
            }),
          })),
        };
      }

      if (table === "job_runs") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);

    const data = await getDashboardData("user-1");

    expect(data.expectancy.all).toMatchObject({
      tradeCount: 2,
      winCount: 1,
      battingAverage: 0.5,
      averageGain: 120,
      averageLoss: 60,
      gainLossRatio: 2,
    });
    expect(data.expectancy.last30.tradeCount).toBe(2);
    expect(from).not.toHaveBeenCalledWith("trade_review_groups");
    expect(from).not.toHaveBeenCalledWith("trade_review_group_members");
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
    const emptyGroupOrder = vi.fn().mockResolvedValue({ data: [], error: null });
    const emptyGroupUserEq = vi.fn(() => ({ order: emptyGroupOrder }));
    const emptyGroupSelect = vi.fn(() => ({ eq: emptyGroupUserEq }));
    const from = vi.fn((table: string) => {
      if (table === "trades") {
        return { select };
      }

      return { select: emptyGroupSelect };
    });

    await expect(
      getTradeHistory("user-1", {
        client: { from },
        now: new Date("2026-05-28T12:00:00.000Z"),
      }),
    ).resolves.toEqual([
      {
        kind: "trade",
        trade: {
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
          reconstructionKey: "",
        },
      },
    ]);

    expect(from).toHaveBeenCalledWith("trades");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(lt).toHaveBeenCalledWith("opened_at", "2026-05-29T00:00:00.000Z");
    expect(order).toHaveBeenCalledWith("opened_at", { ascending: false });
    expect(JSON.stringify({ from: from.mock.calls })).not.toContain("limit");
  });

  it("collapses current review-group members while leaving other trades available", async () => {
    const trades = [
      tradeHistoryRow({
        id: "car-long",
        reconstructionKey: "car-long-key",
        symbol: "CAR",
        direction: "LONG",
        openedAt: "2026-06-02T14:30:00.000Z",
        closedAt: "2026-06-03T14:30:00.000Z",
        realizedPnl: -20,
        totalFees: 2,
      }),
      tradeHistoryRow({
        id: "car-short",
        reconstructionKey: "car-short-key",
        symbol: "CAR",
        direction: "SHORT",
        openedAt: "2026-06-10T14:30:00.000Z",
        closedAt: "2026-06-12T14:30:00.000Z",
        realizedPnl: -30,
        totalFees: 3,
      }),
      tradeHistoryRow({
        id: "amd",
        reconstructionKey: "amd-key",
        symbol: "AMD",
        direction: "LONG",
        openedAt: "2026-06-14T14:30:00.000Z",
        closedAt: "2026-06-15T14:30:00.000Z",
        realizedPnl: 10,
        totalFees: 1,
      }),
    ];
    const from = historyClient({
      trades,
      groups: [
        {
          id: "group-1",
          custom_name: null,
          symbol: "CAR",
          created_at: "2026-06-16T12:00:00.000Z",
          updated_at: "2026-06-16T12:00:00.000Z",
        },
      ],
      members: [
        { group_id: "group-1", reconstruction_key: "car-long-key" },
        { group_id: "group-1", reconstruction_key: "car-short-key" },
      ],
    });

    await expect(
      getTradeHistory("user-1", { client: { from } }),
    ).resolves.toMatchObject([
      {
        kind: "trade",
        trade: { id: "amd", reconstructionKey: "amd-key" },
      },
      {
        kind: "group",
        group: {
          id: "group-1",
          symbol: "CAR",
          tradeCount: 2,
          realizedPnl: -50,
          totalFees: 5,
        },
      },
    ]);
  });

  it("does not hide a current trade when its membership reconstruction key is stale", async () => {
    const from = historyClient({
      trades: [
        tradeHistoryRow({
          id: "car-current",
          reconstructionKey: "car-current-key",
          symbol: "CAR",
          direction: "SHORT",
          openedAt: "2026-06-10T14:30:00.000Z",
          closedAt: "2026-06-12T14:30:00.000Z",
          realizedPnl: -30,
          totalFees: 3,
        }),
      ],
      groups: [
        {
          id: "group-1",
          custom_name: null,
          symbol: "CAR",
          created_at: "2026-06-16T12:00:00.000Z",
          updated_at: "2026-06-16T12:00:00.000Z",
        },
      ],
      members: [{ group_id: "group-1", reconstruction_key: "stale-key" }],
    });

    await expect(
      getTradeHistory("user-1", { client: { from } }),
    ).resolves.toMatchObject([
      {
        kind: "trade",
        trade: { id: "car-current", reconstructionKey: "car-current-key" },
      },
    ]);
  });
});

describe("getTradeReviewGroupDetail", () => {
  it("loads an owner-scoped chronological timeline with allocated fills and group totals", async () => {
    const group = {
      id: "group-1",
      custom_name: "CAR campaign",
      symbol: "CAR",
      created_at: "2026-06-16T12:00:00.000Z",
      updated_at: "2026-06-16T12:00:00.000Z",
    };
    const memberRows = [
      { group_id: "group-1", reconstruction_key: "car-short-key" },
      { group_id: "group-1", reconstruction_key: "car-long-key" },
    ];
    const tradeRows = [
      tradeHistoryRow({
        id: "car-short",
        reconstructionKey: "car-short-key",
        symbol: "CAR",
        direction: "SHORT",
        openedAt: "2026-06-10T14:30:00.000Z",
        closedAt: "2026-06-12T14:30:00.000Z",
        realizedPnl: -30,
        totalFees: 3,
      }),
      tradeHistoryRow({
        id: "car-long",
        reconstructionKey: "car-long-key",
        symbol: "CAR",
        direction: "LONG",
        openedAt: "2026-06-02T14:30:00.000Z",
        closedAt: "2026-06-03T14:30:00.000Z",
        realizedPnl: -20,
        totalFees: 2,
      }),
    ];
    const fillsByTradeId = {
      "car-long": [allocatedFill("entry-long", "ENTRY", "BUY", "2026-06-02T14:30:00.000Z")],
      "car-short": [allocatedFill("exit-short", "EXIT", "BUY", "2026-06-12T14:30:00.000Z")],
    };
    const from = groupDetailClient({ group, memberRows, tradeRows, fillsByTradeId });
    vi.mocked(getTradeReviewGroupCharts).mockResolvedValueOnce({
      charts: [],
      error: null,
    });

    await expect(
      getTradeReviewGroupDetail("user-1", "group-1", {
        client: { from },
        marketDataClient: { from: vi.fn() },
        marketDataProvider: {
          name: "massive",
          getAggregateBars: vi.fn(),
        },
      }),
    ).resolves.toMatchObject({
      id: "group-1",
      label: "CAR campaign",
      symbol: "CAR",
      tradeCount: 2,
      realizedPnl: -50,
      totalFees: 5,
      charts: { charts: [], error: null },
      timeline: [
        {
          id: "car-long",
          direction: "LONG",
          reconstructionKey: "car-long-key",
          fills: [{ id: "entry-long", allocationRole: "ENTRY" }],
        },
        {
          id: "car-short",
          direction: "SHORT",
          reconstructionKey: "car-short-key",
          fills: [{ id: "exit-short", allocationRole: "EXIT" }],
        },
      ],
    });

    expect(from).toHaveBeenCalledWith("trade_review_groups");
    expect(from).toHaveBeenCalledWith("trade_review_group_members");
    expect(from).toHaveBeenCalledWith("trades");
    expect(from.mock.calls.filter(([table]) => table === "trade_fills")).toHaveLength(2);
    expect(getTradeReviewGroupCharts).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: "CAR",
        openedAt: "2026-06-02T14:30:00.000Z",
        closedAt: "2026-06-12T14:30:00.000Z",
        client: expect.any(Object),
        trades: [
          expect.objectContaining({ direction: "LONG", fills: expect.any(Array) }),
          expect.objectContaining({ direction: "SHORT", fills: expect.any(Array) }),
        ],
      }),
    );
  });

  it("returns null when every member reconstruction key is stale", async () => {
    const from = groupDetailClient({
      group: {
        id: "group-1",
        custom_name: null,
        symbol: "CAR",
        created_at: "2026-06-16T12:00:00.000Z",
        updated_at: "2026-06-16T12:00:00.000Z",
      },
      memberRows: [{ group_id: "group-1", reconstruction_key: "stale-key" }],
      tradeRows: [],
      fillsByTradeId: {},
    });

    await expect(
      getTradeReviewGroupDetail("user-1", "group-1", { client: { from } }),
    ).resolves.toBeNull();
  });

  it("returns null when fewer than two group members remain closed", async () => {
    const closedTrade = tradeHistoryRow({
      id: "car-closed",
      reconstructionKey: "car-closed-key",
      symbol: "CAR",
      direction: "LONG",
      openedAt: "2026-06-02T14:30:00.000Z",
      closedAt: "2026-06-03T14:30:00.000Z",
      realizedPnl: -20,
      totalFees: 2,
    });
    const openTrade = {
      ...tradeHistoryRow({
        id: "car-open",
        reconstructionKey: "car-open-key",
        symbol: "CAR",
        direction: "SHORT",
        openedAt: "2026-06-10T14:30:00.000Z",
        closedAt: "2026-06-12T14:30:00.000Z",
        realizedPnl: 0,
        totalFees: 0,
      }),
      status: "OPEN",
      closed_at: null,
    };
    const from = groupDetailClient({
      group: {
        id: "group-1",
        custom_name: null,
        symbol: "CAR",
        created_at: "2026-06-16T12:00:00.000Z",
        updated_at: "2026-06-16T12:00:00.000Z",
      },
      memberRows: [
        { group_id: "group-1", reconstruction_key: "car-closed-key" },
        { group_id: "group-1", reconstruction_key: "car-open-key" },
      ],
      tradeRows: [closedTrade, openTrade],
      fillsByTradeId: {
        "car-closed": [
          allocatedFill("entry-closed", "ENTRY", "BUY", "2026-06-02T14:30:00.000Z"),
        ],
      },
    });

    await expect(
      getTradeReviewGroupDetail("user-1", "group-1", { client: { from } }),
    ).resolves.toBeNull();
  });
});

function tradeHistoryRow(input: {
  id: string;
  reconstructionKey: string;
  symbol: string;
  direction: string;
  openedAt: string;
  closedAt: string;
  realizedPnl: number;
  totalFees: number;
}) {
  return {
    id: input.id,
    reconstruction_key: input.reconstructionKey,
    symbol: input.symbol,
    direction: input.direction,
    status: "CLOSED",
    opened_at: input.openedAt,
    closed_at: input.closedAt,
    entry_quantity: 10,
    max_abs_quantity: 10,
    avg_entry_price: 10,
    avg_exit_price: 11,
    realized_pnl: input.realizedPnl,
    total_fees: input.totalFees,
  };
}

function historyClient(input: {
  trades: Record<string, unknown>[];
  groups: Record<string, unknown>[];
  members: Record<string, unknown>[];
}) {
  return vi.fn((table: string) => {
    const data =
      table === "trades"
        ? input.trades
        : table === "trade_review_groups"
          ? input.groups
          : input.members;
    const result = { data, error: null };
    const order = vi.fn().mockResolvedValue(result);

    if (table === "trades") {
      const lt = vi.fn(() => ({ order }));
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ lt })) })) };
    }

    return { select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) };
  });
}

function allocatedFill(
  id: string,
  allocationRole: "ENTRY" | "EXIT",
  side: "BUY" | "SELL",
  executedAt: string,
) {
  return {
    allocated_quantity: 10,
    allocation_role: allocationRole,
    allocation_price: 10,
    fills: {
      id,
      source_fill_id: id,
      side,
      quantity: 10,
      price: 10,
      executed_at: executedAt,
      commission: 0,
      sec_fee: 1,
      taf_fee: 0,
      nscc_fee: 0,
      nasdaq_fee: 0,
      ecn_remove_fee: 0,
      ecn_add_rebate: 0,
      raw_payload: {},
    },
  };
}

function groupDetailClient(input: {
  group: Record<string, unknown>;
  memberRows: Record<string, unknown>[];
  tradeRows: Record<string, unknown>[];
  fillsByTradeId: Record<string, Record<string, unknown>[]>;
}) {
  return vi.fn((table: string) => {
    if (table === "trade_review_groups") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: input.group, error: null }),
            })),
          })),
        })),
      };
    }

    if (table === "trade_review_group_members") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: input.memberRows, error: null }),
            })),
          })),
        })),
      };
    }

    if (table === "trades") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            in: vi.fn(() => ({
              order: vi.fn().mockResolvedValue({ data: input.tradeRows, error: null }),
            })),
          })),
        })),
      };
    }

    if (table === "trade_fills") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn((_column: string, tradeId: string) => ({
              order: vi.fn().mockResolvedValue({
                data: input.fillsByTradeId[tradeId] ?? [],
                error: null,
              }),
            })),
          })),
        })),
      };
    }

    throw new Error(`Unexpected table ${table}`);
  });
}

function dashboardTradeRow(input: {
  id: string;
  closed_at: string | null;
  realized_pnl: number | null;
}) {
  return {
    id: input.id,
    symbol: "QRSP",
    direction: "LONG",
    status: "CLOSED",
    opened_at: "2026-03-01T14:30:00.000Z",
    closed_at: input.closed_at,
    entry_quantity: 10,
    max_abs_quantity: 10,
    avg_entry_price: 10,
    avg_exit_price: 11,
    realized_pnl: input.realized_pnl,
    total_fees: 1,
  };
}

describe("getTradeDetail", () => {
  it("loads editable stop groups for open trades", async () => {
    const tradeSecondEq = vi.fn(() => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "trade-1",
          account_id: "account-1",
          symbol: "DOCN",
          direction: "LONG",
          status: "OPEN",
          opened_at: "2026-05-01T14:30:00.000Z",
          closed_at: null,
          entry_quantity: 10,
          max_abs_quantity: 10,
          avg_entry_price: 102,
          avg_exit_price: null,
          realized_pnl: null,
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

    const stopGroupsOrder = vi.fn().mockResolvedValue({
      data: [
        {
          id: "group-1",
          trade_id: "trade-1",
          account_id: "account-1",
          symbol: "DOCN",
          direction: "LONG",
          entry_date: "2026-05-01",
          quantity: 4,
          avg_entry_price: 102,
          stop_loss_price: 98.25,
        },
      ],
      error: null,
    });
    const stopGroupsTradeIn = vi.fn(() => ({ order: stopGroupsOrder }));
    const stopGroupsUserEq = vi.fn(() => ({ in: stopGroupsTradeIn }));
    const stopGroupsSelect = vi.fn(() => ({ eq: stopGroupsUserEq }));

    const from = vi.fn((table: string) => {
      if (table === "trades") {
        return { select: tradeSelect };
      }
      if (table === "trade_fills") {
        return { select: tradeFillsSelect };
      }
      if (table === "trade_stop_groups") {
        return { select: stopGroupsSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(
      getTradeDetail("user-1", "trade-1", {
        client: { from },
        marketDataProvider: null,
      }),
    ).resolves.toMatchObject({
      id: "trade-1",
      stopGroups: [
        {
          id: "group-1",
          tradeId: "trade-1",
          entryDate: "2026-05-01",
          quantity: 4,
          stopLossPrice: 98.25,
          stopUnrealizedPnl: -15,
        },
      ],
    });

    expect(stopGroupsSelect).toHaveBeenCalledWith("*");
    expect(stopGroupsUserEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(stopGroupsTradeIn).toHaveBeenCalledWith("trade_id", ["trade-1"]);
  });

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
