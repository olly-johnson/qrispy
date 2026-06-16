# Gapper News Source Cascade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand gapper news summaries from Massive-only text blobs into a cost-controlled Massive to web search to X cascade with compact structured UI cards.

**Architecture:** Add a server-only source cascade that normalizes Massive, OpenAI web search, and optional X results into one source shape. Change the summarizer from returning rendered text to returning structured fields. Render those fields in the client component with a headline, catalyst bullets, optional earnings/guidance, and small muted source links.

**Tech Stack:** Next.js App Router route handler, React client component, TypeScript, Vitest, OpenAI Responses API, Massive API, optional X API.

---

## File Structure

- Modify `src/lib/env.ts`: optional web search and X configuration helpers.
- Modify `src/lib/env.test.ts`: configuration tests.
- Create `src/lib/market-data/gapper-news-sources.ts`: source-layer types, normalized source records, OpenAI web search provider, X provider, and cascade orchestration.
- Create `src/lib/market-data/gapper-news-sources.test.ts`: source cascade tests.
- Modify `src/lib/market-data/gapper-news-summary.ts`: structured extraction, prompt rules, result types.
- Modify `src/lib/market-data/gapper-news-summary.test.ts`: structured summary and prompt tests.
- Modify `src/app/api/gappers/news-summaries/route.ts`: per-ticker source cascade integration.
- Modify `src/app/api/gappers/news-summaries/route.test.ts`: route tests for cascade requests.
- Modify `src/lib/market-data/gappers-client.ts`: structured result types, cache compatibility, display helpers.
- Modify `src/lib/market-data/gappers-client.test.ts`: cache and display helper tests.
- Modify `src/components/gappers-table.tsx`: compact card rendering.

## Branch Setup

- [ ] **Step 1: Update base branch**

Run:

```powershell
git fetch origin
git checkout main
git pull origin main
```

Expected: local `main` is up to date with `origin/main`.

- [ ] **Step 2: Create implementation branch**

Run:

```powershell
git checkout -b codex/gapper-news-source-cascade
```

Expected: new branch created from current `main`.

## Task 1: News Source Configuration

**Files:**
- Modify: `src/lib/env.ts`
- Test: `src/lib/env.test.ts`

- [ ] **Step 1: Write failing env tests**

Add to `src/lib/env.test.ts`:

```ts
import {
  getNewsSummaryWebSearchConfig,
  getNewsSummaryXConfig,
} from "./env";

describe("getNewsSummaryWebSearchConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables OpenAI web search when requested and OpenAI is configured", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("NEWS_SUMMARY_WEB_SEARCH_ENABLED", "true");

    expect(getNewsSummaryWebSearchConfig()).toEqual({
      apiKey: "openai-key",
      enabled: true,
      provider: "openai",
    });
  });

  it("disables web search by default", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    expect(getNewsSummaryWebSearchConfig()).toEqual({
      enabled: false,
      provider: "openai",
    });
  });
});

describe("getNewsSummaryXConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables X only when explicitly enabled with a bearer token", () => {
    vi.stubEnv("NEWS_SUMMARY_X_ENABLED", "true");
    vi.stubEnv("X_API_BEARER_TOKEN", "x-token");

    expect(getNewsSummaryXConfig()).toEqual({
      bearerToken: "x-token",
      enabled: true,
    });
  });

  it("skips X when the token is missing", () => {
    vi.stubEnv("NEWS_SUMMARY_X_ENABLED", "true");
    vi.stubEnv("X_API_BEARER_TOKEN", "");

    expect(getNewsSummaryXConfig()).toEqual({ enabled: false });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- src/lib/env.test.ts
```

Expected: FAIL because `getNewsSummaryWebSearchConfig` and `getNewsSummaryXConfig` are not exported.

- [ ] **Step 3: Implement env helpers**

Add to `src/lib/env.ts`:

```ts
export type NewsSummaryWebSearchConfig =
  | { apiKey: string; enabled: true; provider: "openai" }
  | { enabled: false; provider: "openai" };

export type NewsSummaryXConfig =
  | { bearerToken: string; enabled: true }
  | { enabled: false };

export function getNewsSummaryWebSearchConfig(): NewsSummaryWebSearchConfig {
  const enabled =
    (process.env.NEWS_SUMMARY_WEB_SEARCH_ENABLED ?? "false").toLowerCase() ===
    "true";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!enabled || !apiKey) {
    return { enabled: false, provider: "openai" };
  }

  return { apiKey, enabled: true, provider: "openai" };
}

export function getNewsSummaryXConfig(): NewsSummaryXConfig {
  const enabled =
    (process.env.NEWS_SUMMARY_X_ENABLED ?? "false").toLowerCase() === "true";
  const bearerToken = process.env.X_API_BEARER_TOKEN;

  if (!enabled || !bearerToken) {
    return { enabled: false };
  }

  return { bearerToken, enabled: true };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```powershell
npm test -- src/lib/env.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/env.ts src/lib/env.test.ts
git commit -m "Add news source cascade config"
```

## Task 2: Source Cascade Service

**Files:**
- Create: `src/lib/market-data/gapper-news-sources.ts`
- Test: `src/lib/market-data/gapper-news-sources.test.ts`

- [ ] **Step 1: Write failing cascade tests**

Create `src/lib/market-data/gapper-news-sources.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  collectGapperNewsSources,
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
    url: layer === "x"
      ? "https://x.com/marketnews/status/1"
      : "https://example.com/acme",
  };
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- src/lib/market-data/gapper-news-sources.test.ts
```

Expected: FAIL because the file and exports do not exist.

- [ ] **Step 3: Implement cascade service**

Create `src/lib/market-data/gapper-news-sources.ts`:

```ts
import type { MassiveNewsArticle } from "./massive";

export type GapperNewsSourceLayer = "massive" | "none" | "web" | "x";

export type NormalizedGapperNewsSource = {
  id: string;
  layer: Exclude<GapperNewsSourceLayer, "none">;
  publishedUtc: string | null;
  publisher: string | null;
  snippet: string | null;
  title: string;
  url: string | null;
};

export type GapperNewsSourceSearchRequest = {
  previousCloseAt: string;
  symbol: string;
};

export type NewsSourceProvider = {
  search(
    request: GapperNewsSourceSearchRequest,
  ): Promise<NormalizedGapperNewsSource[]>;
};

export async function collectGapperNewsSources({
  massiveNews,
  previousCloseAt,
  symbol,
  webProvider,
  xProvider,
}: {
  massiveNews: MassiveNewsArticle[];
  previousCloseAt: string;
  symbol: string;
  webProvider?: NewsSourceProvider | null;
  xProvider?: NewsSourceProvider | null;
}) {
  const massiveSources = massiveNews.map(normalizeMassiveArticle);

  if (massiveSources.length > 0) {
    return { layer: "massive" as const, sources: massiveSources };
  }

  const request = { previousCloseAt, symbol: symbol.toUpperCase() };
  const webSources = webProvider ? await webProvider.search(request) : [];

  if (webSources.length > 0) {
    return { layer: "web" as const, sources: webSources };
  }

  const xSources = xProvider ? await xProvider.search(request) : [];

  if (xSources.length > 0) {
    return { layer: "x" as const, sources: xSources };
  }

  return { layer: "none" as const, sources: [] };
}

export function createOpenAiWebNewsSearchProvider({
  apiKey,
  fetcher = fetch,
}: {
  apiKey: string;
  fetcher?: typeof fetch;
}): NewsSourceProvider {
  return {
    async search(request) {
      const response = await fetcher("https://api.openai.com/v1/responses", {
        body: JSON.stringify({
          input: [
            {
              content: [
                {
                  text: [
                    `Find recent web/news context for ${request.symbol}.`,
                    `Only include sources after ${request.previousCloseAt} when dates are available.`,
                    "Prefer direct company news, then peer/sector/macro context explaining today's move.",
                    "Return concise source findings.",
                  ].join("\n"),
                  type: "input_text",
                },
              ],
              role: "user",
            },
          ],
          model: "gpt-4o-mini",
          tools: [{ type: "web_search_preview" }],
        }),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`OpenAI web search request failed with ${response.status}`);
      }

      return normalizeOpenAiWebSearchPayload(await response.json());
    },
  };
}

