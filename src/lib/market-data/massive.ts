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

const TIMEFRAME_PATH: Record<MarketDataTimeframe, { multiplier: number; timespan: string }> = {
  "1d": { multiplier: 1, timespan: "day" },
  "1w": { multiplier: 1, timespan: "week" },
  "5m": { multiplier: 5, timespan: "minute" },
  "1h": { multiplier: 1, timespan: "hour" },
};

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
    const response = await this.fetcher(this.buildAggregateUrl(request));

    if (!response.ok) {
      throw new Error(`Massive aggregate request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { results?: unknown[] };
    const results = Array.isArray(payload.results) ? payload.results : [];

    return results.map((result) => normalizeAggregate(result, request));
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
