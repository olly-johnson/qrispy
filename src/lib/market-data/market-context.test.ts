import { describe, expect, it, vi } from "vitest";

import {
  loadMarketContextBrief,
  marketContextWindow,
  refreshMarketContextBrief,
  type MarketContextProvider,
} from "./market-context";

const brief = {
  events: [],
  headline: "Inflation data is the main market focus.",
  notableNews: [],
  sources: [],
};

describe("marketContextWindow", () => {
  it("starts automatic generation at 7:00 AM Eastern on a trading day", () => {
    expect(marketContextWindow(new Date("2026-06-23T10:59:59.000Z"))).toMatchObject({
      canRefresh: true,
      shouldGenerateToday: false,
      tradingDate: "2026-06-23",
    });
    expect(marketContextWindow(new Date("2026-06-23T11:00:00.000Z"))).toMatchObject({
      canRefresh: true,
      shouldGenerateToday: true,
      tradingDate: "2026-06-23",
    });
  });

  it("falls back to the previous trading day and disables refresh on weekends", () => {
    expect(marketContextWindow(new Date("2026-06-20T14:00:00.000Z"))).toMatchObject({
      canRefresh: false,
      shouldGenerateToday: false,
      tradingDate: "2026-06-18",
    });
  });
});

describe("loadMarketContextBrief", () => {
  it("uses the prior stored brief when generation fails", async () => {
    const provider: MarketContextProvider = {
      generate: vi.fn().mockRejectedValue(new Error("OpenAI unavailable")),
    };
    const client = fakeClient([storedBrief("2026-06-20")]);

    await expect(
      loadMarketContextBrief({
        client,
        now: new Date("2026-06-23T11:00:00.000Z"),
        provider,
      }),
    ).resolves.toMatchObject({
      brief: { marketDate: "2026-06-20" },
      isStale: true,
    });
    expect(client.upserts).toEqual([]);
  });

  it("generates and stores an absent brief after 7 AM Eastern", async () => {
    const provider: MarketContextProvider = { generate: vi.fn().mockResolvedValue(brief) };
    const client = fakeClient([]);

    await expect(
      loadMarketContextBrief({
        client,
        now: new Date("2026-06-23T11:00:00.000Z"),
        provider,
      }),
    ).resolves.toMatchObject({ brief: { marketDate: "2026-06-23" }, isStale: false });
    expect(client.upserts).toHaveLength(1);
  });
});

describe("refreshMarketContextBrief", () => {
  it("does not generate on a non-trading day", async () => {
    const provider: MarketContextProvider = { generate: vi.fn() };

    await expect(
      refreshMarketContextBrief({
        client: fakeClient([]),
        now: new Date("2026-06-20T14:00:00.000Z"),
        provider,
      }),
    ).resolves.toMatchObject({ canRefresh: false, brief: null });
    expect(provider.generate).not.toHaveBeenCalled();
  });
});

function storedBrief(market_date: string) {
  return {
    events: [],
    generated_at: "2026-06-20T11:00:00.000Z",
    headline: brief.headline,
    market_date,
    notable_news: [],
    sources: [],
  };
}

function fakeClient(rows: Record<string, unknown>[]) {
  const upserts: Record<string, unknown>[] = [];
  const query = {
    lte: () => query,
    order: () => query,
    limit: async () => ({ data: rows, error: null }),
  };
  return {
    from: () => ({
      select: () => query,
      upsert: async (row: Record<string, unknown>) => {
        upserts.push(row);
        return { error: null };
      },
    }),
    upserts,
  };
}
