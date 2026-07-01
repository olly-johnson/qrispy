import type { GappersRow } from "./gappers";
import { isUsEquityTradingDay } from "./us-equity-calendar";

export type GappersSummaryRequest = {
  previousCloseAt: string;
  symbol: string;
};

export type GappersNewsSummaryResult =
  | {
      catalysts: Array<{
        sourceIds?: string[];
        summary: string;
        type: string;
      }>;
      confidence: "high" | "low" | "medium";
      earnings: {
        adjustedEps: GappersNewsSummaryMetric;
        revenue: GappersNewsSummaryMetric;
      };
      fullYearGuidance: GappersNewsSummaryGuidance;
      headline: string;
      nextQuarterGuidance: GappersNewsSummaryGuidance;
      notableNews: string[];
      sourceLayer: "grok" | "marketaux" | "massive" | "web" | "x";
      sources: GappersNewsSummarySource[];
      status: "success";
      symbol: string;
    }
  | { message: string; sourceLayer: "none"; status: "no_news"; symbol: string }
  | {
      error: string;
      sourceLayer: "grok" | "marketaux" | "massive" | "none" | "web" | "x";
      status: "error";
      symbol: string;
    };

export type GappersNewsSummarySource = {
  id: string;
  layer: "grok" | "marketaux" | "massive" | "web" | "x";
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

export type GappersNewsSummaryGuidance = {
  eps: GappersNewsSummaryGuidanceMetric;
  revenue: GappersNewsSummaryGuidanceMetric;
};

export type GappersNewsSummaryGuidanceMetric = {
  priorYear: number | null;
  value: number | null;
};

export type GappersFilters = {
  includeEtfs: boolean;
  includeStocks: boolean;
  minDollarVolume: number;
  minGapPercent: number;
  minPrice: number;
};

export const DEFAULT_GAPPERS_FILTERS: GappersFilters = {
  includeEtfs: true,
  includeStocks: true,
  minDollarVolume: 100_000,
  minGapPercent: 6,
  minPrice: 0.5,
};

type GappersSearchParams =
  | Record<string, string | string[] | undefined>
  | URLSearchParams;

export function parseGappersFiltersSearchParams(
  params: GappersSearchParams,
): GappersFilters {
  return {
    includeEtfs: booleanSearchParam(
      searchParamValue(params, "includeEtfs"),
      DEFAULT_GAPPERS_FILTERS.includeEtfs,
    ),
    includeStocks: booleanSearchParam(
      searchParamValue(params, "includeStocks"),
      DEFAULT_GAPPERS_FILTERS.includeStocks,
    ),
    minDollarVolume: numericSearchParam(
      searchParamValue(params, "minDollarVolume"),
      DEFAULT_GAPPERS_FILTERS.minDollarVolume,
    ),
    minGapPercent: numericSearchParam(
      searchParamValue(params, "minGapPercent"),
      DEFAULT_GAPPERS_FILTERS.minGapPercent,
    ),
    minPrice: numericSearchParam(
      searchParamValue(params, "minPrice"),
      DEFAULT_GAPPERS_FILTERS.minPrice,
    ),
  };
}

export function serializeGappersFiltersSearchParams(filters: GappersFilters) {
  const params = new URLSearchParams();

  params.set("minPrice", String(filters.minPrice));
  params.set("minGapPercent", String(filters.minGapPercent));
  params.set("minDollarVolume", String(filters.minDollarVolume));
  params.set("includeStocks", String(filters.includeStocks));
  params.set("includeEtfs", String(filters.includeEtfs));

  return params;
}

export function filterGappersRows(rows: GappersRow[], filters: GappersFilters) {
  return rows.filter((row) => {
    if (row.price <= filters.minPrice) {
      return false;
    }
    if (row.gapPercent < filters.minGapPercent) {
      return false;
    }
    if (row.activeDollarVolume < filters.minDollarVolume) {
      return false;
    }
    if (row.securityType === "ETF" && !filters.includeEtfs) {
      return false;
    }
    if (row.securityType === "Stock" && !filters.includeStocks) {
      return false;
    }

    return true;
  });
}

export function buildGappersSummaryRequests(
  rows: GappersRow[],
  selectedSymbols: Set<string>,
): GappersSummaryRequest[] {
  return rows
    .filter((row) => selectedSymbols.has(row.symbol))
    .map((row) => ({
      previousCloseAt: row.previousCloseAt,
      symbol: row.symbol,
    }));
}

function searchParamValue(params: GappersSearchParams, key: string) {
  if (params instanceof URLSearchParams) {
    return params.get(key) ?? undefined;
  }

  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}

function numericSearchParam(value: string | undefined, fallback: number) {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function booleanSearchParam(value: string | undefined, fallback: boolean) {
  if (value == null) {
    return fallback;
  }

  const normalized = value.toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return fallback;
}

type SummaryStorage = Pick<Storage, "getItem" | "setItem">;
type ClearableSummaryStorage = SummaryStorage &
  Pick<Storage, "key" | "length" | "removeItem">;

type CachedSummaryPayload = {
  result: GappersNewsSummaryResult;
  savedAt: number;
};
type LastSummaryResultsPayload = {
  results: GappersNewsSummaryResult[];
  savedAt: number;
};

const SUMMARY_CACHE_NAMESPACE = "qrispy:gapper-news-summary:";
const SUMMARY_CACHE_KEY_PREFIX = `${SUMMARY_CACHE_NAMESPACE}v5:`;
const LAST_SUMMARY_RESULTS_KEY = `${SUMMARY_CACHE_KEY_PREFIX}last-results`;
const EASTERN_TIME_ZONE = "America/New_York";

export function getCachedGappersSummaryResults({
  maxAgeMs,
  model,
  now = Date.now(),
  provider,
  requests,
  storage,
}: {
  maxAgeMs: number;
  model: string;
  now?: number;
  provider: string;
  requests: GappersSummaryRequest[];
  storage: SummaryStorage;
}) {
  const cachedResults: GappersNewsSummaryResult[] = [];
  const missingRequests: GappersSummaryRequest[] = [];

  for (const request of requests) {
    const cached = readCachedSummary({
      key: buildGappersSummaryCacheKey({ model, provider, request }),
      storage,
    });

    if (
      cached &&
      isGappersSummaryCacheFresh({
        maxAgeMs,
        now,
        savedAt: cached.savedAt,
      })
    ) {
      cachedResults.push(cached.result);
    } else {
      missingRequests.push(request);
    }
  }

  return { cachedResults, missingRequests };
}

export function saveGappersSummaryResults({
  model,
  now = Date.now(),
  provider,
  requests,
  results,
  storage,
}: {
  model: string;
  now?: number;
  provider: string;
  requests: GappersSummaryRequest[];
  results: GappersNewsSummaryResult[];
  storage: SummaryStorage;
}) {
  const requestBySymbol = new Map(
    requests.map((request) => [request.symbol, request]),
  );

  for (const result of results) {
    const request = requestBySymbol.get(result.symbol);

    if (!request) {
      continue;
    }

    storage.setItem(
      buildGappersSummaryCacheKey({ model, provider, request }),
      JSON.stringify({ result, savedAt: now }),
    );
  }
}

export function getLastGappersSummaryResults({
  maxAgeMs,
  now = Date.now(),
  storage,
}: {
  maxAgeMs: number;
  now?: number;
  storage: SummaryStorage;
}) {
  const value = storage.getItem(LAST_SUMMARY_RESULTS_KEY);

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as LastSummaryResultsPayload;

    if (
      !parsed ||
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.results) ||
      !isGappersSummaryCacheFresh({
        maxAgeMs,
        now,
        savedAt: parsed.savedAt,
      })
    ) {
      return [];
    }

    return parsed.results;
  } catch {
    return [];
  }
}

