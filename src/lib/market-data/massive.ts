import type {
  MarketDataProvider,
  MarketDataRequest,
  MarketDataTimeframe,
  OhlcvBar,
} from "./types";
import { getMassiveConfig } from "@/lib/env";

type MassiveProviderOptions = {
  apiKey: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
};

export type MassiveReferenceTicker = {
  active?: boolean;
  locale?: string;
  market?: string;
  name?: string;
  primary_exchange?: string;
  ticker?: string;
  type?: string;
};

export type MassiveSnapshotTicker = Record<string, unknown> & {
  ticker?: string;
};

export type MassiveNewsArticle = {
  articleUrl: string | null;
  description: string | null;
  id: string;
  publishedUtc: string;
  tickers: string[];
  title: string;
};

export type MassiveTickerDetails = {
  active: boolean | null;
  name: string | null;
  sicCode: string | null;
  sicDescription: string | null;
  ticker: string;
};

const TIMEFRAME_PATH: Record<MarketDataTimeframe, { multiplier: number; timespan: string }> = {
  "1d": { multiplier: 1, timespan: "day" },
  "1w": { multiplier: 1, timespan: "week" },
  "1m": { multiplier: 1, timespan: "minute" },
  "5m": { multiplier: 5, timespan: "minute" },
  "1h": { multiplier: 1, timespan: "hour" },
};
const ACTIVE_TICKERS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FULL_MARKET_SNAPSHOT_CACHE_TTL_MS = 60 * 1000;
const activeTickerCache = new Map<
  string,
  { expiresAt: number; rows: MassiveReferenceTicker[] }
>();
const fullMarketSnapshotCache = new Map<
  string,
  { expiresAt: number; rows: MassiveSnapshotTicker[] }
>();

export class MassiveMarketDataProvider implements MarketDataProvider {
  readonly name = "massive";
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: MassiveProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://api.massive.com").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
  }

  async getAggregateBars(request: MarketDataRequest): Promise<OhlcvBar[]> {
    const response = await this.fetcher(this.buildAggregateUrl(request), {
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Massive aggregate request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { results?: unknown[] };
    const results = Array.isArray(payload.results) ? payload.results : [];

    return results.map((result) => normalizeAggregate(result, request));
  }

  async getActiveStockTickers(): Promise<MassiveReferenceTicker[]> {
    const url = new URL(`${this.baseUrl}/v3/reference/tickers`);
    url.searchParams.set("market", "stocks");
    url.searchParams.set("active", "true");
    url.searchParams.set("order", "asc");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("sort", "ticker");

    const cacheKey = `${this.baseUrl}:${this.apiKey}:active-stock-tickers`;
    const cached = activeTickerCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.rows;
    }

    const rows = await this.fetchPaginatedResults<MassiveReferenceTicker>(url);
    activeTickerCache.set(cacheKey, {
      expiresAt: Date.now() + ACTIVE_TICKERS_CACHE_TTL_MS,
      rows,
    });

    return rows;
  }

  async getFullMarketSnapshot(): Promise<MassiveSnapshotTicker[]> {
    const url = new URL(`${this.baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers`);
    url.searchParams.set("include_otc", "false");
    url.searchParams.set("apiKey", this.apiKey);
    const cacheKey = `${this.baseUrl}:${this.apiKey}:full-market-snapshot`;
    const cached = fullMarketSnapshotCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.rows;
    }

    const response = await this.fetcher(url.toString(), { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Massive full market snapshot request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { tickers?: unknown[] };

    const rows = Array.isArray(payload.tickers)
      ? (payload.tickers as MassiveSnapshotTicker[])
      : [];
    fullMarketSnapshotCache.set(cacheKey, {
      expiresAt: Date.now() + FULL_MARKET_SNAPSHOT_CACHE_TTL_MS,
      rows,
    });

    return rows;
  }

  async getTickerDetails(ticker: string): Promise<MassiveTickerDetails> {
    const symbol = ticker.toUpperCase();
    const url = new URL(`${this.baseUrl}/v3/reference/tickers/${symbol}`);
    url.searchParams.set("apiKey", this.apiKey);

    const response = await this.fetcher(url.toString(), { cache: "no-store" });

    if (!response.ok) {
      throw new Error(
        `Massive ticker details request failed with ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      results?: Record<string, unknown>;
    };
    const row = payload.results ?? {};

    return {
      active: typeof row.active === "boolean" ? row.active : null,
      name: typeof row.name === "string" ? row.name : null,
      sicCode: typeof row.sic_code === "string" ? row.sic_code : null,
      sicDescription:
        typeof row.sic_description === "string" ? row.sic_description : null,
      ticker: String(row.ticker ?? symbol).toUpperCase(),
    };
  }

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

    return results
      .map(normalizeNewsArticle)
      .filter((article) => article != null);
  }

  private buildAggregateUrl(request: MarketDataRequest) {
    const symbol = request.symbol.toUpperCase();
    const timeframe = TIMEFRAME_PATH[request.timeframe];
    const url = new URL(
      `${this.baseUrl}/v2/aggs/ticker/${symbol}/range/${timeframe.multiplier}/${timeframe.timespan}/${request.from}/${request.to}`,
    );

    url.searchParams.set("adjusted", String(request.adjusted));
    url.searchParams.set("sort", "asc");
    url.searchParams.set("limit", "50000");
    url.searchParams.set("apiKey", this.apiKey);

    return url.toString();
  }

  private async fetchPaginatedResults<T extends Record<string, unknown>>(url: URL): Promise<T[]> {
    const rows: T[] = [];
    let nextUrl: string | null = this.withApiKey(url).toString();

    while (nextUrl) {
      const response = await this.fetcher(nextUrl, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Massive reference request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        next_url?: string;
        results?: unknown[];
      };

      if (Array.isArray(payload.results)) {
        rows.push(...(payload.results as T[]));
      }

      nextUrl = payload.next_url
        ? this.withApiKey(new URL(payload.next_url)).toString()
        : null;
    }

    return rows;
  }

  private withApiKey(url: URL) {
    url.searchParams.set("apiKey", this.apiKey);

    return url;
  }
}

export function createMassiveMarketDataProvider() {
  const config = getMassiveConfig();

  if (!config) {
    return null;
  }

  return new MassiveMarketDataProvider(config);
}

function normalizeAggregate(result: unknown, request: MarketDataRequest): OhlcvBar {
  const row = result as Record<string, unknown>;

  return {
    provider: "massive",
    symbol: request.symbol.toUpperCase(),
    timeframe: request.timeframe,
    barStartAt: new Date(numberFrom(row.t) ?? 0).toISOString(),
    open: numberFrom(row.o) ?? 0,
    high: numberFrom(row.h) ?? 0,
    low: numberFrom(row.l) ?? 0,
    close: numberFrom(row.c) ?? 0,
    volume: numberFrom(row.v) ?? 0,
    adjusted: request.adjusted,
    rawPayload: result,
  };
}

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

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
