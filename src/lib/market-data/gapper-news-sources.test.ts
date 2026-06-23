import { describe, expect, it, vi } from "vitest";

import {
  collectGapperNewsSources,
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

  it("uses Massive results and does not call web or X", async () => {
    const web: NewsSourceProvider = { search: vi.fn() };
    const x: NewsSourceProvider = { search: vi.fn() };

    await expect(
      collectGapperNewsSources({
        massiveNews: [massiveArticle],
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        xProvider: x,
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

    expect(web.search).not.toHaveBeenCalled();
    expect(x.search).not.toHaveBeenCalled();
  });

  it("uses web when Massive is empty and does not call X", async () => {
    const webSource = source("web");
    const web: NewsSourceProvider = { search: vi.fn(async () => [webSource]) };
    const x: NewsSourceProvider = { search: vi.fn() };

    await expect(
      collectGapperNewsSources({
        massiveNews: [],
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        xProvider: x,
      }),
    ).resolves.toEqual({ layer: "web", sources: [webSource] });

    expect(web.search).toHaveBeenCalledWith({
      previousCloseAt: "2026-06-15T20:00:00.000Z",
      symbol: "ACME",
    });
    expect(x.search).not.toHaveBeenCalled();
  });

  it("uses X only when Massive and web are empty", async () => {
    const xSource = source("x");
    const web: NewsSourceProvider = { search: vi.fn(async () => []) };
    const x: NewsSourceProvider = { search: vi.fn(async () => [xSource]) };

    await expect(
      collectGapperNewsSources({
        massiveNews: [],
        previousCloseAt: "2026-06-15T20:00:00.000Z",
        symbol: "ACME",
        webProvider: web,
        xProvider: x,
      }),
    ).resolves.toEqual({ layer: "x", sources: [xSource] });
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
});

describe("createOpenAiWebNewsSearchProvider", () => {
  it("requests web search and normalizes cited sources", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output: [
            {
              content: [
                {
                  annotations: [
                    {
                      title: "AI peers rally",
                      url: "https://example.com/ai",
                    },
                  ],
                  text: "ACME is moving with AI peers.",
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
        id: "web:0:https://example.com/ai",
        layer: "web",
        publishedUtc: null,
        publisher: "example.com",
        snippet: "ACME is moving with AI peers.",
        title: "AI peers rally",
        url: "https://example.com/ai",
      },
    ]);

    const [, options] = fetcher.mock.calls[0];
    expect(options.headers.authorization).toBe("Bearer openai-key");
    expect(JSON.parse(options.body)).toMatchObject({
      model: "gpt-4o-mini",
      tools: [{ type: "web_search" }],
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

function source(layer: "web" | "x") {
  return {
    id: `${layer}:1`,
    layer,
    publishedUtc: layer === "x" ? "2026-06-16T12:30:00.000Z" : null,
    publisher: layer === "x" ? "@marketnews" : "Example",
    snippet:
      layer === "x"
        ? "$ACME moving with NVDA earnings."
        : "Acme is up on AI server demand.",
    title: layer === "x" ? "@marketnews" : "Why Acme is up",
    url:
      layer === "x"
        ? "https://x.com/marketnews/status/1"
        : "https://example.com/acme",
  };
}