export function saveLastGappersSummaryResults({
  now = Date.now(),
  results,
  storage,
}: {
  now?: number;
  results: GappersNewsSummaryResult[];
  storage: SummaryStorage;
}) {
  storage.setItem(
    LAST_SUMMARY_RESULTS_KEY,
    JSON.stringify({ results, savedAt: now }),
  );
}

export function clearGappersNewsSummaryCache({
  storage,
}: {
  storage: ClearableSummaryStorage;
}) {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key != null)
    .filter((key) => key.startsWith(SUMMARY_CACHE_NAMESPACE));

  for (const key of keys) {
    storage.removeItem(key);
  }
}

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
    result.nextQuarterGuidance.eps.value,
    result.nextQuarterGuidance.eps.priorYear,
    result.nextQuarterGuidance.revenue.value,
    result.nextQuarterGuidance.revenue.priorYear,
    result.fullYearGuidance.eps.value,
    result.fullYearGuidance.eps.priorYear,
    result.fullYearGuidance.revenue.value,
    result.fullYearGuidance.revenue.priorYear,
  ].some((value) => value != null);
}

export function formatGappersSummaryEarningsLines(
  result: Extract<GappersNewsSummaryResult, { status: "success" }>,
) {
  return [
    `Adjusted EPS ${formatCurrencyOrNa(result.earnings.adjustedEps.actual, 2)} / YoY ${formatChangePercentOrNa(
      result.earnings.adjustedEps.actual,
      result.earnings.adjustedEps.priorYear,
      0,
    )} / Beat ${formatChangePercentOrNa(
      result.earnings.adjustedEps.actual,
      result.earnings.adjustedEps.estimate,
      1,
    )}`,
    `Rev ${formatLargeCurrencyOrNa(result.earnings.revenue.actual)} / YoY ${formatChangePercentOrNa(
      result.earnings.revenue.actual,
      result.earnings.revenue.priorYear,
      0,
    )} / Beat ${formatChangePercentOrNa(
      result.earnings.revenue.actual,
      result.earnings.revenue.estimate,
      1,
    )}`,
    `Guidance Next Quarter: EPS ${formatGuidanceYoY(result.nextQuarterGuidance.eps)} / Rev ${formatGuidanceYoY(
      result.nextQuarterGuidance.revenue,
    )}`,
    `Full Year Guidance: ${formatGuidanceYoY(result.fullYearGuidance.eps)} / ${formatGuidanceYoY(
      result.fullYearGuidance.revenue,
    )}`,
  ];
}

