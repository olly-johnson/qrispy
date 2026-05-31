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
});
