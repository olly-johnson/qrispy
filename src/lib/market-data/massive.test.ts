import { describe, expect, it, vi } from "vitest";

import { MassiveMarketDataProvider } from "./massive";

describe("MassiveMarketDataProvider", () => {
  it("fetches unadjusted aggregate bars and normalizes them", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            t: Date.parse("2026-01-02T14:30:00.000Z"),
            o: 10,
            h: 12,
            l: 9,
            c: 11,
            v: 12345,
          },
        ],
      }),
    });
    const provider = new MassiveMarketDataProvider({
      apiKey: "massive-key",
      fetcher,
    });

    await expect(
      provider.getAggregateBars({
        symbol: "zsl",
        timeframe: "5m",
        from: "2026-01-02",
        to: "2026-01-03",
        adjusted: false,
      }),
    ).resolves.toEqual([
      {
        provider: "massive",
        symbol: "ZSL",
        timeframe: "5m",
        barStartAt: "2026-01-02T14:30:00.000Z",
        open: 10,
        high: 12,
        low: 9,
        close: 11,
        volume: 12345,
        adjusted: false,
        rawPayload: expect.objectContaining({ c: 11 }),
      },
    ]);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe("/v2/aggs/ticker/ZSL/range/5/minute/2026-01-02/2026-01-03");
    expect(url.searchParams.get("adjusted")).toBe("false");
    expect(url.searchParams.get("sort")).toBe("asc");
    expect(url.searchParams.get("limit")).toBe("50000");
    expect(url.searchParams.get("apiKey")).toBe("massive-key");
  });

  it("fetches active stock reference tickers with pagination", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              active: true,
              locale: "us",
              market: "stocks",
              name: "Acme Corp",
              ticker: "ACME",
              type: "CS",
            },
          ],
          next_url: "https://api.massive.com/v3/reference/tickers?cursor=next",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              active: true,
              locale: "us",
              market: "stocks",
              name: "Index ETF",
              ticker: "IETF",
              type: "ETF",
            },
          ],
        }),
      });
    const provider = new MassiveMarketDataProvider({
      apiKey: "massive-key",
      fetcher,
    });

    await expect(provider.getActiveStockTickers()).resolves.toEqual([
      expect.objectContaining({ ticker: "ACME", type: "CS" }),
      expect.objectContaining({ ticker: "IETF", type: "ETF" }),
    ]);

    const firstUrl = new URL(fetcher.mock.calls[0][0]);
    expect(firstUrl.pathname).toBe("/v3/reference/tickers");
    expect(firstUrl.searchParams.get("market")).toBe("stocks");
    expect(firstUrl.searchParams.get("active")).toBe("true");
    expect(firstUrl.searchParams.get("limit")).toBe("1000");
    expect(firstUrl.searchParams.get("sort")).toBe("ticker");
    expect(firstUrl.searchParams.get("apiKey")).toBe("massive-key");
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });

    const secondUrl = new URL(fetcher.mock.calls[1][0]);
    expect(secondUrl.searchParams.get("apiKey")).toBe("massive-key");
  });

  it("caches active stock reference tickers for repeated calls", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            active: true,
            locale: "us",
            market: "stocks",
            name: "Cached Corp",
            ticker: "CACH",
            type: "CS",
          },
        ],
      }),
    });
    const provider = new MassiveMarketDataProvider({
      apiKey: "cache-key",
      baseUrl: "https://cache.massive.test",
      fetcher,
    });

    await expect(provider.getActiveStockTickers()).resolves.toEqual([
      expect.objectContaining({ ticker: "CACH" }),
    ]);
    await expect(provider.getActiveStockTickers()).resolves.toEqual([
      expect.objectContaining({ ticker: "CACH" }),
    ]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fetches the full US stock market snapshot without OTC tickers", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        tickers: [
          {
            ticker: "ACME",
            todaysChangePerc: 8.2,
            updated: 1_780_000_000_000,
          },
        ],
      }),
    });
    const provider = new MassiveMarketDataProvider({
      apiKey: "massive-key",
      fetcher,
    });

    await expect(provider.getFullMarketSnapshot()).resolves.toEqual([
      expect.objectContaining({ ticker: "ACME", todaysChangePerc: 8.2 }),
    ]);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe("/v2/snapshot/locale/us/markets/stocks/tickers");
    expect(url.searchParams.get("include_otc")).toBe("false");
    expect(url.searchParams.get("apiKey")).toBe("massive-key");
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });
  });

  it("fetches ticker news published after the previous close", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            article_url: "https://example.com/acme",
            description: "Acme reported earnings.",
            id: "article-1",
            published_utc: "2026-06-04T11:00:00.000Z",
            tickers: ["ACME"],
            title: "Acme jumps on earnings",
          },
        ],
      }),
    });
    const provider = new MassiveMarketDataProvider({
      apiKey: "massive-key",
      fetcher,
    });

    await expect(
      provider.getTickerNews({
        publishedAfter: "2026-06-03T20:00:00.000Z",
        ticker: "acme",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        articleUrl: "https://example.com/acme",
        id: "article-1",
        publishedUtc: "2026-06-04T11:00:00.000Z",
        title: "Acme jumps on earnings",
      }),
    ]);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe("/v2/reference/news");
    expect(url.searchParams.get("ticker")).toBe("ACME");
    expect(url.searchParams.get("published_utc.gt")).toBe(
      "2026-06-03T20:00:00.000Z",
    );
    expect(url.searchParams.get("sort")).toBe("published_utc");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("apiKey")).toBe("massive-key");
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });
  });
});
