import { describe, expect, it, vi } from "vitest";

import {
  collectGapperNewsSources,
  createGrokNewsSearchProvider,
  createMarketauxNewsSearchProvider,
  createOpenAiWebNewsSearchProvider,
  createXNewsSearchProvider,
  type NewsSourceProvider,
} from "./gapper-news-sources";

describe("collectGapperNewsSources", () => {
  const massiveArticle = {
    articleUrl: "https://massive.test/acme",
    description: "Acme won a contract.",
    id: "m1",
    publishedUtc: "2026-06-16T12:00:00.000Z",
    tickers: ["ACME"],
    title: "Acme contract",
  };

  it("uses Massive results and does not call Marketaux, web, or Grok", async () => {
    const marketaux: NewsSourceProvider = { search: vi.fn() };
    const web: NewsSourceProvider = { search: vi.fn() };
    const grok: NewsSourceProvider = { search: vi.fn() };

    await expect(
      collectGapperNewsSources({
        massiveNews: [massiveArticle],
        marketauxProvider: marketaux,
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        grokProvider: grok,
      }),
    ).resolves.toEqual({
      layer: "massive",
      sources: [
        expect.objectContaining({
          id: "massive:m1",
          layer: "massive",
          title: "Acme contract",
        }),
      ],
    });

    expect(marketaux.search).not.toHaveBeenCalled();
    expect(web.search).not.toHaveBeenCalled();
    expect(grok.search).not.toHaveBeenCalled();
  });

  it("falls through to Marketaux when Massive only returns broad multi-ticker market articles", async () => {
    const broadMassiveArticle = {
      articleUrl: "https://massive.test/semis-etf",
      description:
        "A semiconductor ETF article mentions many chip stocks.",
      id: "broad-1",
      publishedUtc: "2026-06-16T12:00:00.000Z",
      tickers: ["ACME", "NVDA", "AMD", "INTC", "QCOM"],
      title: "This Tech ETF Has More than Doubled in 2026",
    };
    const marketauxSource = source("marketaux");
    const marketaux: NewsSourceProvider = {
      search: vi.fn(async () => [marketauxSource]),
    };
    const web: NewsSourceProvider = { search: vi.fn() };
    const grok: NewsSourceProvider = { search: vi.fn() };

    await expect(
      collectGapperNewsSources({
        massiveNews: [broadMassiveArticle],
        marketauxProvider: marketaux,
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        grokProvider: grok,
      }),
    ).resolves.toEqual({ layer: "marketaux", sources: [marketauxSource] });

    expect(marketaux.search).toHaveBeenCalledWith({
      previousCloseAt: "2026-06-15T20:00:00.000Z",
      symbol: "ACME",
    });
    expect(web.search).not.toHaveBeenCalled();
    expect(grok.search).not.toHaveBeenCalled();
  });

  it("uses Marketaux when Massive is empty and does not call web or Grok", async () => {
    const marketauxSource = source("marketaux");
    const marketaux: NewsSourceProvider = {
      search: vi.fn(async () => [marketauxSource]),
    };
    const web: NewsSourceProvider = { search: vi.fn() };
    const grok: NewsSourceProvider = { search: vi.fn() };

    await expect(
      collectGapperNewsSources({
        massiveNews: [],
        marketauxProvider: marketaux,
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        grokProvider: grok,
      }),
    ).resolves.toEqual({ layer: "marketaux", sources: [marketauxSource] });

    expect(marketaux.search).toHaveBeenCalledWith({
      previousCloseAt: "2026-06-15T20:00:00.000Z",
      symbol: "ACME",
    });
    expect(web.search).not.toHaveBeenCalled();
    expect(grok.search).not.toHaveBeenCalled();
  });

  it("uses web when Massive and Marketaux are empty and does not call Grok", async () => {
    const marketaux: NewsSourceProvider = { search: vi.fn(async () => []) };
    const webSource = source("web");
    const web: NewsSourceProvider = { search: vi.fn(async () => [webSource]) };
    const grok: NewsSourceProvider = { search: vi.fn() };

    await expect(
      collectGapperNewsSources({
        massiveNews: [],
        marketauxProvider: marketaux,
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        grokProvider: grok,
      }),
    ).resolves.toEqual({ layer: "web", sources: [webSource] });

    expect(marketaux.search).toHaveBeenCalledWith({
      previousCloseAt: "2026-06-15T20:00:00.000Z",
      symbol: "ACME",
    });
    expect(web.search).toHaveBeenCalledWith({
      previousCloseAt: "2026-06-15T20:00:00.000Z",
      symbol: "ACME",
    });
    expect(grok.search).not.toHaveBeenCalled();
  });

  it("uses Grok only when Massive, Marketaux, and web are empty", async () => {
    const marketaux: NewsSourceProvider = { search: vi.fn(async () => []) };
    const web: NewsSourceProvider = { search: vi.fn(async () => []) };
    const grokSource = source("grok");
    const grok: NewsSourceProvider = { search: vi.fn(async () => [grokSource]) };

    await expect(
      collectGapperNewsSources({
        massiveNews: [],
        marketauxProvider: marketaux,
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        grokProvider: grok,
      }),
    ).resolves.toEqual({ layer: "grok", sources: [grokSource] });
  });

  it("returns none when every configured layer is empty", async () => {
    await expect(
      collectGapperNewsSources({
        massiveNews: [],
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
      }),
    ).resolves.toEqual({ layer: "none", sources: [] });
  });

  it("returns none when the optional Grok fallback is unavailable", async () => {
    const marketaux: NewsSourceProvider = { search: vi.fn(async () => []) };
    const web: NewsSourceProvider = { search: vi.fn(async () => []) };
    const grok: NewsSourceProvider = {
      search: vi.fn(async () => {
        throw new Error("Grok news search request failed with 403");
      }),
    };

    await expect(
      collectGapperNewsSources({
        massiveNews: [],
        marketauxProvider: marketaux,
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        grokProvider: grok,
      }),
    ).resolves.toEqual({ layer: "none", sources: [] });
  });
});

