import { describe, expect, it, vi } from "vitest";

import { getCachedOrFetchBars } from "./cache";
import type { MarketDataProvider, OhlcvBar } from "./types";

const cachedBar: OhlcvBar = {
  provider: "massive",
  symbol: "ZSL",
  timeframe: "1d",
  barStartAt: "2026-01-05T00:00:00.000Z",
  open: 10,
  high: 12,
  low: 9,
  close: 11,
  volume: 1000,
  adjusted: false,
  rawPayload: {},
};

describe("getCachedOrFetchBars", () => {
  it("returns cached bars without calling the provider", async () => {
    const monthEndBar = { ...cachedBar, barStartAt: "2026-01-30T00:00:00.000Z" };
    const provider: MarketDataProvider = {
      name: "massive",
      getAggregateBars: vi.fn(),
    };
    const client = fakeMarketDataClient([cachedBar, monthEndBar]);

    await expect(
      getCachedOrFetchBars({
        client,
        provider,
        request: {
          symbol: "ZSL",
          timeframe: "1d",
          from: "2026-01-01",
          to: "2026-01-31",
          adjusted: false,
        },
      }),
    ).resolves.toEqual([cachedBar, monthEndBar]);

    expect(provider.getAggregateBars).not.toHaveBeenCalled();
  });

  it("fetches when cached bars do not cover the requested window", async () => {
    const partialCachedBar = { ...cachedBar, barStartAt: "2026-01-15T00:00:00.000Z" };
    const fetchedBar = { ...cachedBar, barStartAt: "2025-11-03T00:00:00.000Z" };
    const provider: MarketDataProvider = {
      name: "massive",
      getAggregateBars: vi.fn().mockResolvedValue([fetchedBar]),
    };
    const client = fakeMarketDataClient([partialCachedBar]);

    await expect(
      getCachedOrFetchBars({
        client,
        provider,
        request: {
          symbol: "ZSL",
          timeframe: "1d",
          from: "2025-11-01",
          to: "2026-01-31",
          adjusted: false,
        },
      }),
    ).resolves.toEqual([fetchedBar]);

    expect(provider.getAggregateBars).toHaveBeenCalledOnce();
    expect(client.upsertedBars).toHaveLength(1);
  });

  it("fetches, upserts, and records a successful request when cache is empty", async () => {
    const fetchedBar = { ...cachedBar, barStartAt: "2026-01-03T00:00:00.000Z" };
    const provider: MarketDataProvider = {
      name: "massive",
      getAggregateBars: vi.fn().mockResolvedValue([fetchedBar]),
    };
    const client = fakeMarketDataClient([]);

    await expect(
      getCachedOrFetchBars({
        client,
        provider,
        request: {
          symbol: "ZSL",
          timeframe: "1d",
          from: "2026-01-01",
          to: "2026-01-31",
          adjusted: false,
        },
      }),
    ).resolves.toEqual([fetchedBar]);

    expect(client.upsertedBars).toHaveLength(1);
    expect(client.insertedRequests[0]).toMatchObject({
      provider: "massive",
      symbol: "ZSL",
      timeframe: "1d",
      status: "succeeded",
    });
  });
});

function fakeMarketDataClient(cachedBars: OhlcvBar[]) {
  const client = {
    upsertedBars: [] as unknown[],
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
                        order: vi.fn().mockResolvedValue({
                          data: cachedBars.map((bar) => ({
                            provider: bar.provider,
                            symbol: bar.symbol,
                            timeframe: bar.timeframe,
                            bar_start_at: bar.barStartAt,
                            open: bar.open,
                            high: bar.high,
                            low: bar.low,
                            close: bar.close,
                            volume: bar.volume,
                            adjusted: bar.adjusted,
                            raw_payload: bar.rawPayload,
                          })),
                          error: null,
                        }),
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
