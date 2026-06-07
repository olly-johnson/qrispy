import type { GappersRow } from "./gappers";

export type GappersSummaryRequest = {
  previousCloseAt: string;
  symbol: string;
};

export type GappersNewsSummaryResult =
  | { rendered: string; status: "success"; symbol: string }
  | { message: string; status: "no_news"; symbol: string }
  | { error: string; status: "error"; symbol: string };

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

type SummaryStorage = Pick<Storage, "getItem" | "setItem">;

type CachedSummaryPayload = {
  result: GappersNewsSummaryResult;
  savedAt: number;
};
type LastSummaryResultsPayload = {
  results: GappersNewsSummaryResult[];
  savedAt: number;
};

const LAST_SUMMARY_RESULTS_KEY = "qrispy:gapper-news-summary:last-results";

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

    if (cached && now - cached.savedAt <= maxAgeMs) {
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
      now - parsed.savedAt > maxAgeMs
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

function buildGappersSummaryCacheKey({
  model,
  provider,
  request,
}: {
  model: string;
  provider: string;
  request: GappersSummaryRequest;
}) {
  return [
    "qrispy",
    "gapper-news-summary",
    provider,
    model,
    request.symbol,
    request.previousCloseAt,
  ].join(":");
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