describe("createMarketauxNewsSearchProvider", () => {
  it("searches ticker news after the previous close and normalizes entity highlights", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              description: "Acme shares rise after announcing a new contract.",
              entities: [
                {
                  highlights: [
                    {
                      highlight: "Acme announced a new AI server contract.",
                      highlighted_in: "main_text",
                      sentiment: 0.7,
                    },
                  ],
                  match_score: 93,
                  symbol: "ACME",
                },
              ],
              published_at: "2026-06-16T12:30:00.000Z",
              source: "example.com",
              title: "Acme jumps on AI server contract",
              url: "https://example.com/acme-contract",
              uuid: "marketaux-1",
            },
            {
              description: "Old Acme item.",
              published_at: "2026-06-15T19:59:59.000Z",
              source: "example.com",
              title: "Old Acme earnings",
              url: "https://example.com/old-acme",
              uuid: "old-1",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = createMarketauxNewsSearchProvider({
      apiKey: "marketaux-key",
      fetcher,
    });

    await expect(
      provider.search({
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
      }),
    ).resolves.toEqual([
      {
        id: "marketaux:marketaux-1",
        layer: "marketaux",
        publishedUtc: "2026-06-16T12:30:00.000Z",
        publisher: "example.com",
        snippet: "Acme announced a new AI server contract.",
        title: "Acme jumps on AI server contract",
        url: "https://example.com/acme-contract",
      },
    ]);

    const [url] = fetcher.mock.calls[0];
    const requestUrl = new URL(url);
    expect(requestUrl.toString()).toContain("https://api.marketaux.com/v1/news/all");
    expect(requestUrl.searchParams.get("api_token")).toBe("marketaux-key");
    expect(requestUrl.searchParams.get("symbols")).toBe("ACME");
    expect(requestUrl.searchParams.get("published_after")).toBe(
      "2026-06-15T20:00:00.000Z",
    );
    expect(requestUrl.searchParams.get("filter_entities")).toBe("true");
  });
});

