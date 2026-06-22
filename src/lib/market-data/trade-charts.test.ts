import { describe, expect, it, vi } from "vitest";

import { getTradeCharts, getTradeReviewGroupCharts } from "./trade-charts";
import type { MarketDataProvider, OhlcvBar } from "./types";
import type { TradeDetail } from "@/lib/app-data";

describe("getTradeCharts", () => {
  it("builds daily, weekly, entry, and exit chart datasets with overlays and markers", async () => {
    const provider: MarketDataProvider = {
      name: "massive",
      getAggregateBars: vi.fn(async (request) =>
        barsForRequest(request.timeframe, request.symbol),
      ),
    };
    const client = emptyMarketDataClient();

    await expect(
      getTradeCharts({
        trade: tradeDetail(),
        client,
        provider,
        now: new Date("2026-05-31T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      charts: [
        {
          id: "daily",
          timeframe: "1d",
          overlays: expect.arrayContaining([
            expect.objectContaining({ id: "sma10", color: "#d946ef" }),
            expect.objectContaining({ id: "sma20", color: "#facc15" }),
            expect.objectContaining({ id: "sma50", color: "#ef4444" }),
            expect.objectContaining({ id: "sma200", color: "#3b82f6" }),
          ]),
          markers: expect.arrayContaining([
            expect.objectContaining({ side: "BUY", role: "ENTRY", quantity: 10 }),
            expect.objectContaining({ side: "SELL", role: "EXIT", quantity: 10 }),
          ]),
        },
        expect.objectContaining({ id: "weekly", timeframe: "1w" }),
        expect.objectContaining({
          id: "entry-5m",
          timeframe: "5m",
          overlays: expect.arrayContaining([
            expect.objectContaining({ id: "ema10", color: "#d946ef" }),
            expect.objectContaining({ id: "ema20", color: "#facc15" }),
            expect.objectContaining({ id: "ema65", color: "#ffffff" }),
          ]),
        }),
        expect.objectContaining({ id: "entry-1h", timeframe: "1h" }),
        expect.objectContaining({ id: "exit-5m", timeframe: "5m" }),
        expect.objectContaining({ id: "exit-1h", timeframe: "1h" }),
      ],
    });

    expect(provider.getAggregateBars).toHaveBeenCalledTimes(6);
  });

  it("shows 200 daily bars before entry and 100 daily bars after exit", async () => {
    const provider: MarketDataProvider = {
      name: "massive",
      getAggregateBars: vi.fn(async (request) =>
        barsForRequest(request.timeframe, request.symbol),
      ),
    };
    const client = emptyMarketDataClient();

    const result = await getTradeCharts({
      trade: tradeDetail(),
      client,
      provider,
      now: new Date("2026-05-31T12:00:00.000Z"),
    });
    const daily = result.charts.find((chart) => chart.id === "daily");

    expect(daily?.bars).toHaveLength(301);
    expect(daily?.bars[200]?.barStartAt).toBe("2026-01-08T00:00:00.000Z");
    expect(daily?.overlays.every((overlay) => overlay.points.length <= daily.bars.length)).toBe(
      true,
    );
    expect(daily?.overlays.flatMap((overlay) => overlay.points).every((point) =>
      daily.bars.some((bar) => bar.barStartAt.slice(0, 10) === point.time),
    )).toBe(true);
  });

  it("loads wider hourly windows around entry and exit fills", async () => {
    const provider: MarketDataProvider = {
      name: "massive",
      getAggregateBars: vi.fn(async (request) =>
        barsForRequest(request.timeframe, request.symbol),
      ),
    };
    const client = emptyMarketDataClient();

    await getTradeCharts({
      trade: tradeDetail(),
      client,
      provider,
      now: new Date("2026-05-31T12:00:00.000Z"),
    });

    const hourlyRequests = vi
      .mocked(provider.getAggregateBars)
      .mock.calls.map(([request]) => request)
      .filter((request) => request.timeframe === "1h");

    expect(hourlyRequests).toEqual([
      expect.objectContaining({ from: "2025-12-29", to: "2026-01-18" }),
      expect.objectContaining({ from: "2025-12-29", to: "2026-01-18" }),
    ]);
  });
});

describe("getTradeReviewGroupCharts", () => {
  it("builds daily and hourly campaign charts with labelled fills for each trade", async () => {
    const provider: MarketDataProvider = {
      name: "massive",
      getAggregateBars: vi.fn(async (request) =>
        barsForRequest(request.timeframe, request.symbol),
      ),
    };

    const result = await getTradeReviewGroupCharts({
      symbol: "CAR",
      openedAt: "2026-01-08T15:18:00.000Z",
      closedAt: "2026-01-20T19:05:00.000Z",
      trades: [
        { direction: "LONG", fills: tradeDetail().fills },
        {
          direction: "SHORT",
          fills: tradeDetail().fills.map((fill) => ({
            ...fill,
            executedAt: fill.executedAt.replace("08", "20"),
          })),
        },
      ],
      client: emptyMarketDataClient(),
      provider,
    });

    expect(result.charts.map((chart) => chart.id)).toEqual(["daily", "hourly"]);
    expect(result.charts[0]?.markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "T1 E" }),
        expect.objectContaining({ label: "T2 X" }),
      ]),
    );
    expect(vi.mocked(provider.getAggregateBars).mock.calls.map(([request]) => request)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ timeframe: "1d", from: "2024-08-26", to: "2026-05-20" }),
        expect.objectContaining({ timeframe: "1h", from: "2026-01-06", to: "2026-01-22" }),
      ]),
    );
  });
});

