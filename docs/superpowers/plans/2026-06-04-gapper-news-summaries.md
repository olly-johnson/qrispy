# Gapper News Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-ticker, provider-selectable news summaries to the `/gappers` page, using news published after the previous regular close and deterministic earnings/guidance formatting.

**Architecture:** Keep market-news fetching in the existing Massive provider, put deterministic summary math/rendering in a pure `gapper-news-summary` module, wrap LLM calls behind a provider/model allowlist, expose a server API route for batch summaries, and extend the existing `GappersTable` client component with row selection, provider/model controls, and per-symbol summary panels.

**Tech Stack:** Next.js 16 App Router route handlers, React 19, TypeScript, Vitest, Massive REST News API, OpenAI Responses API with Structured Outputs via server-side `fetch`.

---

## File Structure

- Modify `src/lib/env.ts`: add server-side news summary LLM config helpers.
- Create `src/lib/env.test.ts`: cover provider/model defaults and missing key handling.
- Modify `src/lib/market-data/massive.ts`: add `getTickerNews`.
- Modify `src/lib/market-data/massive.test.ts`: cover Massive news URL filters.
- Create `src/lib/market-data/gapper-news-summary.ts`: pure types, derived percent math, deterministic rendering, provider allowlist, OpenAI request construction, and batch orchestration.
- Create `src/lib/market-data/gapper-news-summary.test.ts`: cover loss-to-gain YoY, NA rendering, multiple catalysts, provider/model errors, and batch success/error preservation.
- Create `src/app/api/gappers/news-summaries/route.ts`: authenticated POST endpoint for selected rows.
- Create `src/app/api/gappers/news-summaries/route.test.ts`: cover request validation and response shape.
- Modify `src/components/gappers-table.tsx`: add checkboxes, provider/model controls, summarize action, and summary panels.
- Keep `.github/workflows/ci.yml` unchanged because the current CI already runs `npm test`, `npm run lint`, and `npm run build`.

---

### Task 1: Add News Summary Environment Config

**Files:**
- Create: `src/lib/env.test.ts`
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Write failing env tests**

Create `src/lib/env.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { getNewsSummaryLlmConfig } from "./env";

describe("getNewsSummaryLlmConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to OpenAI and a structured-output capable model", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    expect(getNewsSummaryLlmConfig()).toEqual({
      apiKey: "openai-key",
      model: "gpt-4o-mini",
      provider: "openai",
    });
  });

  it("returns null when the selected OpenAI provider has no key", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("NEWS_SUMMARY_LLM_PROVIDER", "openai");

    expect(getNewsSummaryLlmConfig()).toBeNull();
  });

  it("preserves configured provider and model identifiers", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("NEWS_SUMMARY_LLM_MODEL", "gpt-4o-2024-08-06");
    vi.stubEnv("NEWS_SUMMARY_LLM_PROVIDER", "openai");

    expect(getNewsSummaryLlmConfig()).toEqual({
      apiKey: "openai-key",
      model: "gpt-4o-2024-08-06",
      provider: "openai",
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/env.test.ts
```

Expected: fail because `getNewsSummaryLlmConfig` does not exist.

- [ ] **Step 3: Implement env config helper**

In `src/lib/env.ts`, add:

```ts
export type NewsSummaryLlmProvider = "openai";

export type NewsSummaryLlmConfig = {
  apiKey: string;
  model: string;
  provider: NewsSummaryLlmProvider;
};
```

Then add:

```ts
export function getNewsSummaryLlmConfig(): NewsSummaryLlmConfig | null {
  const provider = (process.env.NEWS_SUMMARY_LLM_PROVIDER ?? "openai").toLowerCase();

  if (provider !== "openai") {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model: process.env.NEWS_SUMMARY_LLM_MODEL ?? "gpt-4o-mini",
    provider: "openai",
  };
}
```

- [ ] **Step 4: Run tests to verify env config passes**

Run:

```bash
npm test -- src/lib/env.test.ts
```

Expected: all tests in `env.test.ts` pass.

- [ ] **Step 5: Commit env config**

Run:

```bash
git add src/lib/env.ts src/lib/env.test.ts
git commit -m "Add news summary LLM config"
```

---

### Task 2: Add Massive Ticker News Fetching

**Files:**
- Modify: `src/lib/market-data/massive.test.ts`
- Modify: `src/lib/market-data/massive.ts`

- [ ] **Step 1: Write failing Massive news test**

Add this test to `src/lib/market-data/massive.test.ts`:

