import { ema, sma, vwap } from "./indicators";
import { getCachedOrFetchBars } from "./cache";
import type {
  IndicatorPoint,
  MarketDataProvider,
  MarketDataTimeframe,
  OhlcvBar,
} from "./types";

type ChartExplorerSearchParams = Record<string, string | string[] | undefined> | URLSearchParams;

export type ChartExplorerFilters = {
  symbol: string;
  from: string;
  to: string;
};

export type ChartExplorerTimeframe = "1d" | "1h" | "5m" | "1m";

export type ChartExplorerOverlay = {
  id: string;
  label: string;
  color: string;
  points: IndicatorPoint[];
};

export type ChartExplorerDataset = {
  id: ChartExplorerTimeframe;
  label: string;
  timeframe: ChartExplorerTimeframe;
  bars: OhlcvBar[];
  overlays: ChartExplorerOverlay[];
  startIndex: number;
  visibleBars: number;
};

export type ChartExplorerResult = {
  daily: ChartExplorerDataset | null;
  intraday: Record<Exclude<ChartExplorerTimeframe, "1d">, ChartExplorerDataset> | null;
  error: string | null;
};

export const INITIAL_VISIBLE_BARS = {
  "1d": 50,
  "1h": 70,
  "5m": 156,
  "1m": 390,
} as const;

const DAILY_PADDING_DAYS_BEFORE = 320;
const DAILY_PADDING_DAYS_AFTER = 70;

export function parseChartExplorerSearchParams(
  params: ChartExplorerSearchParams,
): ChartExplorerFilters {
  return {
    symbol: searchParamValue(params, "symbol")?.trim().toUpperCase() ?? "",
    from: searchParamValue(params, "from")?.trim() ?? "",
    to: searchParamValue(params, "to")?.trim() ?? "",
  };
}

export function serializeChartExplorerSearchParams(filters: ChartExplorerFilters) {
  const params = new URLSearchParams();

  params.set("symbol", filters.symbol.trim().toUpperCase());
  params.set("from", filters.from);
  params.set("to", filters.to);

  return params;
}

export function validateChartExplorerFilters(filters: ChartExplorerFilters) {
  if (!filters.symbol || !filters.from || !filters.to) {
    return "Enter a ticker, start date, and end date.";
  }
  if (!/^[A-Z0-9.:-]{1,15}$/.test(filters.symbol)) {
    return "Enter a valid ticker.";
  }
  if (!isDate(filters.from) || !isDate(filters.to)) {
    return "Enter valid start and end dates.";
  }
  if (filters.from > filters.to) {
    return "The start date must be on or before the end date.";
  }

  return null;
}

export async function getChartExplorerDatasets(input: {
  client: unknown;
  filters: ChartExplorerFilters;
  provider: MarketDataProvider | null;
}): Promise<ChartExplorerResult> {
  const validationError = validateChartExplorerFilters(input.filters);

  if (validationError) {
    return emptyResult(validationError);
  }
  if (!input.provider) {
    return emptyResult("Massive API key is not configured.");
  }
  if (!input.client) {
    return emptyResult("Supabase service role key is not configured.");
  }

  const { filters, provider } = input;
  const [dailyBars, hourlyBars, fiveMinuteBars, oneMinuteBars] = await Promise.all([
    getCachedOrFetchBars({
      client: input.client,
      provider,
      request: {
        symbol: filters.symbol,
        timeframe: "1d",
        from: addDays(filters.from, -DAILY_PADDING_DAYS_BEFORE),
        to: addDays(filters.to, DAILY_PADDING_DAYS_AFTER),
        adjusted: false,
      },
    }),
    getIntradayBars({ client: input.client, filters, provider }, "1h"),
    getIntradayBars({ client: input.client, filters, provider }, "5m"),
    getIntradayBars({ client: input.client, filters, provider }, "1m"),
  ]);

  return {
    daily: dataset({
      bars: dailyBars,
      filters,
      label: "Daily",
      timeframe: "1d",
      viewport: dailyViewport(dailyBars, filters.from, filters.to),
    }),
    intraday: {
      "1h": dataset({
        bars: filterRegularSessionBars(hourlyBars),
        filters,
        label: "1 hour",
        timeframe: "1h",
      }),
      "5m": dataset({
        bars: filterRegularSessionBars(fiveMinuteBars),
        filters,
        label: "5 minute",
        timeframe: "5m",
      }),
      "1m": dataset({
        bars: filterRegularSessionBars(oneMinuteBars),
        filters,
        label: "1 minute",
        timeframe: "1m",
      }),
    },
    error: null,
  };
}

