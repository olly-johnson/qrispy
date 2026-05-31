import type {
  MarketDataProvider,
  MarketDataRequest,
  OhlcvBar,
} from "./types";

type MarketDataCacheClient = {
  from(table: "ohlcv_bars"): {
    select(columns: "*"): {
      eq(column: "provider", value: string): {
        eq(column: "symbol", value: string): {
          eq(column: "timeframe", value: string): {
            eq(column: "adjusted", value: boolean): {
              gte(column: "bar_start_at", value: string): {
                lte(column: "bar_start_at", value: string): {
                  order(
                    column: "bar_start_at",
                    options: { ascending: boolean },
                  ): Promise<{
                    data: Record<string, unknown>[] | null;
                    error: unknown;
                  }>;
                };
              };
            };
          };
        };
      };
    };
    upsert(
      rows: Record<string, unknown>[],
      options: { onConflict: string },
    ): Promise<{ error: unknown }>;
  };
  from(table: "market_data_requests"): {
    insert(row: Record<string, unknown>): Promise<{ error: unknown }>;
  };
};

export async function getCachedOrFetchBars(input: {
  client: unknown;
  provider: MarketDataProvider;
  request: MarketDataRequest;
}) {
  const client = input.client as MarketDataCacheClient;
  const normalizedRequest = {
    ...input.request,
    symbol: input.request.symbol.toUpperCase(),
  };
  const cached = await readCachedBars({
    client,
    providerName: input.provider.name,
    request: normalizedRequest,
  });

  if (cached.length > 0 && cachedCoversRequest(cached, normalizedRequest)) {
    return cached;
  }

  try {
    const fetched = await input.provider.getAggregateBars(normalizedRequest);

    if (fetched.length > 0) {
      const upsertResult = await client.from("ohlcv_bars").upsert(
        fetched.map(storedBarFromOhlcvBar),
        { onConflict: "provider,symbol,timeframe,adjusted,bar_start_at" },
      );

      if (upsertResult.error) {
        throw upsertResult.error;
      }
    }

    await recordRequest({
      client,
      providerName: input.provider.name,
      request: normalizedRequest,
      status: "succeeded",
      barCount: fetched.length,
    });

    return fetched;
  } catch (error) {
    await recordRequest({
      client,
      providerName: input.provider.name,
      request: normalizedRequest,
      status: "failed",
      barCount: 0,
      error,
    });
    throw error;
  }
}

async function readCachedBars(input: {
  client: MarketDataCacheClient;
  providerName: string;
  request: MarketDataRequest;
}) {
  const { data, error } = await input.client
    .from("ohlcv_bars")
    .select("*")
    .eq("provider", input.providerName)
    .eq("symbol", input.request.symbol)
    .eq("timeframe", input.request.timeframe)
    .eq("adjusted", input.request.adjusted)
    .gte("bar_start_at", `${input.request.from}T00:00:00.000Z`)
    .lte("bar_start_at", `${input.request.to}T23:59:59.999Z`)
    .order("bar_start_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(ohlcvBarFromStoredBar);
}

function ohlcvBarFromStoredBar(row: Record<string, unknown>): OhlcvBar {
  return {
    provider: String(row.provider),
    symbol: String(row.symbol),
    timeframe: row.timeframe as OhlcvBar["timeframe"],
    barStartAt: String(row.bar_start_at),
    open: numberOrZero(row.open),
    high: numberOrZero(row.high),
    low: numberOrZero(row.low),
    close: numberOrZero(row.close),
    volume: numberOrZero(row.volume),
    adjusted: row.adjusted === true,
    rawPayload: row.raw_payload,
  };
}

function storedBarFromOhlcvBar(bar: OhlcvBar) {
  return {
    provider: bar.provider,
    symbol: bar.symbol,
    timeframe: bar.timeframe,
    bar_start_at: bar.barStartAt,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    adjusted: bar.adjusted,
    raw_payload: bar.rawPayload,
  };
}

function cachedCoversRequest(bars: OhlcvBar[], request: MarketDataRequest) {
  const first = bars[0];
  const last = bars[bars.length - 1];

  if (!first || !last) {
    return false;
  }

  const firstStart = Date.parse(first.barStartAt);
  const lastStart = Date.parse(last.barStartAt);
  const requestedStart = Date.parse(`${request.from}T00:00:00.000Z`);
  const requestedEnd = Date.parse(`${request.to}T23:59:59.999Z`);
  const tolerance = cacheCoverageToleranceMs(request.timeframe);

  return firstStart <= requestedStart + tolerance && lastStart >= requestedEnd - tolerance;
}

function cacheCoverageToleranceMs(timeframe: MarketDataRequest["timeframe"]) {
  if (timeframe === "1w") {
    return 8 * 24 * 60 * 60 * 1000;
  }
  if (timeframe === "1d") {
    return 4 * 24 * 60 * 60 * 1000;
  }

  return 24 * 60 * 60 * 1000;
}

async function recordRequest(input: {
  client: MarketDataCacheClient;
  providerName: string;
  request: MarketDataRequest;
  status: "succeeded" | "failed";
  barCount: number;
  error?: unknown;
}) {
  const result = await input.client.from("market_data_requests").insert({
    provider: input.providerName,
    symbol: input.request.symbol,
    timeframe: input.request.timeframe,
    adjusted: input.request.adjusted,
    requested_from: input.request.from,
    requested_to: input.request.to,
    status: input.status,
    error: input.error ? errorMessage(input.error) : null,
    bar_count: input.barCount,
  });

  if (result.error) {
    throw result.error;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function numberOrZero(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
