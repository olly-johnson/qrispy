import type { MassiveNewsArticle } from "./massive";

export type GapperNewsSourceLayer =
  | "grok"
  | "marketaux"
  | "massive"
  | "none"
  | "web"
  | "x";

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

type OpenAiWebNewsSource = {
  publishedUtc: string;
  summary: string;
  title: string;
  url: string;
};

type MarketauxNewsArticle = {
  description?: string | null;
  entities?: Array<{
    highlights?: Array<{
      highlight?: string;
      highlighted_in?: string;
      sentiment?: number;
    }>;
    match_score?: number;
    symbol?: string;
  }>;
  published_at?: string;
  source?: string | null;
  title?: string;
  url?: string;
  uuid?: string;
};

type GrokNewsSource = {
  publishedUtc: string;
  publisher?: string | null;
  summary: string;
  title: string;
  url: string;
};

export async function collectGapperNewsSources({
  grokProvider,
  massiveNews,
  marketauxProvider,
  previousCloseAt,
  symbol,
  webProvider,
  xProvider,
}: {
  grokProvider?: NewsSourceProvider | null;
  massiveNews: MassiveNewsArticle[];
  marketauxProvider?: NewsSourceProvider | null;
  previousCloseAt: string;
  symbol: string;
  webProvider?: NewsSourceProvider | null;
  xProvider?: NewsSourceProvider | null;
}) {
  const massiveSources = massiveNews
    .filter((article) => isRelevantMassiveArticle(article, symbol))
    .map(normalizeMassiveArticle);

  if (massiveSources.length > 0) {
    return { layer: "massive" as const, sources: massiveSources };
  }

  const request = { previousCloseAt, symbol: symbol.toUpperCase() };
  const marketauxSources = marketauxProvider
    ? await marketauxProvider.search(request)
    : [];

  if (marketauxSources.length > 0) {
    return { layer: "marketaux" as const, sources: marketauxSources };
  }

  const webSources = webProvider ? await webProvider.search(request) : [];

  if (webSources.length > 0) {
    return { layer: "web" as const, sources: webSources };
  }

  const grokSources = grokProvider
    ? await searchOptionalSources(grokProvider, request)
    : [];

  if (grokSources.length > 0) {
    return { layer: "grok" as const, sources: grokSources };
  }

  const xSources = xProvider
    ? await searchOptionalSources(xProvider, request)
    : [];

  if (xSources.length > 0) {
    return { layer: "x" as const, sources: xSources };
  }

  return { layer: "none" as const, sources: [] };
}

async function searchOptionalSources(
  provider: NewsSourceProvider,
  request: GapperNewsSourceSearchRequest,
) {
  try {
    return await provider.search(request);
  } catch {
    return [];
  }
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
                    `Find web/news context explaining why ${request.symbol} is moving today.`,
                    `Only include sources published on or after ${request.previousCloseAt}.`,
                    "For every source, use the publication timestamp stated by the source and return it in UTC ISO 8601 format.",
                    "Exclude sources without a verifiable publication timestamp.",
                    "Exclude earnings calendars, quote pages, company background pages, and prior earnings coverage.",
                    "Prefer direct company news, then peer, sector, or macro context explaining today's move.",
                    "Return an empty sources array when no source qualifies.",
                  ].join("\n"),
                  type: "input_text",
                },
              ],
              role: "user",
            },
          ],
          model: "gpt-4o-mini",
          text: {
            format: {
              name: "gapper_web_news_sources",
              schema: WEB_NEWS_SOURCE_SCHEMA,
              strict: true,
              type: "json_schema",
            },
          },
          tools: [{ type: "web_search" }],
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

      return normalizeOpenAiWebSearchPayload(
        await response.json(),
        request.previousCloseAt,
      );
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
      url.searchParams.set(
        "query",
        `$${request.symbol} stock why up today -is:retweet`,
      );
      url.searchParams.set("max_results", "10");
      url.searchParams.set("start_time", request.previousCloseAt);
      url.searchParams.set("tweet.fields", "created_at,author_id");

      const response = await fetcher(url.toString(), {
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      if (!response.ok) {
        throw new Error(`X news search request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        data?: Array<{
          author_id?: string;
          created_at?: string;
          id?: string;
          text?: string;
        }>;
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

export function createMarketauxNewsSearchProvider({
  apiKey,
  baseUrl = "https://api.marketaux.com/v1",
  fetcher = fetch,
}: {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
}): NewsSourceProvider {
  return {
    async search(request) {
      const url = new URL(`${baseUrl.replace(/\/$/, "")}/news/all`);
      url.searchParams.set("api_token", apiKey);
      url.searchParams.set("symbols", request.symbol);
      url.searchParams.set("published_after", request.previousCloseAt);
      url.searchParams.set("filter_entities", "true");
      url.searchParams.set("must_have_entities", "true");
      url.searchParams.set("language", "en");
      url.searchParams.set("limit", "10");

      const response = await fetcher(url.toString());

      if (!response.ok) {
        throw new Error(`Marketaux news request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        data?: MarketauxNewsArticle[];
      };

      return normalizeMarketauxPayload(
        payload.data ?? [],
        request.previousCloseAt,
        request.symbol,
      );
    },
  };
}