```ts
  it("fetches ticker news published after the previous close", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            article_url: "https://example.com/acme",
            description: "Acme reported earnings.",
            id: "article-1",
            published_utc: "2026-06-04T11:00:00.000Z",
            tickers: ["ACME"],
            title: "Acme jumps on earnings",
          },
        ],
      }),
    });
    const provider = new MassiveMarketDataProvider({
      apiKey: "massive-key",
      fetcher,
    });

    await expect(
      provider.getTickerNews({
        publishedAfter: "2026-06-03T20:00:00.000Z",
        ticker: "acme",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        articleUrl: "https://example.com/acme",
        id: "article-1",
        publishedUtc: "2026-06-04T11:00:00.000Z",
        title: "Acme jumps on earnings",
      }),
    ]);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe("/v2/reference/news");
    expect(url.searchParams.get("ticker")).toBe("ACME");
    expect(url.searchParams.get("published_utc.gt")).toBe("2026-06-03T20:00:00.000Z");
    expect(url.searchParams.get("sort")).toBe("published_utc");
    expect(url.searchParams.get("order")).toBe("desc");
    expect(url.searchParams.get("limit")).toBe("50");
    expect(url.searchParams.get("apiKey")).toBe("massive-key");
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/market-data/massive.test.ts
```

Expected: fail because `getTickerNews` does not exist.

- [ ] **Step 3: Implement news method and types**

In `src/lib/market-data/massive.ts`, add:

```ts
export type MassiveNewsArticle = {
  articleUrl: string | null;
  description: string | null;
  id: string;
  publishedUtc: string;
  tickers: string[];
  title: string;
};
```

Inside `MassiveMarketDataProvider`, add:

```ts
  async getTickerNews({
    publishedAfter,
    ticker,
  }: {
    publishedAfter: string;
    ticker: string;
  }): Promise<MassiveNewsArticle[]> {
    const url = new URL(`${this.baseUrl}/v2/reference/news`);
    url.searchParams.set("ticker", ticker.toUpperCase());
    url.searchParams.set("published_utc.gt", publishedAfter);
    url.searchParams.set("sort", "published_utc");
    url.searchParams.set("order", "desc");
    url.searchParams.set("limit", "50");
    url.searchParams.set("apiKey", this.apiKey);

    const response = await this.fetcher(url.toString(), { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Massive news request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { results?: unknown[] };
    const results = Array.isArray(payload.results) ? payload.results : [];

    return results.map(normalizeNewsArticle).filter((article) => article != null);
  }
```

Then add:

```ts
function normalizeNewsArticle(result: unknown): MassiveNewsArticle | null {
  const row = result as Record<string, unknown>;
  const id = String(row.id ?? "");
  const publishedUtc = String(row.published_utc ?? "");
  const title = String(row.title ?? "");

  if (!id || !publishedUtc || !title) {
    return null;
  }

  return {
    articleUrl: typeof row.article_url === "string" ? row.article_url : null,
    description: typeof row.description === "string" ? row.description : null,
    id,
    publishedUtc,
    tickers: Array.isArray(row.tickers) ? row.tickers.map(String) : [],
    title,
  };
}
```

- [ ] **Step 4: Run tests to verify Massive news passes**

Run:

```bash
npm test -- src/lib/market-data/massive.test.ts
```

Expected: all Massive provider tests pass.

- [ ] **Step 5: Commit Massive news method**

Run:

```bash
git add src/lib/market-data/massive.ts src/lib/market-data/massive.test.ts
git commit -m "Add Massive ticker news fetch"
```

---

### Task 3: Add Deterministic Summary Formatting And Batch Logic

**Files:**
- Create: `src/lib/market-data/gapper-news-summary.test.ts`
- Create: `src/lib/market-data/gapper-news-summary.ts`

- [ ] **Step 1: Write failing summary tests**

