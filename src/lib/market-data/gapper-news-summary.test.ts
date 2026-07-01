import { describe, expect, it, vi } from "vitest";

import type { NormalizedGapperNewsSource } from "./gapper-news-sources";
import {
  batchSummarizeGapperNews,
  calculateChangePercent,
  createOpenAiNewsSummaryProvider,
  resolveNewsSummaryModel,
  type ExtractedGapperNews,
  type NewsSummaryProvider,
} from "./gapper-news-summary";

describe("calculateChangePercent", () => {
  it("handles loss-to-gain YoY by dividing by the absolute original loss", () => {
    expect(calculateChangePercent(0.12, -0.3)).toBe(140);
  });
});

describe("resolveNewsSummaryModel", () => {
  it("accepts only configured provider/model allowlist values", () => {
    expect(
      resolveNewsSummaryModel({
        requestedModel: "gpt-5.5",
        requestedProvider: "openai",
      }),
    ).toEqual({ model: "gpt-5.5", provider: "openai" });

    expect(() =>
      resolveNewsSummaryModel({
        requestedModel: "not-real",
        requestedProvider: "openai",
      }),
    ).toThrow("Unsupported news summary model");
  });
});

describe("batchSummarizeGapperNews", () => {
  it("returns structured success fields for collected sources", async () => {
    const provider: NewsSummaryProvider = {
      extract: vi.fn(async () => extracted()),
    };
    const sources = [source("web")];

    await expect(
      batchSummarizeGapperNews({
        provider,
        requests: [
          {
            previousCloseAt: "2026-06-15T20:00:00.000Z",
            sourceLayer: "web",
            sources,
            symbol: "ACME",
          },
        ],
      }),
    ).resolves.toEqual([
      {
        ...extracted(),
        sourceLayer: "web",
        sources,
        status: "success",
        symbol: "ACME",
      },
    ]);
  });

  it("preserves per-symbol extraction errors", async () => {
    const provider: NewsSummaryProvider = {
      extract: vi.fn(async ({ symbol }) => {
        if (symbol === "FAIL") {
          throw new Error("LLM failed");
        }

        return extracted();
      }),
    };

    await expect(
      batchSummarizeGapperNews({
        provider,
        requests: [
          {
            previousCloseAt: "2026-06-15T20:00:00.000Z",
            sourceLayer: "massive",
            sources: [source("massive")],
            symbol: "ACME",
          },
          {
            previousCloseAt: "2026-06-15T20:00:00.000Z",
            sourceLayer: "web",
            sources: [source("web")],
            symbol: "FAIL",
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ status: "success", symbol: "ACME" }),
      {
        error: "LLM failed",
        sourceLayer: "web",
        status: "error",
        symbol: "FAIL",
      },
    ]);
  });

  it("returns no_news without calling the LLM when every source layer is empty", async () => {
    const provider: NewsSummaryProvider = {
      extract: vi.fn(async () => extracted()),
    };

    await expect(
      batchSummarizeGapperNews({
        provider,
        requests: [
          {
            previousCloseAt: "2026-06-15T20:00:00.000Z",
            sourceLayer: "none",
            sources: [],
            symbol: "ACME",
          },
        ],
      }),
    ).resolves.toEqual([
      {
        message:
          "No Massive, Marketaux, OpenAI web, or Grok context found after previous close.",
        sourceLayer: "none",
        status: "no_news",
        symbol: "ACME",
      },
    ]);
    expect(provider.extract).not.toHaveBeenCalled();
  });
});

describe("createOpenAiNewsSummaryProvider", () => {
  it("calls the Responses API with strict JSON and source-layer rules", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ output_text: JSON.stringify(extracted()) }),
        { status: 200 },
      ),
    );
    const provider = createOpenAiNewsSummaryProvider({
      apiKey: "openai-key",
      fetcher,
    });

    await provider.extract({
      model: "gpt-4o-mini",
      previousCloseAt: "2026-06-15T20:00:00.000Z",
      sourceLayer: "grok",
      sources: [source("grok")],
      symbol: "ACME",
    });

    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.strict).toBe(true);
    expect(JSON.stringify(body)).toContain("Source layer: grok");
    expect(JSON.stringify(body)).toContain("social context");
    expect(JSON.stringify(body)).toContain("ACME source");
  });
});

function extracted(): ExtractedGapperNews {
  return {
    catalysts: [
      {
        sourceIds: ["web:1"],
        summary: "ACME is moving with AI infrastructure peers.",
        type: "Sympathy",
      },
    ],
    confidence: "medium",
    earnings: {
      adjustedEps: { actual: null, estimate: null, priorYear: null },
      revenue: { actual: null, estimate: null, priorYear: null },
    },
    fullYearGuidance: {
      eps: { priorYear: null, value: null },
      revenue: { priorYear: null, value: null },
    },
    headline: "ACME is gapping up with AI infrastructure peers.",
    nextQuarterGuidance: {
      eps: { priorYear: null, value: null },
      revenue: { priorYear: null, value: null },
    },
    notableNews: [],
  };
}

function source(
  layer: "grok" | "marketaux" | "massive" | "web",
): NormalizedGapperNewsSource {
  return {
    id: `${layer}:1`,
    layer,
    publishedUtc: "2026-06-16T12:00:00.000Z",
    publisher: "Example",
    snippet: "ACME source context.",
    title: "ACME source",
    url: "https://example.com/acme",
  };
}
