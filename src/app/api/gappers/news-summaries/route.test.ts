import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  batchSummarizeGapperNews: vi.fn(),
  collectGapperNewsSources: vi.fn(),
  createGrokNewsSearchProvider: vi.fn(),
  createMarketauxNewsSearchProvider: vi.fn(),
  createOpenAiNewsSummaryProvider: vi.fn(),
  createOpenAiWebNewsSearchProvider: vi.fn(),
  createXNewsSearchProvider: vi.fn(),
  getCurrentUser: vi.fn(),
  getNewsSummaryGrokConfig: vi.fn(),
  getNewsSummaryLlmConfig: vi.fn(),
  getNewsSummaryMarketauxConfig: vi.fn(),
  getNewsSummaryWebSearchConfig: vi.fn(),
  getNewsSummaryXConfig: vi.fn(),
  getTickerNews: vi.fn(),
  requireUser: vi.fn(),
  resolveNewsSummaryModel: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: mocks.getCurrentUser,
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/env", () => ({
  getMassiveConfig: () => ({
    apiKey: "massive-key",
    baseUrl: "https://api.massive.com",
  }),
  getNewsSummaryGrokConfig: mocks.getNewsSummaryGrokConfig,
  getNewsSummaryLlmConfig: mocks.getNewsSummaryLlmConfig,
  getNewsSummaryMarketauxConfig: mocks.getNewsSummaryMarketauxConfig,
  getNewsSummaryWebSearchConfig: mocks.getNewsSummaryWebSearchConfig,
  getNewsSummaryXConfig: mocks.getNewsSummaryXConfig,
}));

vi.mock("@/lib/market-data/gapper-news-sources", () => ({
  collectGapperNewsSources: mocks.collectGapperNewsSources,
  createGrokNewsSearchProvider: mocks.createGrokNewsSearchProvider,
  createMarketauxNewsSearchProvider: mocks.createMarketauxNewsSearchProvider,
  createOpenAiWebNewsSearchProvider: mocks.createOpenAiWebNewsSearchProvider,
  createXNewsSearchProvider: mocks.createXNewsSearchProvider,
}));

vi.mock("@/lib/market-data/massive", () => ({
  createMassiveMarketDataProvider: () => ({
    getTickerNews: mocks.getTickerNews,
  }),
}));

vi.mock("@/lib/market-data/gapper-news-summary", () => ({
  batchSummarizeGapperNews: mocks.batchSummarizeGapperNews,
  createOpenAiNewsSummaryProvider: mocks.createOpenAiNewsSummaryProvider,
  resolveNewsSummaryModel: mocks.resolveNewsSummaryModel,
}));