Create `src/lib/market-data/gapper-news-summary.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  batchSummarizeGapperNews,
  calculateChangePercent,
  renderGapperNewsSummary,
  resolveNewsSummaryModel,
  type ExtractedGapperNews,
  type NewsSummaryProvider,
} from "./gapper-news-summary";

describe("calculateChangePercent", () => {
  it("handles loss-to-gain YoY by dividing by the absolute original loss", () => {
    expect(calculateChangePercent(0.12, -0.30)).toBe(140);
  });
});

describe("renderGapperNewsSummary", () => {
  it("renders deterministic NA lines when earnings and guidance are unavailable", () => {
    expect(
      renderGapperNewsSummary({
        catalysts: [],
        earnings: {
          adjustedEps: { actual: null, estimate: null, priorYear: null },
          revenue: { actual: null, estimate: null, priorYear: null },
        },
        fullYearGuidance: { eps: null, revenue: null },
        nextQuarterGuidance: { eps: null, revenue: null },
        notableNews: [],
        sources: [],
      }),
    ).toContain("Adjusted EPS NA / YoY NA / Beat NA");
  });

  it("preserves multiple catalysts and calculates derived percentages in code", () => {
    const rendered = renderGapperNewsSummary({
      catalysts: [
        { sourceIds: ["a1"], summary: "Reported better-than-expected earnings.", type: "Earnings" },
        { sourceIds: ["a2"], summary: "Announced a new AI infrastructure contract.", type: "Contract" },
      ],
      earnings: {
        adjustedEps: { actual: 0.12, estimate: 0.1, priorYear: -0.3 },
        revenue: { actual: 124_700_000, estimate: 106_500_000, priorYear: 107_600_000 },
      },
      fullYearGuidance: { eps: null, revenue: "25%" },
      nextQuarterGuidance: { eps: "30% - 100%", revenue: "6% - 10%" },
      notableNews: ["CEO said revenue rose due to demand for AI products."],
      sources: [
        { id: "a1", publishedUtc: "2026-06-04T11:00:00.000Z", title: "Earnings", url: "https://example.com/earnings" },
        { id: "a2", publishedUtc: "2026-06-04T12:00:00.000Z", title: "Contract", url: "https://example.com/contract" },
      ],
    });

    expect(rendered).toContain("Adjusted EPS $0.12 / YoY 140.00% / Beat 20.00%");
    expect(rendered).toContain("Rev $124.7M / YoY 15.89% / Beat 17.09%");
    expect(rendered).toContain("Full year guidance: EPS NA / Rev 25%");
    expect(rendered).toContain("- Contract: Announced a new AI infrastructure contract.");
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
  it("summarizes selected symbols and preserves per-symbol errors", async () => {
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
          { news: [], previousCloseAt: "2026-06-03T20:00:00.000Z", symbol: "ACME" },
          { news: [], previousCloseAt: "2026-06-03T20:00:00.000Z", symbol: "FAIL" },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ status: "success", symbol: "ACME" }),
      expect.objectContaining({ error: "LLM failed", status: "error", symbol: "FAIL" }),
    ]);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/market-data/gapper-news-summary.test.ts
```

Expected: fail because `gapper-news-summary.ts` does not exist.

- [ ] **Step 3: Implement pure summary logic and allowlist**

Create `src/lib/market-data/gapper-news-summary.ts` with:

```ts
import type { MassiveNewsArticle } from "./massive";

export type NewsSummaryProviderId = "openai";

export type NewsSummaryModelSelection = {
  model: string;
  provider: NewsSummaryProviderId;
};

export type ExtractedGapperNews = {
  catalysts: Array<{ sourceIds: string[]; summary: string; type: string }>;
  earnings: {
    adjustedEps: { actual: number | null; estimate: number | null; priorYear: number | null };
    revenue: { actual: number | null; estimate: number | null; priorYear: number | null };
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
```

Add these functions:

```ts
export function calculateChangePercent(actual: number | null, baseline: number | null) {
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
  if (!SUPPORTED_MODELS.openai.includes(requestedModel as (typeof SUPPORTED_MODELS.openai)[number])) {
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
  requests: Array<{ news: MassiveNewsArticle[]; previousCloseAt: string; symbol: string }>;
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

export function renderGapperNewsSummary(
  extracted: ExtractedGapperNews & {
    sources: Array<{ id: string; publishedUtc: string; title: string; url: string | null }>;
  },
) {
  const eps = extracted.earnings.adjustedEps;
  const revenue = extracted.earnings.revenue;
  const notableNews =
    extracted.notableNews.length > 0
      ? extracted.notableNews.join(" ")
      : "NA";
  const catalysts =
    extracted.catalysts.length > 0
      ? extracted.catalysts.map((item) => `- ${item.type}: ${item.summary}`).join("\n")
      : "- NA";
  const sources =
    extracted.sources.length > 0
      ? extracted.sources
          .map((source) => `- ${source.title} (${source.publishedUtc}) ${source.url ?? ""}`.trim())
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
```

Add private formatters:

```ts
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
    return `$${trimNumber(value / 1_000_000_000)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${trimNumber(value / 1_000_000)}M`;
  }

  return formatCurrency(value, 0);
}

function formatPercent(value: number | null) {
  if (value == null) {
    return "NA";
  }

  return `${trimNumber(value)}%`;
}

function trimNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(value);
}
```

- [ ] **Step 4: Run tests to verify summary logic passes**

Run:

```bash
npm test -- src/lib/market-data/gapper-news-summary.test.ts
```

Expected: all summary tests pass.

- [ ] **Step 5: Commit summary logic**

Run:

```bash
git add src/lib/market-data/gapper-news-summary.ts src/lib/market-data/gapper-news-summary.test.ts
git commit -m "Add deterministic gapper news summaries"
```

---

### Task 4: Add OpenAI Structured Extraction Provider

**Files:**
- Modify: `src/lib/market-data/gapper-news-summary.test.ts`
- Modify: `src/lib/market-data/gapper-news-summary.ts`

- [ ] **Step 1: Write failing OpenAI provider test**

Add to `src/lib/market-data/gapper-news-summary.test.ts`:

```ts
import { createOpenAiNewsSummaryProvider } from "./gapper-news-summary";
```

Then add:

```ts
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
    expect(JSON.stringify(body)).toContain("Acme earnings");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/market-data/gapper-news-summary.test.ts
```

Expected: fail because `createOpenAiNewsSummaryProvider` does not exist.

- [ ] **Step 3: Implement OpenAI provider**

In `src/lib/market-data/gapper-news-summary.ts`, add:

```ts
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
        throw new Error(`OpenAI news summary request failed with ${response.status}`);
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
```

Add a response text helper that supports both SDK-style `output_text` and the raw Responses API `output[].content[].text` shape:

```ts
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
```

Add `NEWS_SUMMARY_JSON_SCHEMA` with required nullable fields:

```ts
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
  required: ["catalysts", "earnings", "fullYearGuidance", "nextQuarterGuidance", "notableNews"],
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
```

- [ ] **Step 4: Run tests to verify OpenAI provider passes**

Run:

```bash
npm test -- src/lib/market-data/gapper-news-summary.test.ts
```

Expected: all summary tests pass.

- [ ] **Step 5: Commit OpenAI provider**

Run:

```bash
git add src/lib/market-data/gapper-news-summary.ts src/lib/market-data/gapper-news-summary.test.ts
git commit -m "Add OpenAI gapper news extractor"
```

---

### Task 5: Add Batch News Summary API Route

**Files:**
- Create: `src/app/api/gappers/news-summaries/route.test.ts`
- Create: `src/app/api/gappers/news-summaries/route.ts`

- [ ] **Step 1: Write failing route tests**

Create `src/app/api/gappers/news-summaries/route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => ({ id: "user-1", email: "owner@example.com" })),
}));

vi.mock("@/lib/env", () => ({
  getMassiveConfig: () => ({ apiKey: "massive-key", baseUrl: "https://api.massive.com" }),
  getNewsSummaryLlmConfig: () => ({ apiKey: "openai-key", model: "gpt-4o-mini", provider: "openai" }),
}));

describe("POST /api/gappers/news-summaries", () => {
  it("rejects empty selections", async () => {
    const response = await POST(
      new Request("http://localhost/api/gappers/news-summaries", {
        body: JSON.stringify({ model: "gpt-4o-mini", provider: "openai", tickers: [] }),
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/app/api/gappers/news-summaries/route.test.ts
```

Expected: fail because the route does not exist.

- [ ] **Step 3: Implement route skeleton and validation**

Create `src/app/api/gappers/news-summaries/route.ts`:

```ts
import { requireUser } from "@/lib/auth/session";
import { getNewsSummaryLlmConfig } from "@/lib/env";
import {
  batchSummarizeGapperNews,
  createOpenAiNewsSummaryProvider,
  resolveNewsSummaryModel,
} from "@/lib/market-data/gapper-news-summary";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";

export const dynamic = "force-dynamic";

type SummaryRequestBody = {
  model?: string;
  provider?: string;
  tickers?: Array<{ previousCloseAt: string; symbol: string }>;
};

export async function POST(request: Request) {
  await requireUser();

  const body = (await request.json()) as SummaryRequestBody;
  const tickers = Array.isArray(body.tickers) ? body.tickers : [];

  if (tickers.length === 0) {
    return Response.json({ error: "Select at least one ticker." }, { status: 400 });
  }

  const configured = getNewsSummaryLlmConfig();
  const selection = resolveNewsSummaryModel({
    requestedModel: body.model ?? configured?.model ?? "gpt-4o-mini",
    requestedProvider: body.provider ?? configured?.provider ?? "openai",
  });

  if (!configured || configured.provider !== selection.provider) {
    return Response.json({ error: "Selected news summary provider is not configured." }, { status: 400 });
  }

  const massive = createMassiveMarketDataProvider();
  if (!massive) {
    return Response.json({ error: "Massive API key is not configured." }, { status: 400 });
  }

  const requests = await Promise.all(
    tickers.map(async (ticker) => ({
      news: await massive.getTickerNews({
        publishedAfter: ticker.previousCloseAt,
        ticker: ticker.symbol,
      }),
      previousCloseAt: ticker.previousCloseAt,
      symbol: ticker.symbol.toUpperCase(),
    })),
  );

  const results = await batchSummarizeGapperNews({
    model: selection.model,
    provider: createOpenAiNewsSummaryProvider({ apiKey: configured.apiKey }),
    requests,
  });

  return Response.json({ results });
}
```

- [ ] **Step 4: Run route tests**

Run:

```bash
npm test -- src/app/api/gappers/news-summaries/route.test.ts
```

Expected: route validation test passes.

- [ ] **Step 5: Commit route**

Run:

```bash
git add src/app/api/gappers/news-summaries/route.ts src/app/api/gappers/news-summaries/route.test.ts
git commit -m "Add gapper news summary API"
```

---

### Task 6: Add Previous-Close Cutoff To Gapper Rows

**Files:**
- Modify: `src/lib/market-data/gappers.ts`
- Modify: `src/lib/market-data/gappers.test.ts`

- [ ] **Step 1: Write failing test for `previousCloseAt`**

In `src/lib/market-data/gappers.test.ts`, assert an existing row contains:

```ts
previousCloseAt: "2026-06-03T20:00:00.000Z",
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- src/lib/market-data/gappers.test.ts
```

Expected: fail because `previousCloseAt` is missing.

- [ ] **Step 3: Implement previous close cutoff**

In `src/lib/market-data/gappers.ts`, add `previousCloseAt: string` to `GappersRow`. Set it by deriving yesterday 4:00 PM ET from the row's `loadedAt` date using the existing Eastern time helpers.

- [ ] **Step 4: Run gappers tests**

Run:

```bash
npm test -- src/lib/market-data/gappers.test.ts
```

Expected: gappers tests pass.

- [ ] **Step 5: Commit previous-close cutoff**

Run:

```bash
git add src/lib/market-data/gappers.ts src/lib/market-data/gappers.test.ts
git commit -m "Add gapper previous close cutoff"
```

---

### Task 7: Add Multi-Select Summary UI

**Files:**
- Modify: `src/components/gappers-table.tsx`

- [ ] **Step 1: Update the client component**

Modify `src/components/gappers-table.tsx` to:

- Add `selectedSymbols` state as `Set<string>`.
- Add provider/model state defaulting to `"openai"` and `"gpt-4o-mini"`.
- Add checkboxes in the header and each row.
- Add `Summarise selected` button.
- POST selected `{ symbol, previousCloseAt }` rows to `/api/gappers/news-summaries`.
- Render per-symbol summary panels under the filter section.

The selected row payload must use `row.previousCloseAt`.

- [ ] **Step 2: Run lint to catch TSX issues**

Run:

```bash
npm run lint
```

Expected: lint passes.

- [ ] **Step 3: Commit UI**

Run:

```bash
git add src/components/gappers-table.tsx
git commit -m "Add gapper news summary UI"
```

---

### Task 8: Full Verification, Push, And PR Update

**Files:**
- No new files unless a screenshot can be captured after authenticated browser verification.

- [ ] **Step 1: Run full local verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands pass.

- [ ] **Step 2: Browser smoke test**

Run the app locally and verify:

- Rows can be selected.
- Provider/model controls are visible.
- `Summarise selected` disables with no selection and enables with selected rows.
- Missing `OPENAI_API_KEY` shows a clear summarizer configuration error.
- Summary panels do not overlap the table or filters.

- [ ] **Step 3: Push branch and update PR**

Run:

```bash
git push origin codex/gappers-page
```

If the branch history diverged because the spec commit was amended, use:

```bash
git push --force-with-lease origin codex/gappers-page
```

Then confirm PR #8 checks pass.

---

## Self-Review Notes

- Spec coverage: plan covers multi-row selection, parallel summaries, news cutoff, multiple catalysts, deterministic rendering, `NA` guidance, provider/model switching, server-side keys, and loss-to-gain YoY math.
- Placeholder scan: no `TBD`, `TODO`, or open-ended implementation placeholders remain.
- Type consistency: provider/model types, summary result types, and request shapes are introduced before use.
