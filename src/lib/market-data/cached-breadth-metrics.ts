import type { HistoricalBreadthMetrics } from "./sector-breadth";

type CachedBreadthMetricsClient = {
  rpc(
    fn: "calculate_cached_breadth_metrics",
    args: {
      as_of_date: string;
      symbols: string[];
      today_down4: number;
      today_up4: number;
    },
  ): Promise<{
    data: Record<string, unknown> | Record<string, unknown>[] | null;
    error: unknown;
  }>;
};

const EMPTY_METRICS: HistoricalBreadthMetrics = {
  down13In34Days: null,
  historyEndDate: null,
  isStale: false,
  ratio10Day: null,
  ratio5Day: null,
  t2108: null,
  t2108Covered: 0,
  up13In34Days: null,
};

export async function readCachedBreadthMetrics(input: {
  asOfDate: string;
  client: unknown;
  symbols: string[];
  todayDown4Percent: number;
  todayUp4Percent: number;
}): Promise<HistoricalBreadthMetrics> {
  const client = input.client as CachedBreadthMetricsClient;
  const { data, error } = await client.rpc("calculate_cached_breadth_metrics", {
    as_of_date: input.asOfDate,
    symbols: uniqueSymbols(input.symbols),
    today_down4: input.todayDown4Percent,
    today_up4: input.todayUp4Percent,
  });

  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) {
    return EMPTY_METRICS;
  }

  const historyEndDate = dateStringOrNull(row.history_end_date);
  const isStale = row.is_stale === true || row.is_stale === "true";

  if (isStale) {
    return {
      ...EMPTY_METRICS,
      historyEndDate,
      isStale: true,
    };
  }

  return {
    down13In34Days: numberOrZero(row.down_13_in_34_days),
    historyEndDate,
    isStale: false,
    ratio10Day: numberOrNull(row.ratio_10_day),
    ratio5Day: numberOrNull(row.ratio_5_day),
    t2108: numberOrNull(row.t2108),
    t2108Covered: numberOrZero(row.t2108_covered),
    up13In34Days: numberOrZero(row.up_13_in_34_days),
  };
}

function uniqueSymbols(symbols: string[]) {
  return [...new Set(symbols.map((symbol) => symbol.toUpperCase()).filter(Boolean))];
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function numberOrZero(value: unknown) {
  return numberOrNull(value) ?? 0;
}

function dateStringOrNull(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.slice(0, 10);
}