function tradeDetail(): TradeDetail {
  return {
    id: "trade-1",
    symbol: "ZSL",
    direction: "LONG",
    status: "CLOSED",
    openedAt: "2026-01-08T15:18:00.000Z",
    closedAt: "2026-01-08T19:05:00.000Z",
    entryQuantity: 10,
    maxAbsQuantity: 10,
    avgEntryPrice: 20,
    avgExitPrice: 21,
    realizedPnl: 8,
    totalFees: 2,
    stopGroups: [],
    fills: [
      {
        id: "fill-1",
        sourceFillId: "exec-1",
        allocationRole: "ENTRY",
        side: "BUY",
        allocatedQuantity: 10,
        fillQuantity: 10,
        price: 20,
        allocationPrice: 20,
        executedAt: "2026-01-08T15:18:00.000Z",
        commission: 0,
        fees: 1,
        rawPayload: {},
      },
      {
        id: "fill-2",
        sourceFillId: "exec-2",
        allocationRole: "EXIT",
        side: "SELL",
        allocatedQuantity: 10,
        fillQuantity: 10,
        price: 21,
        allocationPrice: 21,
        executedAt: "2026-01-08T19:05:00.000Z",
        commission: 0,
        fees: 1,
        rawPayload: {},
      },
    ],
  };
}

function barsForRequest(timeframe: OhlcvBar["timeframe"], symbol: string) {
  const count = timeframe === "1w" ? 260 : timeframe === "1d" ? 380 : 90;
  const base =
    timeframe === "1w"
      ? Date.parse("2021-01-01T00:00:00.000Z")
      : timeframe === "1d"
        ? Date.parse("2025-06-01T00:00:00.000Z")
        : Date.parse("2026-01-08T14:00:00.000Z");
  const step =
    timeframe === "1w"
      ? 7 * 24 * 60 * 60 * 1000
      : timeframe === "1d"
        ? 24 * 60 * 60 * 1000
        : timeframe === "5m"
          ? 5 * 60 * 1000
          : 60 * 60 * 1000;

  return Array.from({ length: count }, (_, index) => {
    const close = 10 + index / 10;
    return {
      provider: "massive",
      symbol,
      timeframe,
      barStartAt: new Date(base + index * step).toISOString(),
      open: close - 0.2,
      high: close + 0.4,
      low: close - 0.5,
      close,
      volume: 1000 + index,
      adjusted: false,
      rawPayload: {},
    };
  });
}

function emptyMarketDataClient() {
  return {
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
          upsert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      return {
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    },
  };
}