export function createGrokNewsSearchProvider({
  apiKey,
  baseUrl = "https://api.x.ai/v1",
  fetcher = fetch,
  model = "grok-4.3",
}: {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  model?: string;
}): NewsSourceProvider {
  return {
    async search(request) {
      const response = await fetcher(`${baseUrl.replace(/\/$/, "")}/responses`, {
        body: JSON.stringify({
          input: [
            {
              content: [
                {
                  text: [
                    `Find current X/social context explaining why ${request.symbol} is moving today.`,
                    `Only include posts or sources published on or after ${request.previousCloseAt}.`,
                    "Prefer credible market-news accounts, company accounts, journalists, or posts linking to credible sources.",
                    "Return strict JSON only with this shape: {\"sources\":[{\"publishedUtc\":\"ISO timestamp\",\"publisher\":\"source or handle\",\"summary\":\"short summary\",\"title\":\"source title or handle\",\"url\":\"source URL\"}]}",
                    "Return an empty sources array when no source qualifies.",
                  ].join("\n"),
                  type: "input_text",
                },
              ],
              role: "user",
            },
          ],
          model,
          tools: [
            {
              from_date: dateOnly(request.previousCloseAt),
              type: "x_search",
            },
          ],
        }),
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(`Grok news search request failed with ${response.status}`);
      }

      return normalizeGrokSearchPayload(
        await response.json(),
        request.previousCloseAt,
      );
    },
  };
}

function isRelevantMassiveArticle(article: MassiveNewsArticle, symbol: string) {
  const normalizedSymbol = symbol.toUpperCase();
  const text = `${article.title} ${article.description ?? ""}`;
  const mentionsSymbol = new RegExp(`\\$?\\b${escapeRegExp(normalizedSymbol)}\\b`, "i").test(
    text,
  );
  const isSingleTicker = article.tickers.length <= 1;

  if (isSingleTicker || mentionsSymbol) {
    return true;
  }

  return !isBroadMarketArticle(text);
}

function isBroadMarketArticle(text: string) {
  return /\b(etf|s&p 500|stock market today|market today|better buy|buy right now|trillion-dollar|market size|research by|back half|unstoppable)\b/i.test(
    text,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOpenAiWebSearchPayload(
  payload: unknown,
  previousCloseAt: string,
): NormalizedGapperNewsSource[] {
  const outputText = extractOpenAiResponseText(payload);

  if (!outputText) {
    throw new Error("OpenAI web search response did not include text output");
  }

  let parsed: { sources?: OpenAiWebNewsSource[] };
  try {
    parsed = JSON.parse(outputText) as { sources?: OpenAiWebNewsSource[] };
  } catch {
    throw new Error("OpenAI web search response did not include valid JSON");
  }

  if (!Array.isArray(parsed.sources)) {
    throw new Error("OpenAI web search response did not include sources");
  }

  const cutoff = new Date(previousCloseAt).getTime();
  if (!Number.isFinite(cutoff)) {
    throw new Error("Gapper previous close cutoff is invalid");
  }

  return parsed.sources
    .filter((source) => isWebSourceFresh(source, cutoff))
    .map((source, index) => ({
      id: `web:${index}:${source.url}`,
      layer: "web" as const,
      publishedUtc: source.publishedUtc,
      publisher: publisherFromUrl(source.url),
      snippet: source.summary,
      title: source.title,
      url: source.url,
    }));
}

function normalizeMarketauxPayload(
  articles: MarketauxNewsArticle[],
  previousCloseAt: string,
  symbol: string,
): NormalizedGapperNewsSource[] {
  const cutoff = cutoffTime(previousCloseAt);
  const normalizedSymbol = symbol.toUpperCase();

  return articles
    .filter((article) => {
      const publishedAt = new Date(article.published_at ?? "").getTime();
      const hasMatchingEntity = (article.entities ?? []).some(
        (entity) => entity.symbol?.toUpperCase() === normalizedSymbol,
      );

      return Number.isFinite(publishedAt) && publishedAt >= cutoff && hasMatchingEntity;
    })
    .map((article, index) => ({
      id: `marketaux:${article.uuid ?? article.url ?? index}`,
      layer: "marketaux" as const,
      publishedUtc: article.published_at ?? null,
      publisher: article.source ?? publisherFromUrl(article.url ?? null),
      snippet: marketauxSnippet(article),
      title: article.title ?? "Marketaux news",
      url: article.url ?? null,
    }));
}

function normalizeGrokSearchPayload(
  payload: unknown,
  previousCloseAt: string,
): NormalizedGapperNewsSource[] {
  const outputText = extractOpenAiResponseText(payload);

  if (!outputText) {
    throw new Error("Grok news search response did not include text output");
  }

  let parsed: { sources?: GrokNewsSource[] };
  try {
    parsed = JSON.parse(outputText) as { sources?: GrokNewsSource[] };
  } catch {
    throw new Error("Grok news search response did not include valid JSON");
  }

  if (!Array.isArray(parsed.sources)) {
    throw new Error("Grok news search response did not include sources");
  }

  const cutoff = cutoffTime(previousCloseAt);

  return parsed.sources
    .filter((source) => isGrokSourceFresh(source, cutoff))
    .map((source, index) => ({
      id: `grok:${index}:${source.url}`,
      layer: "grok" as const,
      publishedUtc: source.publishedUtc,
      publisher: source.publisher ?? publisherFromUrl(source.url),
      snippet: source.summary,
      title: source.title,
      url: source.url,
    }));
}

function marketauxSnippet(article: MarketauxNewsArticle) {
  return (
    article.entities
      ?.flatMap((entity) => entity.highlights ?? [])
      .map((highlight) => highlight.highlight)
      .find((highlight): highlight is string => Boolean(highlight)) ??
    article.description ??
    null
  );
}

function isGrokSourceFresh(source: GrokNewsSource, cutoff: number) {
  if (
    typeof source.publishedUtc !== "string" ||
    typeof source.summary !== "string" ||
    typeof source.title !== "string" ||
    typeof source.url !== "string"
  ) {
    return false;
  }

  const publishedAt = new Date(source.publishedUtc).getTime();

  return Number.isFinite(publishedAt) && publishedAt >= cutoff;
}

function cutoffTime(previousCloseAt: string) {
  const cutoff = new Date(previousCloseAt).getTime();
  if (!Number.isFinite(cutoff)) {
    throw new Error("Gapper previous close cutoff is invalid");
  }

  return cutoff;
}

function isWebSourceFresh(source: OpenAiWebNewsSource, cutoff: number) {
  if (
    typeof source.publishedUtc !== "string" ||
    typeof source.summary !== "string" ||
    typeof source.title !== "string" ||
    typeof source.url !== "string"
  ) {
    return false;
  }

  const publishedAt = new Date(source.publishedUtc).getTime();

  return Number.isFinite(publishedAt) && publishedAt >= cutoff;
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

const WEB_NEWS_SOURCE_SCHEMA = {
  additionalProperties: false,
  properties: {
    sources: {
      items: {
        additionalProperties: false,
        properties: {
          publishedUtc: { type: "string" },
          summary: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
        },
        required: ["publishedUtc", "summary", "title", "url"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["sources"],
  type: "object",
};

function extractOpenAiResponseText(payload: unknown) {
  const row = payload as {
    output?: Array<{ content?: Array<{ text?: string }> }>;
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