describe("createOpenAiWebNewsSearchProvider", () => {
  it("keeps only web findings published after the previous close", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  text: JSON.stringify({
                    sources: [
                      {
                        publishedUtc: "2026-06-16T12:30:00.000Z",
                        summary: "Acme is up on AI server demand.",
                        title: "Why Acme is up",
                        url: "https://example.com/acme",
                      },
                      {
                        publishedUtc: "2026-06-15T19:59:59.000Z",
                        summary: "Acme reported last quarter's earnings.",
                        title: "Acme earnings",
                        url: "https://example.com/earnings",
                      },
                      {
                        publishedUtc: "not-a-date",
                        summary: "Undated source.",
                        title: "Undated",
                        url: "https://example.com/undated",
                      },
                    ],
                  }),
                  type: "output_text",
                },
              ],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = createOpenAiWebNewsSearchProvider({
      apiKey: "openai-key",
      fetcher,
    });

    await expect(
      provider.search({
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
      }),
    ).resolves.toEqual([
      {
        id: "web:0:https://example.com/acme",
        layer: "web",
        publishedUtc: "2026-06-16T12:30:00.000Z",
        publisher: "example.com",
        snippet: "Acme is up on AI server demand.",
        title: "Why Acme is up",
        url: "https://example.com/acme",
      },
    ]);

    const [, options] = fetcher.mock.calls[0];
    expect(options.headers.authorization).toBe("Bearer openai-key");
    expect(JSON.parse(options.body)).toMatchObject({
      model: "gpt-4o-mini",
      text: {
        format: {
          name: "gapper_web_news_sources",
          strict: true,
          type: "json_schema",
        },
      },
      tools: [{ type: "web_search" }],
    });
  });

  it("falls through to Grok when every web finding is stale", async () => {
    const web = createOpenAiWebNewsSearchProvider({
      apiKey: "openai-key",
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    annotations: [
                      {
                        title: "Old Acme earnings",
                        url: "https://example.com/earnings",
                      },
                    ],
                    text: JSON.stringify({
                      sources: [
                        {
                          publishedUtc: "2026-06-15T19:59:59.000Z",
                          summary: "Acme reported last quarter's earnings.",
                          title: "Old Acme earnings",
                          url: "https://example.com/earnings",
                        },
                      ],
                    }),
                    type: "output_text",
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    });
    const marketaux: NewsSourceProvider = { search: vi.fn(async () => []) };
    const grokSource = source("grok");
    const grok: NewsSourceProvider = { search: vi.fn(async () => [grokSource]) };

    await expect(
      collectGapperNewsSources({
        massiveNews: [],
        marketauxProvider: marketaux,
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        grokProvider: grok,
      }),
    ).resolves.toEqual({ layer: "grok", sources: [grokSource] });
  });
});

describe("createGrokNewsSearchProvider", () => {
  it("uses xAI Responses with X search after the previous close", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            sources: [
              {
                publishedUtc: "2026-06-16T12:30:00.000Z",
                publisher: "@marketnews",
                summary: "$ACME moving with NVDA earnings.",
                title: "@marketnews",
                url: "https://x.com/marketnews/status/1",
              },
            ],
          }),
        }),
        { status: 200 },
      ),
    );
    const provider = createGrokNewsSearchProvider({
      apiKey: "xai-key",
      fetcher,
      model: "grok-4.3",
    });

    await expect(
      provider.search({
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
      }),
    ).resolves.toEqual([
      {
        id: "grok:0:https://x.com/marketnews/status/1",
        layer: "grok",
        publishedUtc: "2026-06-16T12:30:00.000Z",
        publisher: "@marketnews",
        snippet: "$ACME moving with NVDA earnings.",
        title: "@marketnews",
        url: "https://x.com/marketnews/status/1",
      },
    ]);

    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/responses");
    expect(options.headers.authorization).toBe("Bearer xai-key");
    expect(JSON.parse(options.body)).toMatchObject({
      model: "grok-4.3",
      tools: [
        {
          from_date: "2026-06-15",
          type: "x_search",
        },
      ],
    });
  });
});

describe("createXNewsSearchProvider", () => {
  it("uses the recent search endpoint after the previous close", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              author_id: "42",
              created_at: "2026-06-16T12:30:00.000Z",
              id: "1",
              text: "$ACME moving with NVDA earnings.",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const provider = createXNewsSearchProvider({
      bearerToken: "x-token",
      fetcher,
    });

    await expect(
      provider.search({
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
      }),
    ).resolves.toEqual([
      {
        id: "x:1",
        layer: "x",
        publishedUtc: "2026-06-16T12:30:00.000Z",
        publisher: "X user 42",
        snippet: "$ACME moving with NVDA earnings.",
        title: "X user 42",
        url: "https://x.com/i/web/status/1",
      },
    ]);

    const [url, options] = fetcher.mock.calls[0];
    expect(new URL(url).searchParams.get("start_time")).toBe(
      "2026-06-15T20:00:00.000Z",
    );
    expect(options.headers.authorization).toBe("Bearer x-token");
  });
});

function source(layer: "grok" | "marketaux" | "web" | "x") {
  return {
    id: `${layer}:1`,
    layer,
    publishedUtc:
      layer === "x" || layer === "grok" || layer === "marketaux"
        ? "2026-06-16T12:30:00.000Z"
        : null,
    publisher: layer === "x" || layer === "grok" ? "@marketnews" : "Example",
    snippet:
      layer === "x" || layer === "grok"
        ? "$ACME moving with NVDA earnings."
        : "Acme is up on AI server demand.",
    title: layer === "x" || layer === "grok" ? "@marketnews" : "Why Acme is up",
    url:
      layer === "x" || layer === "grok"
        ? "https://x.com/marketnews/status/1"
        : "https://example.com/acme",
  };
}