function buildGappersSummaryCacheKey({
  model,
  provider,
  request,
}: {
  model: string;
  provider: string;
  request: GappersSummaryRequest;
}) {
  return `${SUMMARY_CACHE_KEY_PREFIX}${provider}:${model}:${request.symbol}:${request.previousCloseAt}`;
}

function readCachedSummary({
  key,
  storage,
}: {
  key: string;
  storage: SummaryStorage;
}): CachedSummaryPayload | null {
  const value = storage.getItem(key);

  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as CachedSummaryPayload;

    if (!parsed || typeof parsed.savedAt !== "number" || !parsed.result) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isGappersSummaryCacheFresh({
  maxAgeMs,
  now,
  savedAt,
}: {
  maxAgeMs: number;
  now: number;
  savedAt: number;
}) {
  if (now - savedAt > maxAgeMs) {
    return false;
  }

  return !hasTradingDayPremarketOpenBetween(savedAt, now);
}

function formatCurrencyOrNa(value: number | null, decimals: number) {
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

function formatLargeCurrencyOrNa(value: number | null) {
  if (value == null) {
    return "NA";
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${trimSummaryNumber(value / 1_000_000_000)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${trimSummaryNumber(value / 1_000_000)}M`;
  }

  return formatCurrencyOrNa(value, 0);
}

function formatChangePercentOrNa(
  actual: number | null,
  baseline: number | null,
  decimals: number,
) {
  const changePercent = calculateChangePercent(actual, baseline);

  if (changePercent == null) {
    return "NA";
  }

  return `${formatPercentNumber(changePercent, decimals)}%`;
}

function formatGuidanceYoY(metric: GappersNewsSummaryGuidanceMetric) {
  const changePercent = calculateChangePercent(metric.value, metric.priorYear);

  if (changePercent == null) {
    return "NA";
  }

  return `${formatPercentNumber(changePercent, 0)}% YoY`;
}

function calculateChangePercent(
  actual: number | null,
  baseline: number | null,
) {
  if (actual == null || baseline == null || baseline === 0) {
    return null;
  }

  return ((actual - baseline) / Math.abs(baseline)) * 100;
}

function formatPercentNumber(value: number, decimals: number) {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
    useGrouping: false,
  }).format(rounded);
}

function trimSummaryNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}

function hasTradingDayPremarketOpenBetween(savedAt: number, now: number) {
  if (now <= savedAt) {
    return false;
  }

  const savedParts = easternDateParts(new Date(savedAt));
  const nowParts = easternDateParts(new Date(now));
  const cursor = new Date(
    Date.UTC(savedParts.year, savedParts.month - 1, savedParts.day, 12),
  );
  const endTime = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day, 12);

  while (cursor.getTime() <= endTime) {
    const parts = easternDateParts(cursor);

    if (isUsEquityTradingDay(parts)) {
      const premarketOpen = easternDateTimeToUtc(
        parts.year,
        parts.month,
        parts.day,
        4,
        0,
      ).getTime();

      if (premarketOpen > savedAt && premarketOpen <= now) {
        return true;
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return false;
}

function easternDateParts(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(value).map((part) => [part.type, part.value]),
  );

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: Number(parts.year),
  };
}

function easternDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  for (let index = 0; index < 3; index += 1) {
    const parts = easternDateParts(candidate);
    const deltaMinutes =
      (Date.UTC(year, month - 1, day, hour, minute) -
        Date.UTC(
          parts.year,
          parts.month - 1,
          parts.day,
          parts.hour,
          parts.minute,
        )) /
      60_000;

    candidate = new Date(candidate.getTime() + deltaMinutes * 60_000);
  }

  return candidate;
}
