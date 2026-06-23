import type {
  GapperNewsSourceLayer,
  NormalizedGapperNewsSource,
} from "./gapper-news-sources";

export type NewsSummaryProviderId = "openai";

export type NewsSummaryModelSelection = {
  model: string;
  provider: NewsSummaryProviderId;
};

export type NewsSummaryConfidence = "high" | "low" | "medium";

export type ExtractedGapperNews = {
  catalysts: Array<{ sourceIds: string[]; summary: string; type: string }>;
  confidence: NewsSummaryConfidence;
  earnings: {
    adjustedEps: {
      actual: number | null;
      estimate: number | null;
      priorYear: number | null;
    };
    revenue: {
      actual: number | null;
      estimate: number | null;
      priorYear: number | null;
    };
  };
  fullYearGuidance: { eps: string | null; revenue: string | null };
  headline: string;
  nextQuarterGuidance: { eps: string | null; revenue: string | null };
  notableNews: string[];
};

export type NewsSummaryProvider = {
  extract(input: {
    model: string;
    previousCloseAt: string;
    sourceLayer: GapperNewsSourceLayer;
    sources: NormalizedGapperNewsSource[];
    symbol: string;
  }): Promise<ExtractedGapperNews>;
};

export type NewsSummaryResult =
  | (ExtractedGapperNews & {
      sourceLayer: Exclude<GapperNewsSourceLayer, "none">;
      sources: NormalizedGapperNewsSource[];
      status: "success";
      symbol: string;
    })
  | { message: string; sourceLayer: "none"; status: "no_news"; symbol: string }
  | {
      error: string;
      sourceLayer: GapperNewsSourceLayer;
      status: "error";
      symbol: string;
    };

const SUPPORTED_MODELS = {
  openai: ["gpt-4o-mini", "gpt-4o-2024-08-06"],
} as const;

export function calculateChangePercent(
  actual: number | null,
  baseline: number | null,
) {
  if (actual == null || baseline == null || baseline === 0) {
    return null;
  }

  return ((actual - baseline) / Math.abs(baseline)) * 100;
}

export function resolveNewsSummaryModel({
  requestedModel,
  requestedProvider,
}: {
  requestedModel: string;
  requestedProvider: string;
}): NewsSummaryModelSelection {
  if (requestedProvider !== "openai") {
    throw new Error("Unsupported news summary provider");
  }

  if (
    !SUPPORTED_MODELS.openai.includes(
      requestedModel as (typeof SUPPORTED_MODELS.openai)[number],
    )
  ) {
    throw new Error("Unsupported news summary model");
  }

  return { model: requestedModel, provider: "openai" };
}

export async function batchSummarizeGapperNews({
  model = "gpt-4o-mini",
  provider,
  requests,
}: {
  model?: string;
  provider: NewsSummaryProvider;
  requests: Array<{
    previousCloseAt: string;
    sourceLayer: GapperNewsSourceLayer;
    sources: NormalizedGapperNewsSource[];
    symbol: string;
  }>;
}): Promise<NewsSummaryResult[]> {
  return Promise.all(
    requests.map(async (request) => {
      if (request.sourceLayer === "none") {
        return {
          message: "No Massive, web, or X context found after previous close.",
          sourceLayer: "none" as const,
          status: "no_news" as const,
          symbol: request.symbol,
        };
      }

      try {
        const extracted = await provider.extract({ ...request, model });

        return {
          ...extracted,
          sourceLayer: request.sourceLayer,
          sources: request.sources,
          status: "success" as const,
          symbol: request.symbol,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          sourceLayer: request.sourceLayer,
          status: "error" as const,
          symbol: request.symbol,
        };
      }
    }),
  );
}

export function createOpenAiNewsSummaryProvider({
  apiKey,
  fetcher = fetch,
}: {
  apiKey: string;
  fetcher?: typeof fetch;
}): NewsSummaryProvider {
  return {
    async extract(input) {
      const response = await fetcher("https://api.openai.com/v1/responses", {
        body: JSON.stringify({
          input: [
            {
              content: [
                {
                  text: [
                    "Extract market-moving news catalysts as JSON.",
                    "Return a one-sentence headline answering why the stock is gapping today.",
                    "Return one to three material catalysts.",
                    "Use only the supplied sources.",
                    "Do not infer missing numbers.",
                    "Return null for unavailable numeric or guidance fields.",
                    "Guidance fields must be YoY percentage strings only; return null when guidance is only given as absolute EPS or revenue values.",
                    "Use confidence to express uncertainty instead of inventing facts.",
                    "When sourceLayer is x, treat X posts as social context unless they link to credible sources.",
                    `Symbol: ${input.symbol}`,
                    `Previous close cutoff: ${input.previousCloseAt}`,
                    `Source layer: ${input.sourceLayer}`,
                    `Sources: ${JSON.stringify(input.sources)}`,
                  ].join("\n"),
                  type: "input_text",
                },
              ],
              role: "user",
            },
          ],
          model: input.model,
          text: {
            format: {
              name: "gapper_news_summary",
              schema: NEWS_SUMMARY_JSON_SCHEMA,
              strict: true,
              type: "json_schema",
            },
          },
        }),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(
          `OpenAI news summary request failed with ${response.status}`,
        );
      }

      const outputText = extractOpenAiResponseText(await response.json());

      if (!outputText) {
        throw new Error("OpenAI news summary response did not include text output");
      }

      return JSON.parse(outputText) as ExtractedGapperNews;
    },
  };
}

const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const NEWS_SUMMARY_JSON_SCHEMA = {
  additionalProperties: false,
  properties: {
    catalysts: {
      items: {
        additionalProperties: false,
        properties: {
          sourceIds: { items: { type: "string" }, type: "array" },
          summary: { type: "string" },
          type: { type: "string" },
        },
        required: ["sourceIds", "summary", "type"],
        type: "object",
      },
      type: "array",
    },
    confidence: { enum: ["high", "medium", "low"], type: "string" },
    earnings: {
      additionalProperties: false,
      properties: {
        adjustedEps: metricSchema(),
        revenue: metricSchema(),
      },
      required: ["adjustedEps", "revenue"],
      type: "object",
    },
    fullYearGuidance: guidanceSchema(),
    headline: { type: "string" },
    nextQuarterGuidance: guidanceSchema(),
    notableNews: { items: { type: "string" }, type: "array" },
  },
  required: [
    "catalysts",
    "confidence",
    "earnings",
    "fullYearGuidance",
    "headline",
    "nextQuarterGuidance",
    "notableNews",
  ],
  type: "object",
};

function metricSchema() {
  return {
    additionalProperties: false,
    properties: {
      actual: nullableNumber,
      estimate: nullableNumber,
      priorYear: nullableNumber,
    },
    required: ["actual", "estimate", "priorYear"],
    type: "object",
  };
}

function guidanceSchema() {
  return {
    additionalProperties: false,
    properties: {
      eps: nullableString,
      revenue: nullableString,
    },
    required: ["eps", "revenue"],
    type: "object",
  };
}

function extractOpenAiResponseText(payload: unknown) {
  const row = payload as {
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
    output_text?: string;
  };

  if (typeof row.output_text === "string") {
    return row.output_text;
  }

  return row.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((text): text is string => typeof text === "string" && text.length > 0);
}
