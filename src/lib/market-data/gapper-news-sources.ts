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
                    "Prefer direct company news, then peer, sector, or macro context explaining today's move.",
                    "Return concise source findings.",
                  ].join("\n"),
                  type: "input_text",
                },
              ],
              role: "user",
            },
          ],
          model: "gpt-4o-mini",
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

function normalizeOpenAiWebSearchPayload(
  payload: unknown,
): NormalizedGapperNewsSource[] {
  const row = payload as {
    output?: Array<{
      content?: Array<{
        annotations?: Array<{ title?: string; url?: string }>;
        text?: string;
      }>;
    }>;
  };
  const content = row.output?.flatMap((item) => item.content ?? []) ?? [];
  const snippetsByUrl = new Map<string, string>();

  for (const item of content) {
    if (!item.text) {
      continue;
    }

    for (const annotation of item.annotations ?? []) {
      if (annotation.url) {
        snippetsByUrl.set(annotation.url, item.text);
      }
    }
  }

  return content
    .flatMap((item) => item.annotations ?? [])
    .filter((annotation) => annotation.url && annotation.title)
    .map((annotation, index) => ({
      id: `web:${index}:${annotation.url}`,
      layer: "web" as const,
      publishedUtc: null,
      publisher: publisherFromUrl(annotation.url ?? null),
      snippet: annotation.url ? snippetsByUrl.get(annotation.url) ?? null : null,
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
