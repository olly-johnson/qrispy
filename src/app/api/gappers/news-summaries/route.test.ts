import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  batchSummarizeGapperNews: vi.fn(),
  createOpenAiNewsSummaryProvider: vi.fn(),
  getCurrentUser: vi.fn(),
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
  getNewsSummaryLlmConfig: () => ({
    apiKey: "openai-key",
    model: "gpt-4o-mini",
    provider: "openai",
  }),
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
    mocks.createOpenAiNewsSummaryProvider.mockReset();
    mocks.getCurrentUser.mockReset();
    mocks.getTickerNews.mockReset();
    mocks.requireUser.mockReset();
    mocks.resolveNewsSummaryModel.mockReset();
    mocks.createOpenAiNewsSummaryProvider.mockReturnValue({
      extract: vi.fn(),
    });
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

  it("fetches selected ticker news and returns batch summary results", async () => {
    const article = {
      articleUrl: "https://example.com/acme",
      description: "Acme reported earnings.",
      id: "article-1",
      publishedUtc: "2026-06-04T11:00:00.000Z",
      tickers: ["ACME"],
      title: "Acme earnings",
    };
    mocks.getTickerNews.mockResolvedValue([article]);
    mocks.batchSummarizeGapperNews.mockResolvedValue([
      {
        rendered: "Adjusted EPS NA / YoY NA / Beat NA",
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
          rendered: "Adjusted EPS NA / YoY NA / Beat NA",
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
    expect(mocks.batchSummarizeGapperNews).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4o-mini",
        requests: [
          {
            news: [article],
            previousCloseAt: "2026-06-03T20:00:00.000Z",
            symbol: "ACME",
          },
        ],
      }),
    );
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
