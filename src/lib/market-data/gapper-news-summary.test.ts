import { describe, expect, it, vi } from "vitest";

import {
  batchSummarizeGapperNews,
  calculateChangePercent,
  createOpenAiNewsSummaryProvider,
  renderGapperNewsSummary,
  resolveNewsSummaryModel,
  type ExtractedGapperNews,
  type NewsSummaryProvider,
} from "./gapper-news-summary";

describe("calculateChangePercent", () => {
  it("handles loss-to-gain YoY by dividing by the absolute original loss", () => {
    expect(calculateChangePercent(0.12, -0.3)).toBe(140);
  });
});

describe("renderGapperNewsSummary", () => {
  it("renders deterministic NA lines when earnings and guidance are unavailable", () => {
    expect(
      renderGapperNewsSummary({
        ...emptyExtracted(),
        sources: [],
      }),
    ).toContain("Adjusted EPS NA / YoY NA / Beat NA");
  });

  it("preserves multiple catalysts and calculates derived percentages in code", () => {
    const rendered = renderGapperNewsSummary({
      catalysts: [
        {
          sourceIds: ["a1"],
          summary: "Reported better-than-expected earnings.",
          type: "Earnings",
        },
        {
          sourceIds: ["a2"],
          summary: "Announced a new AI infrastructure contract.",
          type: "Contract",
        },
      ],
      earnings: {
        adjustedEps: { actual: 0.12, estimate: 0.1, priorYear: -0.3 },
        revenue: {
          actual: 124_700_000,
          estimate: 106_500_000,
          priorYear: 107_600_000,
        },
      },
      fullYearGuidance: { eps: null, revenue: "25% YoY" },
      nextQuarterGuidance: { eps: "30% - 100%", revenue: "6% - 10%" },
      notableNews: [
        "CEO said revenue rose due to demand for AI products.",
      ],
      sources: [
        {
          id: "a1",
          publishedUtc: "2026-06-04T11:00:00.000Z",
          title: "Earnings",
          url: "https://example.com/earnings",
        },
        {
          id: "a2",
          publishedUtc: "2026-06-04T12:00:00.000Z",
          title: "Contract",
          url: "https://example.com/contract",
        },
      ],
    });

    expect(rendered).toContain(
      "Adjusted EPS $0.12 / YoY 140.00% / Beat 20.00%",
    );
    expect(rendered).toContain(
      "Rev $124.7M / YoY 15.89% / Beat 17.09%",
    );
    expect(rendered).toContain(
      "Guidance Next Quarter: EPS YoY 30% - 100% / Rev YoY 6% - 10%",
    );
    expect(rendered).toContain("Full year guidance: EPS YoY NA / Rev YoY 25% YoY");
    expect(rendered).toContain(
      "- Contract: Announced a new AI infrastructure contract.",
    );
  });
});

describe("resolveNewsSummaryModel", () => {
  it("accepts only configured provider/model allowlist values", () => {
    expect(
      resolveNewsSummaryModel({
        requestedModel: "gpt-4o-mini",
        requestedProvider: "openai",
      }),
    ).toEqual({ model: "gpt-4o-mini", provider: "openai" });

    expect(() =>
      resolveNewsSummaryModel({
        requestedModel: "not-real",
        requestedProvider: "openai",
      }),
    ).toThrow("Unsupported news summary model");
  });
});

describe("batchSummarizeGapperNews", () => {
  it("summarizes selected symbols in parallel and preserves per-symbol errors", async () => {
    const provider: NewsSummaryProvider = {
      extract: vi.fn(async ({ symbol }) => {
        if (symbol === "FAIL") {
          throw new Error("LLM failed");
        }

        return emptyExtracted();
      }),
    };

    await expect(
      batchSummarizeGapperNews({
        provider,
        requests: [
          {
            news: [article("ACME")],
            previousCloseAt: "2026-06-03T20:00:00.000Z",
            symbol: "ACME",
          },
          {
            news: [article("FAIL")],
            previousCloseAt: "2026-06-03T20:00:00.000Z",
            symbol: "FAIL",
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ status: "success", symbol: "ACME" }),
      expect.objectContaining({
        error: "LLM failed",
        status: "error",
        symbol: "FAIL",
      }),
    ]);

    expect(provider.extract).toHaveBeenCalledTimes(2);
  });

  it("returns a no-news result without calling the LLM when Massive has no articles", async () => {
    const provider: NewsSummaryProvider = {
      extract: vi.fn(async () => emptyExtracted()),
    };

    await expect(
      batchSummarizeGapperNews({
        provider,
        requests: [
          {
            news: [],
            previousCloseAt: "2026-06-05T20:00:00.000Z",
            symbol: "STI",
          },
        ],
      }),
    ).resolves.toEqual([
      {
        message: "No Massive news found after previous close.",
        status: "no_news",
        symbol: "STI",
      },
    ]);

    expect(provider.extract).not.toHaveBeenCalled();
  });
});

describe("createOpenAiNewsSummaryProvider", () => {
  it("calls the Responses API with strict JSON schema and article context", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify(emptyExtracted()),
        }),
        { status: 200 },
      ),
    );
    const provider = createOpenAiNewsSummaryProvider({
      apiKey: "openai-key",
      fetcher,
    });

    await provider.extract({
      model: "gpt-4o-mini",
      news: [
        {
          articleUrl: "https://example.com/acme",
          description: "Acme reported adjusted EPS of $0.12.",
          id: "article-1",
          publishedUtc: "2026-06-04T11:00:00.000Z",
          tickers: ["ACME"],
          title: "Acme earnings",
        },
      ],
      previousCloseAt: "2026-06-03T20:00:00.000Z",
      symbol: "ACME",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer openai-key",
          "content-type": "application/json",
        }),
        method: "POST",
      }),
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(JSON.stringify(body)).toContain("Do not infer missing numbers");
    expect(JSON.stringify(body)).toContain(
      "Guidance fields must be YoY percentage strings only",
    );
    expect(JSON.stringify(body)).toContain("Acme earnings");
  });
});

function emptyExtracted(): ExtractedGapperNews {
  return {
    catalysts: [],
    earnings: {
      adjustedEps: { actual: null, estimate: null, priorYear: null },
      revenue: { actual: null, estimate: null, priorYear: null },
    },
    fullYearGuidance: { eps: null, revenue: null },
    nextQuarterGuidance: { eps: null, revenue: null },
    notableNews: [],
  };
}

function article(symbol: string) {
  return {
    articleUrl: `https://example.com/${symbol.toLowerCase()}`,
    description: `${symbol} reported news.`,
    id: `${symbol}-article-1`,
    publishedUtc: "2026-06-04T11:00:00.000Z",
    tickers: [symbol],
    title: `${symbol} news`,
  };
}
