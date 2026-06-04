import type { MassiveNewsArticle } from "./massive";

export type NewsSummaryProviderId = "openai";

export type NewsSummaryModelSelection = {
  model: string;
  provider: NewsSummaryProviderId;
};

export type ExtractedGapperNews = {
  catalysts: Array<{ sourceIds: string[]; summary: string; type: string }>;
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
  nextQuarterGuidance: { eps: string | null; revenue: string | null };
  notableNews: string[];
};

export type NewsSummaryProvider = {
  extract(input: {
    model: string;
    news: MassiveNewsArticle[];
    previousCloseAt: string;
    symbol: string;
  }): Promise<ExtractedGapperNews>;
};

export type NewsSummaryResult =
  | { rendered: string; status: "success"; symbol: string }
  | { error: string; status: "error"; symbol: string };

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
    news: MassiveNewsArticle[];
    previousCloseAt: string;
    symbol: string;
  }>;
}): Promise<NewsSummaryResult[]> {
  return Promise.all(
    requests.map(async (request) => {
      try {
        const extracted = await provider.extract({ ...request, model });

        return {
          rendered: renderGapperNewsSummary({
            ...extracted,
            sources: request.news.map((article) => ({
              id: article.id,
              publishedUtc: article.publishedUtc,
              title: article.title,
              url: article.articleUrl,
            })),
          }),
          status: "success" as const,
          symbol: request.symbol,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
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
                    "Use only the supplied news articles.",
                    "Do not infer missing numbers.",
                    "Return null for unavailable numeric or guidance fields.",
                    `Symbol: ${input.symbol}`,
                    `Previous close cutoff: ${input.previousCloseAt}`,
                    `Articles: ${JSON.stringify(input.news)}`,
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

      const payload = await response.json();
      const outputText = extractOpenAiResponseText(payload);

      if (!outputText) {
        throw new Error("OpenAI news summary response did not include text output");
      }

      return JSON.parse(outputText) as ExtractedGapperNews;
    },
  };
}

export function renderGapperNewsSummary(
  extracted: ExtractedGapperNews & {
    sources: Array<{
      id: string;
      publishedUtc: string;
      title: string;
      url: string | null;
    }>;
  },
) {
  const eps = extracted.earnings.adjustedEps;
  const revenue = extracted.earnings.revenue;
  const notableNews =
    extracted.notableNews.length > 0 ? extracted.notableNews.join(" ") : "NA";
  const catalysts =
    extracted.catalysts.length > 0
      ? extracted.catalysts
          .map((item) => `- ${item.type}: ${item.summary}`)
          .join("\n")
      : "- NA";
  const sources =
    extracted.sources.length > 0
      ? extracted.sources
          .map((source) =>
            `- ${source.title} (${source.publishedUtc}) ${source.url ?? ""}`.trim(),
          )
          .join("\n")
      : "- NA";

  return [
    `Adjusted EPS ${formatCurrency(eps.actual, 2)} / YoY ${formatPercent(calculateChangePercent(eps.actual, eps.priorYear))} / Beat ${formatPercent(calculateChangePercent(eps.actual, eps.estimate))}`,
    `Rev ${formatLargeCurrency(revenue.actual)} / YoY ${formatPercent(calculateChangePercent(revenue.actual, revenue.priorYear))} / Beat ${formatPercent(calculateChangePercent(revenue.actual, revenue.estimate))}`,
    `Guidance Next Quarter: EPS ${extracted.nextQuarterGuidance.eps ?? "NA"} / Rev ${extracted.nextQuarterGuidance.revenue ?? "NA"}`,
    `Full year guidance: EPS ${extracted.fullYearGuidance.eps ?? "NA"} / Rev ${extracted.fullYearGuidance.revenue ?? "NA"}`,
    `Notable News: ${notableNews}`,
    "Other Catalysts:",
    catalysts,
    "Sources:",
    sources,
  ].join("\n");
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
    nextQuarterGuidance: guidanceSchema(),
    notableNews: { items: { type: "string" }, type: "array" },
  },
  required: [
    "catalysts",
    "earnings",
    "fullYearGuidance",
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

function formatCurrency(value: number | null, decimals: number) {
  if (value == null) {
    return "NA";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
    style: "currency",
  }).format(value);
}

function formatLargeCurrency(value: number | null) {
  if (value == null) {
    return "NA";
  }

  if (Math.abs(value) >= 1_000_000_000) {
    return `$${trimCompactNumber(value / 1_000_000_000)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${trimCompactNumber(value / 1_000_000)}M`;
  }

  return formatCurrency(value, 0);
}

function formatPercent(value: number | null) {
  if (value == null) {
    return "NA";
  }

  return `${trimFixedNumber(value)}%`;
}

function trimFixedNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}

function trimCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
