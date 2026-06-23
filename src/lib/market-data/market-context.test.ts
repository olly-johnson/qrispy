import { describe, expect, it, vi } from "vitest";

import {
  createOpenAiMarketContextProvider,
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

describe("createOpenAiMarketContextProvider", () => {
  it("searches market-wide sources before extracting a sourced brief", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          output: [
            {
              content: [
                {
                  annotations: [
                    { title: "CPI release", url: "https://bls.gov/cpi" },
                    { title: "Fed calendar", url: "https://federalreserve.gov/calendar" },
                  ],
                  text: "CPI and the Fed meeting are the key market events.",
                },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        response({
          output_text: JSON.stringify({
            events: [
              {
                category: "inflation",
                kind: "scheduled",
                sourceIds: ["web:0"],
                summary: "CPI data is due before the open.",
                timeEt: "8:30 AM ET",
              },
            ],
            headline: "Inflation data is the market's main focus today.",
            notableNews: [],
          }),
        }),
      );
    const provider = createOpenAiMarketContextProvider({
      apiKey: "openai-key",
      fetcher,
      model: "gpt-4o-mini",
    });

    await expect(provider.generate({ marketDate: "2026-06-23" })).resolves.toEqual({
      events: [
        {
          category: "inflation",
          kind: "scheduled",
          sourceIds: ["web:0"],
          summary: "CPI data is due before the open.",
          timeEt: "8:30 AM ET",
        },
      ],
      headline: "Inflation data is the market's main focus today.",
      notableNews: [],
      sources: [
        {
          id: "web:0",
          publisher: "bls.gov",
          title: "CPI release",
          url: "https://bls.gov/cpi",
        },
      ],
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetcher.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search" }],
    });
    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain("2026-06-23");
    expect(String(fetcher.mock.calls[1]?.[1]?.body)).toContain("web:0");
  });

  it("rejects extracted items that cite unknown sources", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          output: [{ content: [{ annotations: [{ title: "CPI", url: "https://bls.gov/cpi" }] }] }],
        }),
      )
      .mockResolvedValueOnce(
        response({
          output_text: JSON.stringify({
            events: [],
            headline: "Unverified headline",
            notableNews: [
              {
                category: "macro",
                kind: "developing",
                sourceIds: ["web:99"],
                summary: "Unverified item",
                timeEt: null,
              },
            ],
          }),
        }),
      );

    await expect(
      createOpenAiMarketContextProvider({ apiKey: "openai-key", fetcher, model: "gpt-4o-mini" })
        .generate({ marketDate: "2026-06-23" }),
    ).rejects.toThrow("no source-backed market context");
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

function response(payload: unknown) {
  return { json: async () => payload, ok: true, status: 200 };
}