export function filterRegularSessionBars(bars: OhlcvBar[]) {
  return bars.filter((bar) => {
    const values = dateTimeParts(bar.barStartAt);
    const time = `${values.hour}:${values.minute}`;

    return (
      values.weekday !== "Sat" &&
      values.weekday !== "Sun" &&
      time >= "09:30" &&
      time <= "16:00"
    );
  });
}

export function dailyViewport(bars: OhlcvBar[], from: string, to: string) {
  const selectedStartIndex = bars.findIndex((bar) => datePart(bar.barStartAt) >= from);
  const selectedEndIndex = bars.findLastIndex((bar) => datePart(bar.barStartAt) <= to);
  const visibleBars = Math.min(INITIAL_VISIBLE_BARS["1d"], bars.length);

  if (selectedStartIndex === -1 || selectedEndIndex < selectedStartIndex) {
    return { startIndex: 0, visibleBars };
  }

  const selectedCount = selectedEndIndex - selectedStartIndex + 1;
  const paddingBefore = Math.max(0, Math.floor((visibleBars - selectedCount) / 2));
  const startIndex = Math.max(0, selectedStartIndex - paddingBefore);

  return { startIndex, visibleBars: Math.min(visibleBars, bars.length - startIndex) };
}

export function chartExplorerOverlays(
  bars: OhlcvBar[],
  timeframe: ChartExplorerTimeframe,
): ChartExplorerOverlay[] {
  const closePoints = bars.map((bar) => ({ time: chartTime(bar, timeframe), close: bar.close }));

  if (timeframe === "1d") {
    return [
      { id: "sma10", label: "10 SMA", color: "#d946ef", points: sma(closePoints, 10) },
      { id: "sma20", label: "20 SMA", color: "#facc15", points: sma(closePoints, 20) },
      { id: "sma50", label: "50 SMA", color: "#ef4444", points: sma(closePoints, 50) },
      { id: "sma100", label: "100 SMA", color: "#22c55e", points: sma(closePoints, 100) },
      { id: "sma200", label: "200 SMA", color: "#3b82f6", points: sma(closePoints, 200) },
    ];
  }

  return [
    { id: "ema10", label: "10 EMA", color: "#d946ef", points: ema(closePoints, 10) },
    { id: "ema20", label: "20 EMA", color: "#facc15", points: ema(closePoints, 20) },
    { id: "ema65", label: "65 EMA", color: "#ffffff", points: ema(closePoints, 65) },
    {
      id: "vwap",
      label: "VWAP",
      color: "#f97316",
      points: vwap(
        bars.map((bar) => ({
          time: chartTime(bar, timeframe),
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        })),
      ),
    },
  ];
}

function getIntradayBars(
  input: { client: unknown; filters: ChartExplorerFilters; provider: MarketDataProvider },
  timeframe: Exclude<MarketDataTimeframe, "1d" | "1w">,
) {
  return getCachedOrFetchBars({
    client: input.client,
    provider: input.provider,
    request: {
      symbol: input.filters.symbol,
      timeframe,
      from: input.filters.from,
      to: input.filters.to,
      adjusted: false,
    },
  });
}

function dataset(input: {
  bars: OhlcvBar[];
  filters: ChartExplorerFilters;
  label: string;
  timeframe: ChartExplorerTimeframe;
  viewport?: { startIndex: number; visibleBars: number };
}): ChartExplorerDataset {
  const firstSelectedBar = input.bars.findIndex((bar) => datePart(bar.barStartAt) >= input.filters.from);
  const viewport = input.viewport ?? {
    startIndex: Math.max(0, firstSelectedBar),
    visibleBars: Math.min(INITIAL_VISIBLE_BARS[input.timeframe], input.bars.length),
  };

  return {
    id: input.timeframe,
    label: input.label,
    timeframe: input.timeframe,
    bars: input.bars,
    overlays: chartExplorerOverlays(input.bars, input.timeframe),
    ...viewport,
  };
}

function emptyResult(error: string): ChartExplorerResult {
  return { daily: null, intraday: null, error };
}

function searchParamValue(params: ChartExplorerSearchParams, key: string) {
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? undefined;
  }

  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function dateTimeParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "America/New_York",
    weekday: "short",
  }).formatToParts(new Date(value));

  return Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue])) as Record<
    string,
    string
  >;
}

function chartTime(bar: OhlcvBar, timeframe: ChartExplorerTimeframe) {
  return timeframe === "1d" ? datePart(bar.barStartAt) : bar.barStartAt;
}

function datePart(value: string) {
  return value.slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}