describe("POST /api/gappers/news-summaries", () => {
  beforeEach(() => {
    mocks.batchSummarizeGapperNews.mockReset();
    mocks.collectGapperNewsSources.mockReset();
    mocks.createGrokNewsSearchProvider.mockReset();
    mocks.createMarketauxNewsSearchProvider.mockReset();
    mocks.createOpenAiNewsSummaryProvider.mockReset();
    mocks.createOpenAiWebNewsSearchProvider.mockReset();
    mocks.createXNewsSearchProvider.mockReset();
    mocks.getCurrentUser.mockReset();
    mocks.getTickerNews.mockReset();
    mocks.requireUser.mockReset();
    mocks.resolveNewsSummaryModel.mockReset();
    mocks.createOpenAiNewsSummaryProvider.mockReturnValue({
      extract: vi.fn(),
    });
    mocks.getNewsSummaryLlmConfig.mockReturnValue({
      apiKey: "openai-key",
      model: "gpt-4o-mini",
      provider: "openai",
    });
    mocks.getNewsSummaryWebSearchConfig.mockReturnValue({
      enabled: false,
      provider: "openai",
    });
    mocks.getNewsSummaryMarketauxConfig.mockReturnValue({ enabled: false });
    mocks.getNewsSummaryGrokConfig.mockReturnValue({ enabled: false });
    mocks.getNewsSummaryXConfig.mockReturnValue({ enabled: false });
    mocks.getCurrentUser.mockResolvedValue({
      email: "owner@example.com",
      id: "user-1",
    });
    mocks.requireUser.mockResolvedValue({
      email: "owner@example.com",
      id: "user-1",
    });
    mocks.resolveNewsSummaryModel.mockReturnValue({
      model: "gpt-4o-mini",
      provider: "openai",
    });
  });

  it("rejects empty selections", async () => {
    const response = await POST(
      new Request("http://localhost/api/gappers/news-summaries", {
        body: JSON.stringify({
          model: "gpt-4o-mini",
          provider: "openai",
          tickers: [],
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Select at least one ticker.",
    });
    expect(mocks.getTickerNews).not.toHaveBeenCalled();
  });

  it("reports a missing OpenAI key when summaries are not configured", async () => {
    mocks.getNewsSummaryLlmConfig.mockReturnValue(null);

    const response = await POST(
      new Request("http://localhost/api/gappers/news-summaries", {
        body: JSON.stringify({
          model: "gpt-4o-mini",
          provider: "openai",
          tickers: [
            {
              previousCloseAt: "2026-06-03T20:00:00.000Z",
              symbol: "acme",
            },
          ],
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "OpenAI API key is not configured for news summaries.",
    });
    expect(mocks.getTickerNews).not.toHaveBeenCalled();
  });

  it("returns JSON when the user is not authenticated", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));

    const response = await POST(
      new Request("http://localhost/api/gappers/news-summaries", {
        body: JSON.stringify({
          model: "gpt-4o-mini",
          provider: "openai",
          tickers: [
            {
              previousCloseAt: "2026-06-03T20:00:00.000Z",
              symbol: "acme",
            },
          ],
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: "Sign in to analyse gappers.",
    });
    expect(mocks.getTickerNews).not.toHaveBeenCalled();
  });

  it("collects source cascades and returns structured batch summary results", async () => {
    const article = {
      articleUrl: "https://example.com/acme",
      description: "Acme reported earnings.",
      id: "article-1",
      publishedUtc: "2026-06-04T11:00:00.000Z",
      tickers: ["ACME"],
      title: "Acme earnings",
    };
    const source = {
      id: "massive:article-1",
      layer: "massive",
      publishedUtc: "2026-06-04T11:00:00.000Z",
      publisher: null,
      snippet: "Acme reported earnings.",
      title: "Acme earnings",
      url: "https://example.com/acme",
    };
    mocks.getTickerNews.mockResolvedValue([article]);
    mocks.collectGapperNewsSources.mockResolvedValue({
      layer: "massive",
      sources: [source],
    });
    mocks.batchSummarizeGapperNews.mockResolvedValue([
      {
        catalysts: [],
        confidence: "high",
        earnings: {
          adjustedEps: { actual: null, estimate: null, priorYear: null },
          revenue: { actual: null, estimate: null, priorYear: null },
        },
        fullYearGuidance: {
          eps: { priorYear: null, value: null },
          revenue: { priorYear: null, value: null },
        },
        headline: "ACME is gapping up on earnings.",
        nextQuarterGuidance: {
          eps: { priorYear: null, value: null },
          revenue: { priorYear: null, value: null },
        },
        notableNews: [],
        sourceLayer: "massive",
        sources: [source],
        status: "success",
        symbol: "ACME",
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/gappers/news-summaries", {
        body: JSON.stringify({
          model: "gpt-4o-mini",
          provider: "openai",
          tickers: [
            {
              previousCloseAt: "2026-06-03T20:00:00.000Z",
              symbol: "acme",
            },
          ],
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          catalysts: [],
          confidence: "high",
          earnings: {
            adjustedEps: { actual: null, estimate: null, priorYear: null },
            revenue: { actual: null, estimate: null, priorYear: null },
          },
          fullYearGuidance: {
            eps: { priorYear: null, value: null },
            revenue: { priorYear: null, value: null },
          },
          headline: "ACME is gapping up on earnings.",
          nextQuarterGuidance: {
            eps: { priorYear: null, value: null },
            revenue: { priorYear: null, value: null },
          },
          notableNews: [],
          sourceLayer: "massive",
          sources: [source],
          status: "success",
          symbol: "ACME",
        },
      ],
    });
    expect(mocks.resolveNewsSummaryModel).toHaveBeenCalledWith({
      requestedModel: "gpt-4o-mini",
      requestedProvider: "openai",
    });
    expect(mocks.getTickerNews).toHaveBeenCalledWith({
      publishedAfter: "2026-06-03T20:00:00.000Z",
      ticker: "ACME",
    });
    expect(mocks.collectGapperNewsSources).toHaveBeenCalledWith({
      grokProvider: null,
      massiveNews: [article],
      marketauxProvider: null,
      previousCloseAt: "2026-06-03T20:00:00.000Z",
      symbol: "ACME",
      webProvider: null,
    });
    expect(mocks.batchSummarizeGapperNews).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        requests: [
          {
            previousCloseAt: "2026-06-03T20:00:00.000Z",
            sourceLayer: "massive",
            sources: [source],
            symbol: "ACME",
          },
        ],
      }),
    );
  });

  it("wires configured Marketaux, OpenAI web, and Grok fallback providers in cascade order", async () => {
    const marketauxProvider = { search: vi.fn() };
    const webProvider = { search: vi.fn() };
    const grokProvider = { search: vi.fn() };
    mocks.getNewsSummaryMarketauxConfig.mockReturnValue({
      apiKey: "marketaux-key",
      baseUrl: "https://api.marketaux.com/v1",
      enabled: true,
    });
    mocks.getNewsSummaryWebSearchConfig.mockReturnValue({
      apiKey: "openai-key",
      enabled: true,
      provider: "openai",
    });
    mocks.getNewsSummaryGrokConfig.mockReturnValue({
      apiKey: "xai-key",
      baseUrl: "https://api.x.ai/v1",
      enabled: true,
      model: "grok-4.3",
    });
    mocks.createMarketauxNewsSearchProvider.mockReturnValue(marketauxProvider);
    mocks.createOpenAiWebNewsSearchProvider.mockReturnValue(webProvider);
    mocks.createGrokNewsSearchProvider.mockReturnValue(grokProvider);
    mocks.getTickerNews.mockResolvedValue([]);
    mocks.collectGapperNewsSources.mockResolvedValue({
      layer: "none",
      sources: [],
    });
    mocks.batchSummarizeGapperNews.mockResolvedValue([
      {
        message:
          "No Massive, Marketaux, OpenAI web, or Grok context found after previous close.",
        sourceLayer: "none",
        status: "no_news",
        symbol: "ACME",
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/gappers/news-summaries", {
        body: JSON.stringify({
          model: "gpt-4o-mini",
          provider: "openai",
          tickers: [
            {
              previousCloseAt: "2026-06-03T20:00:00.000Z",
              symbol: "acme",
            },
          ],
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createMarketauxNewsSearchProvider).toHaveBeenCalledWith({
      apiKey: "marketaux-key",
      baseUrl: "https://api.marketaux.com/v1",
    });
    expect(mocks.createOpenAiWebNewsSearchProvider).toHaveBeenCalledWith({
      apiKey: "openai-key",
    });
    expect(mocks.createGrokNewsSearchProvider).toHaveBeenCalledWith({
      apiKey: "xai-key",
      baseUrl: "https://api.x.ai/v1",
      model: "grok-4.3",
    });
    expect(mocks.collectGapperNewsSources).toHaveBeenCalledWith({
      grokProvider,
      massiveNews: [],
      marketauxProvider,
      previousCloseAt: "2026-06-03T20:00:00.000Z",
      symbol: "ACME",
      webProvider,
    });
  });

  it("returns JSON when fetching ticker news fails", async () => {
    mocks.getTickerNews.mockRejectedValue(new TypeError("fetch failed"));

    const response = await POST(
      new Request("http://localhost/api/gappers/news-summaries", {
        body: JSON.stringify({
          model: "gpt-4o-mini",
          provider: "openai",
          tickers: [
            {
              previousCloseAt: "2026-06-03T20:00:00.000Z",
              symbol: "acme",
            },
          ],
        }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      error: "Unable to analyse gappers right now. fetch failed",
    });
    expect(mocks.batchSummarizeGapperNews).not.toHaveBeenCalled();
  });
});