export function createXNewsSearchProvider({
  bearerToken,
  fetcher = fetch,
}: {
  bearerToken: string;
  fetcher?: typeof fetch;
}): NewsSourceProvider {
  return {
    async search(request) {
      const url = new URL("https://api.x.com/2/tweets/search/recent");
      url.searchParams.set("query", `$${request.symbol} stock why up today -is:retweet`);
      url.searchParams.set("max_results", "10");
      url.searchParams.set("tweet.fields", "created_at,author_id");

      const response = await fetcher(url.toString(), {
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      if (!response.ok) {
        throw new Error(`X news search request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        data?: Array<{ author_id?: string; created_at?: string; id?: string; text?: string }>;
      };

      return (payload.data ?? [])
        .filter((tweet) => tweet.id && tweet.text)
        .map((tweet) => ({
          id: `x:${tweet.id}`,
          layer: "x" as const,
          publishedUtc: tweet.created_at ?? null,
          publisher: tweet.author_id ? `X user ${tweet.author_id}` : "X",
          snippet: tweet.text ?? null,
          title: tweet.author_id ? `X user ${tweet.author_id}` : "X post",
          url: `https://x.com/i/web/status/${tweet.id}`,
        }));
    },
  };
}

function normalizeMassiveArticle(
  article: MassiveNewsArticle,
): NormalizedGapperNewsSource {
  return {
    id: `massive:${article.id}`,
    layer: "massive",
    publishedUtc: article.publishedUtc,
    publisher: null,
    snippet: article.description,
    title: article.title,
    url: article.articleUrl,
  };
}

function normalizeOpenAiWebSearchPayload(
  payload: unknown,
): NormalizedGapperNewsSource[] {
  const row = payload as {
    output?: Array<{
      content?: Array<{
        annotations?: Array<{ title?: string; url?: string }>;
      }>;
    }>;
  };
  const annotations =
    row.output?.flatMap((item) =>
      (item.content ?? []).flatMap((content) => content.annotations ?? []),
    ) ?? [];

  return annotations
    .filter((annotation) => annotation.url && annotation.title)
    .map((annotation, index) => ({
      id: `web:${index}:${annotation.url}`,
      layer: "web" as const,
      publishedUtc: null,
      publisher: publisherFromUrl(annotation.url ?? null),
      snippet: null,
      title: annotation.title ?? annotation.url ?? "Web source",
      url: annotation.url ?? null,
    }));
}

function publisherFromUrl(url: string | null) {
  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run:

```powershell
npm test -- src/lib/market-data/gapper-news-sources.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/market-data/gapper-news-sources.ts src/lib/market-data/gapper-news-sources.test.ts
git commit -m "Add gapper news source cascade"
```

## Task 3: Structured Summarizer Contract

**Files:**
- Modify: `src/lib/market-data/gapper-news-summary.ts`
- Test: `src/lib/market-data/gapper-news-summary.test.ts`

- [ ] **Step 1: Write failing structured summary tests**

Add tests to `src/lib/market-data/gapper-news-summary.test.ts`:

```ts
import type { NormalizedGapperNewsSource } from "./gapper-news-sources";

describe("batchSummarizeGapperNews structured output", () => {
  it("returns no_news when the source layer is none", async () => {
    const provider: NewsSummaryProvider = {
      extract: vi.fn(async () => structuredExtracted()),
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
        message: "No Massive, web, or X context found after previous close.",
        sourceLayer: "none",
        status: "no_news",
        symbol: "ACME",
      },
    ]);
  });

  it("returns structured success fields without rendered text", async () => {
    const provider: NewsSummaryProvider = {
      extract: vi.fn(async () => structuredExtracted()),
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
        catalysts: [
          { summary: "ACME is moving with AI infrastructure peers.", type: "Sympathy" },
        ],
        confidence: "medium",
        earnings: expect.any(Object),
        fullYearGuidance: { eps: null, revenue: null },
        headline: "ACME is gapping up with AI infrastructure peers.",
        nextQuarterGuidance: { eps: null, revenue: null },
        notableNews: [],
        sourceLayer: "web",
        sources,
        status: "success",
        symbol: "ACME",
      },
    ]);
  });
});

function structuredExtracted(): ExtractedGapperNews {
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
    fullYearGuidance: { eps: null, revenue: null },
    headline: "ACME is gapping up with AI infrastructure peers.",
    nextQuarterGuidance: { eps: null, revenue: null },
    notableNews: [],
  };
}

function source(layer: "massive" | "web" | "x"): NormalizedGapperNewsSource {
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
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- src/lib/market-data/gapper-news-summary.test.ts
```

Expected: FAIL because request/result types are still Massive article and rendered-text based.

- [ ] **Step 3: Implement structured summary contract**

In `src/lib/market-data/gapper-news-summary.ts`, add source imports and replace the result contract with:

```ts
import type {
  GapperNewsSourceLayer,
  NormalizedGapperNewsSource,
} from "./gapper-news-sources";

export type NewsSummaryConfidence = "high" | "low" | "medium";

export type ExtractedGapperNews = {
  catalysts: Array<{ sourceIds: string[]; summary: string; type: string }>;
  confidence: NewsSummaryConfidence;
  earnings: {
    adjustedEps: { actual: number | null; estimate: number | null; priorYear: number | null };
    revenue: { actual: number | null; estimate: number | null; priorYear: number | null };
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
  | { error: string; sourceLayer: GapperNewsSourceLayer; status: "error"; symbol: string };
```

Update `batchSummarizeGapperNews` so `sourceLayer: "none"` returns the no-news result and successful extraction returns structured fields. Update the OpenAI prompt text to include:

```ts
"Return a one-sentence headline answering why the stock is gapping today.",
"Return one to three material catalysts.",
"Hide uncertainty in confidence, not in invented facts.",
"When sourceLayer is x, treat X posts as social context unless they link to credible sources.",
"Do not infer missing earnings, revenue, or guidance numbers.",
`Source layer: ${input.sourceLayer}`,
`Sources: ${JSON.stringify(input.sources)}`,
```

Extend `NEWS_SUMMARY_JSON_SCHEMA` with required `headline` and `confidence`.

- [ ] **Step 4: Run tests to verify pass**

Run:

```powershell
npm test -- src/lib/market-data/gapper-news-summary.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/market-data/gapper-news-summary.ts src/lib/market-data/gapper-news-summary.test.ts
git commit -m "Return structured gapper news summaries"
```

## Task 4: API Route Cascade Integration

**Files:**
- Modify: `src/app/api/gappers/news-summaries/route.ts`
- Test: `src/app/api/gappers/news-summaries/route.test.ts`

- [ ] **Step 1: Write failing route test**

Update `route.test.ts` mocks to include:

```ts
collectGapperNewsSources: vi.fn(),
createOpenAiWebNewsSearchProvider: vi.fn(),
createXNewsSearchProvider: vi.fn(),
```

Mock `@/lib/market-data/gapper-news-sources`:

```ts
vi.mock("@/lib/market-data/gapper-news-sources", () => ({
  collectGapperNewsSources: mocks.collectGapperNewsSources,
  createOpenAiWebNewsSearchProvider: mocks.createOpenAiWebNewsSearchProvider,
  createXNewsSearchProvider: mocks.createXNewsSearchProvider,
}));
```

Add test:

```ts
it("collects source cascades and passes structured requests to the summarizer", async () => {
  const massiveArticle = {
    articleUrl: "https://example.com/acme",
    description: "Acme reported earnings.",
    id: "article-1",
    publishedUtc: "2026-06-16T11:00:00.000Z",
    tickers: ["ACME"],
    title: "Acme earnings",
  };
  const source = {
    id: "massive:article-1",
    layer: "massive",
    publishedUtc: "2026-06-16T11:00:00.000Z",
    publisher: null,
    snippet: "Acme reported earnings.",
    title: "Acme earnings",
    url: "https://example.com/acme",
  };

  mocks.getTickerNews.mockResolvedValue([massiveArticle]);
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
      fullYearGuidance: { eps: null, revenue: null },
      headline: "ACME is gapping up on earnings.",
      nextQuarterGuidance: { eps: null, revenue: null },
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
        tickers: [{ previousCloseAt: "2026-06-15T20:00:00.000Z", symbol: "acme" }],
      }),
      method: "POST",
    }),
  );

  expect(response.status).toBe(200);
  expect(mocks.collectGapperNewsSources).toHaveBeenCalledWith(
    expect.objectContaining({
      massiveNews: [massiveArticle],
      previousCloseAt: "2026-06-15T20:00:00.000Z",
      symbol: "ACME",
    }),
  );
  expect(mocks.batchSummarizeGapperNews).toHaveBeenCalledWith(
    expect.objectContaining({
      requests: [
        {
          previousCloseAt: "2026-06-15T20:00:00.000Z",
          sourceLayer: "massive",
          sources: [source],
          symbol: "ACME",
        },
      ],
    }),
  );
});
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```powershell
npm test -- src/app/api/gappers/news-summaries/route.test.ts
```

Expected: FAIL because route does not call `collectGapperNewsSources`.

- [ ] **Step 3: Implement route integration**

Import source helpers and config helpers in `route.ts`, create optional providers, and replace the old request construction with:

```ts
const requests = await Promise.all(
  tickers.map(async (ticker) => {
    const symbol = ticker.symbol.toUpperCase();
    const massiveNews = await massive.getTickerNews({
      publishedAfter: ticker.previousCloseAt,
      ticker: symbol,
    });
    const collected = await collectGapperNewsSources({
      massiveNews,
      previousCloseAt: ticker.previousCloseAt,
      symbol,
      webProvider,
      xProvider,
    });

    return {
      previousCloseAt: ticker.previousCloseAt,
      sourceLayer: collected.layer,
      sources: collected.sources,
      symbol,
    };
  }),
);
```

- [ ] **Step 4: Run route tests to verify pass**

Run:

```powershell
npm test -- src/app/api/gappers/news-summaries/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/app/api/gappers/news-summaries/route.ts src/app/api/gappers/news-summaries/route.test.ts
git commit -m "Use source cascade for gapper news API"
```

## Task 5: Client Result Types And Cache

**Files:**
- Modify: `src/lib/market-data/gappers-client.ts`
- Test: `src/lib/market-data/gappers-client.test.ts`

- [ ] **Step 1: Write failing structured cache test**

Add this test in `src/lib/market-data/gappers-client.test.ts`:

```ts
it("restores structured summary results for matching request/provider/model", () => {
  const storage = new MemoryStorage();
  const requests = [{ previousCloseAt: "2026-06-15T20:00:00.000Z", symbol: "ACME" }];
  const results = [structuredResult()];

  saveGappersSummaryResults({
    model: "gpt-4o-mini",
    now: 1000,
    provider: "openai",
    requests,
    results,
    storage,
  });

  expect(
    getCachedGappersSummaryResults({
      maxAgeMs: 60_000,
      model: "gpt-4o-mini",
      now: 2000,
      provider: "openai",
      requests,
      storage,
    }),
  ).toEqual({ cachedResults: results, missingRequests: [] });
});
```

Add helper:

```ts
function structuredResult(): Extract<GappersNewsSummaryResult, { status: "success" }> {
  return {
    catalysts: [{ summary: "Moving with NVDA earnings.", type: "Sympathy" }],
    confidence: "medium",
    earnings: {
      adjustedEps: { actual: null, estimate: null, priorYear: null },
      revenue: { actual: null, estimate: null, priorYear: null },
    },
    fullYearGuidance: { eps: null, revenue: null },
    headline: "ACME is gapping up with AI peers.",
    nextQuarterGuidance: { eps: null, revenue: null },
    notableNews: [],
    sourceLayer: "web",
    sources: [
      {
        id: "web:1",
        layer: "web",
        publishedUtc: null,
        publisher: "Example",
        snippet: "AI peers are moving.",
        title: "AI peers rally",
        url: "https://example.com/ai",
      },
    ],
    status: "success",
    symbol: "ACME",
  };
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
npm test -- src/lib/market-data/gappers-client.test.ts
```

Expected: FAIL on old `GappersNewsSummaryResult` type.

- [ ] **Step 3: Update result types**

Replace `GappersNewsSummaryResult` in `src/lib/market-data/gappers-client.ts` with:

```ts
export type GappersNewsSummarySource = {
  id: string;
  layer: "massive" | "web" | "x";
  publishedUtc: string | null;
  publisher: string | null;
  snippet: string | null;
  title: string;
  url: string | null;
};

export type GappersNewsSummaryMetric = {
  actual: number | null;
  estimate: number | null;
  priorYear: number | null;
};

export type GappersNewsSummaryResult =
  | {
      catalysts: Array<{ summary: string; type: string }>;
      confidence: "high" | "low" | "medium";
      earnings: {
        adjustedEps: GappersNewsSummaryMetric;
        revenue: GappersNewsSummaryMetric;
      };
      fullYearGuidance: { eps: string | null; revenue: string | null };
      headline: string;
      nextQuarterGuidance: { eps: string | null; revenue: string | null };
      notableNews: string[];
      sourceLayer: "massive" | "web" | "x";
      sources: GappersNewsSummarySource[];
      status: "success";
      symbol: string;
    }
  | { message: string; sourceLayer: "none"; status: "no_news"; symbol: string }
  | {
      error: string;
      sourceLayer: "massive" | "none" | "web" | "x";
      status: "error";
      symbol: string;
    };
```

- [ ] **Step 4: Add display helper test and implementation**

Add test:

```ts
it("hides earnings when every earnings and guidance field is empty", () => {
  expect(hasGappersSummaryEarningsOrGuidance(structuredResult())).toBe(false);
});

it("shows earnings when an EPS, revenue, or guidance field is present", () => {
  expect(
    hasGappersSummaryEarningsOrGuidance({
      ...structuredResult(),
      earnings: {
        adjustedEps: { actual: 1.2, estimate: 1.1, priorYear: 0.9 },
        revenue: { actual: null, estimate: null, priorYear: null },
      },
    }),
  ).toBe(true);
});
```

Add implementation:

```ts
export function hasGappersSummaryEarningsOrGuidance(
  result: Extract<GappersNewsSummaryResult, { status: "success" }>,
) {
  return [
    result.earnings.adjustedEps.actual,
    result.earnings.adjustedEps.estimate,
    result.earnings.adjustedEps.priorYear,
    result.earnings.revenue.actual,
    result.earnings.revenue.estimate,
    result.earnings.revenue.priorYear,
    result.nextQuarterGuidance.eps,
    result.nextQuarterGuidance.revenue,
    result.fullYearGuidance.eps,
    result.fullYearGuidance.revenue,
  ].some((value) => value != null && value !== "");
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```powershell
npm test -- src/lib/market-data/gappers-client.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/lib/market-data/gappers-client.ts src/lib/market-data/gappers-client.test.ts
git commit -m "Support structured cached gapper summaries"
```

## Task 6: Compact Summary UI

**Files:**
- Modify: `src/components/gappers-table.tsx`
- Test: `src/lib/market-data/gappers-client.test.ts`

- [ ] **Step 1: Update imports**

In `src/components/gappers-table.tsx`, import the display helper:

```ts
import {
  buildGappersSummaryRequests,
  filterGappersRows,
  getCachedGappersSummaryResults,
  getLastGappersSummaryResults,
  hasGappersSummaryEarningsOrGuidance,
  saveGappersSummaryResults,
  saveLastGappersSummaryResults,
  serializeGappersFiltersSearchParams,
  type GappersFilters,
  type GappersNewsSummaryResult,
} from "@/lib/market-data/gappers-client";
```

- [ ] **Step 2: Replace successful `<pre>` rendering**

Replace the existing success `<pre>` block with:

```tsx
{result.status === "success" ? (
  <div className="grid gap-3">
    <p className="text-sm font-medium leading-6 text-zinc-100">
      {result.headline}
    </p>
    {result.catalysts.length > 0 ? (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Catalysts
        </h3>
        <ul className="mt-2 grid gap-1 text-sm text-zinc-300">
          {result.catalysts.map((catalyst) => (
            <li key={`${result.symbol}-${catalyst.type}-${catalyst.summary}`}>
              <span className="text-zinc-100">{catalyst.type}:</span>{" "}
              {catalyst.summary}
            </li>
          ))}
        </ul>
      </div>
    ) : null}
    {hasGappersSummaryEarningsOrGuidance(result) ? (
      <SummaryEarningsBlock result={result} />
    ) : null}
    {result.sources.length > 0 ? <SummarySources sources={result.sources} /> : null}
  </div>
) : result.status === "no_news" ? (
  <p className="text-sm text-zinc-400">{result.message}</p>
) : (
  <p className="text-sm text-rose-200">{result.error}</p>
)}
```

- [ ] **Step 3: Add helper components and formatters**

Add below `Toggle`:

```tsx
function SummarySources({
  sources,
}: {
  sources: Extract<GappersNewsSummaryResult, { status: "success" }>["sources"];
}) {
  return (
    <div className="border-t border-white/10 pt-3 text-xs leading-5 text-zinc-500">
      {sources.map((source) => (
        <div key={source.id}>
          {source.url ? (
            <a className="hover:text-zinc-300" href={source.url} rel="noreferrer" target="_blank">
              {source.publisher ? `${source.publisher}: ` : ""}
              {source.title}
            </a>
          ) : (
            <span>
              {source.publisher ? `${source.publisher}: ` : ""}
              {source.title}
            </span>
          )}
          {source.publishedUtc ? ` - ${formatDateTime(source.publishedUtc)}` : ""}
        </div>
      ))}
    </div>
  );
}

function SummaryEarningsBlock({
  result,
}: {
  result: Extract<GappersNewsSummaryResult, { status: "success" }>;
}) {
  const rows = [
    result.earnings.adjustedEps.actual != null
      ? `Adjusted EPS ${formatSummaryCurrency(result.earnings.adjustedEps.actual, 2)}`
      : null,
    result.earnings.revenue.actual != null
      ? `Revenue ${formatSummaryLargeCurrency(result.earnings.revenue.actual)}`
      : null,
    result.nextQuarterGuidance.eps
      ? `Next quarter EPS ${result.nextQuarterGuidance.eps}`
      : null,
    result.nextQuarterGuidance.revenue
      ? `Next quarter revenue ${result.nextQuarterGuidance.revenue}`
      : null,
    result.fullYearGuidance.eps
      ? `Full year EPS ${result.fullYearGuidance.eps}`
      : null,
    result.fullYearGuidance.revenue
      ? `Full year revenue ${result.fullYearGuidance.revenue}`
      : null,
  ].filter((row): row is string => row != null);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
        Earnings / Guidance
      </h3>
      <ul className="mt-2 grid gap-1 text-sm text-zinc-300">
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}

function formatSummaryCurrency(value: number, decimals: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
    style: "currency",
  }).format(value);
}

function formatSummaryLargeCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${trimSummaryNumber(value / 1_000_000_000)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${trimSummaryNumber(value / 1_000_000)}M`;
  }

  return formatSummaryCurrency(value, 0);
}

function trimSummaryNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
```

- [ ] **Step 4: Run targeted tests**

Run:

```powershell
npm test -- src/lib/market-data/gappers-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/components/gappers-table.tsx
git commit -m "Render compact gapper news cards"
```

## Task 7: Full Verification And PR

**Files:**
- All modified source and test files

- [ ] **Step 1: Run focused tests**

Run:

```powershell
npm test -- src/lib/env.test.ts src/lib/market-data/gapper-news-sources.test.ts src/lib/market-data/gapper-news-summary.test.ts src/lib/market-data/gappers-client.test.ts src/app/api/gappers/news-summaries/route.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full suite**

Run:

```powershell
npm run lint
npm test
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Start dev server for visual check**

Run:

```powershell
npm run dev
```

Expected: local Next.js server starts and prints a localhost URL.

- [ ] **Step 4: Browser verify `/gappers`**

Open the local `/gappers` route. If authentication redirects to `/login`, capture the login-safe state and note that authenticated card verification needs a signed-in browser session. If already authenticated, select a row, run summaries with configured keys if available, and capture `docs/screenshots/gapper-news-source-cascade.png`.

- [ ] **Step 5: Commit visual polish if verification required changes**

Run only when the browser check led to code changes:

```powershell
git add src/components/gappers-table.tsx src/lib/market-data/gappers-client.ts src/lib/market-data/gappers-client.test.ts
git commit -m "Polish gapper news source cascade"
```

- [ ] **Step 6: Push and open PR**

Run:

```powershell
$prBody = Join-Path $env:TEMP "gapper-news-source-cascade-pr.md"
@"
## Summary

- Adds Massive to web search to X fallback source cascade for gapper news summaries.
- Returns structured summary fields with headline, catalysts, source layer, confidence, earnings/guidance, and sources.
- Replaces wall-of-text summaries with compact cards and muted source links.

## Verification

- npm run lint
- npm test
- npm run build
- Browser verification: captured docs/screenshots/gapper-news-source-cascade.png, or login redirect noted when an authenticated session is unavailable.
"@ | Set-Content -Path $prBody
git push -u origin codex/gapper-news-source-cascade
gh pr create --draft --title "[codex] Add gapper news source cascade" --body-file $prBody
```

Expected: draft PR opens against `main`.

