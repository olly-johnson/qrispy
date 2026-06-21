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

type CachedSummaryPayload = {
  result: GappersNewsSummaryResult;
  savedAt: number;
};
type LastSummaryResultsPayload = {
  results: GappersNewsSummaryResult[];
  savedAt: number;
};

const LAST_SUMMARY_RESULTS_KEY = "qrispy:gapper-news-summary:last-results";
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

function isUsEquityTradingDay(parts: EasternDateParts) {
  return isWeekday(parts) && !isUsEquityMarketHoliday(parts);
}

function isUsEquityMarketHoliday(parts: EasternDateParts) {
  return (
    isFixedHolidayObserved(parts, 1, 1) ||
    isNthWeekdayOfMonth(parts, 1, 1, 3) ||
    isNthWeekdayOfMonth(parts, 2, 1, 3) ||
    isSameEasternDate(parts, addEasternDays(easterSunday(parts.year), -2)) ||
    isLastWeekdayOfMonth(parts, 5, 1) ||
    isFixedHolidayObserved(parts, 6, 19) ||
    isFixedHolidayObserved(parts, 7, 4) ||
    isNthWeekdayOfMonth(parts, 9, 1, 1) ||
    isNthWeekdayOfMonth(parts, 11, 4, 4) ||
    isFixedHolidayObserved(parts, 12, 25)
  );
}

function isFixedHolidayObserved(
  parts: EasternDateParts,
  month: number,
  day: number,
) {
  return [parts.year - 1, parts.year, parts.year + 1].some((year) =>
    isSameEasternDate(parts, observedFixedHoliday(year, month, day)),
  );
}

function observedFixedHoliday(year: number, month: number, day: number) {
  const holiday = { day, month, year };
  const dayOfWeek = easternDayOfWeek(holiday);

  if (dayOfWeek === 6) {
    return addEasternDays(holiday, -1);
  }
  if (dayOfWeek === 0) {
    return addEasternDays(holiday, 1);
  }

  return holiday;
}

function isNthWeekdayOfMonth(
  parts: EasternDateParts,
  month: number,
  weekday: number,
  occurrence: number,
) {
  if (parts.month !== month || easternDayOfWeek(parts) !== weekday) {
    return false;
  }

  return Math.floor((parts.day - 1) / 7) + 1 === occurrence;
}

function isLastWeekdayOfMonth(
  parts: EasternDateParts,
  month: number,
  weekday: number,
) {
  if (parts.month !== month || easternDayOfWeek(parts) !== weekday) {
    return false;
  }

  const nextWeek = new Date(Date.UTC(parts.year, month - 1, parts.day + 7, 12));

  return easternDateParts(nextWeek).month !== month;
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return { day, month, year };
}

function addEasternDays(
  parts: Pick<EasternDateParts, "day" | "month" | "year">,
  days: number,
) {
  return easternDateParts(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12)),
  );
}

function isSameEasternDate(
  left: Pick<EasternDateParts, "day" | "month" | "year">,
  right: Pick<EasternDateParts, "day" | "month" | "year">,
) {
  return (
    left.day === right.day &&
    left.month === right.month &&
    left.year === right.year
  );
}

function isWeekday(parts: EasternDateParts) {
  const dayOfWeek = easternDayOfWeek(parts);

  return dayOfWeek >= 1 && dayOfWeek <= 5;
}

function easternDayOfWeek(
  parts: Pick<EasternDateParts, "day" | "month" | "year">,
) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12)).getUTCDay();
}

type EasternDateParts = ReturnType<typeof easternDateParts>;

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
