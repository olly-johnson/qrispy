import type {
  MassiveReferenceTicker,
  MassiveSnapshotTicker,
} from "./massive";
import {
  buildCommonStockUniverse,
  normalizeMarketSnapshotTicker,
} from "./market-universe";
import { isUsEquityTradingDay } from "./us-equity-calendar";
import type { MarketDataRequest, OhlcvBar } from "./types";

export type GappersMode = "extended" | "regular";
export type GappersSecurityType = "ETF" | "Stock";

export type GappersRow = {
  activeDollarVolume: number;
  activeVolume: number;
  gapPercent: number;
  lastUpdatedAt: string | null;
  name: string;
  previousClose: number;
  previousCloseAt: string;
  price: number;
  securityType: GappersSecurityType;
  symbol: string;
};

export type GappersSnapshot = {
  error: string | null;
  loadedAt: string;
  mode: GappersMode;
  rows: GappersRow[];
};

export type GappersSnapshotFilters = {
  minGapPercent?: number;
  minPrice?: number;
};

export type GappersDataProvider = {
  getActiveStockTickers(): Promise<MassiveReferenceTicker[]>;
  getAggregateBars(request: MarketDataRequest): Promise<OhlcvBar[]>;
  getFullMarketSnapshot(): Promise<MassiveSnapshotTicker[]>;
};

type ExtendedHoursWindow = {
  from: Date;
  to: Date;
};

const EASTERN_TIME_ZONE = "America/New_York";
const MIN_SERVER_PRICE = 0.5;
const MIN_SERVER_GAP_PERCENT = 6;

export async function buildGappersSnapshot({
  filters,
  now = new Date(),
  provider,
}: {
  filters?: GappersSnapshotFilters;
  now?: Date;
  provider: GappersDataProvider | null;
}): Promise<GappersSnapshot> {
  const mode = getGappersMode(now);
  const loadedAt = now.toISOString();
  const previousCloseAt = getPreviousRegularCloseAt(now).toISOString();
  const minGapPercent = filters?.minGapPercent ?? MIN_SERVER_GAP_PERCENT;
  const minPrice = filters?.minPrice ?? MIN_SERVER_PRICE;

  if (!provider) {
    return {
      error: "Massive API key is not configured.",
      loadedAt,
      mode,
      rows: [],
    };
  }

  try {
    const usePreviousSessionVolumeFallback = !isRegularMarketOpen(now);
    const [references, snapshots] = await Promise.all([
      provider.getActiveStockTickers(),
      provider.getFullMarketSnapshot(),
    ]);
    const universe = buildUniverse(references);
    const candidates = snapshots
      .map((snapshot) =>
        normalizeCandidate(
          snapshot,
          universe.get(String(snapshot.ticker ?? "").toUpperCase()),
          { usePreviousSessionVolumeFallback },
        ),
      )
      .filter((row): row is Omit<GappersRow, "previousCloseAt"> => row != null)
      .map((row) => ({ ...row, previousCloseAt }))
      .filter((row) => row.price > minPrice && row.gapPercent >= minGapPercent);

    const rows =
      mode === "extended"
        ? await withExtendedHoursVolume(candidates, provider, now)
        : candidates.map((row) => ({
            ...row,
            activeDollarVolume: row.activeVolume * row.price,
          }));

    return {
      error: null,
      loadedAt,
      mode,
      rows: sortByDollarVolume(rows),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      loadedAt,
      mode,
      rows: [],
    };
  }
}

export function getGappersMode(now: Date): GappersMode {
  const parts = easternDateParts(now);
  const minutes = parts.hour * 60 + parts.minute + parts.second / 60;

  return isUsEquityTradingDay(parts) && minutes >= 4 * 60 && minutes < 9 * 60 + 30
    ? "extended"
    : "regular";
}

function isRegularMarketOpen(now: Date) {
  const parts = easternDateParts(now);
  const minutes = parts.hour * 60 + parts.minute + parts.second / 60;

  return isUsEquityTradingDay(parts) && minutes >= 9 * 60 + 30 && minutes < 16 * 60;
}

export function getExtendedHoursWindows(now: Date): ExtendedHoursWindow[] {
  const today = easternDateParts(now);
  const previousTradingDay = getPreviousTradingDayParts(now);

  return [
    {
      from: easternDateTimeToUtc(
        previousTradingDay.year,
        previousTradingDay.month,
        previousTradingDay.day,
        16,
        0,
      ),
      to: easternDateTimeToUtc(
        previousTradingDay.year,
        previousTradingDay.month,
        previousTradingDay.day,
        20,
        0,
      ),
    },
    {
      from: easternDateTimeToUtc(today.year, today.month, today.day, 4, 0),
      to: easternDateTimeToUtc(today.year, today.month, today.day, 9, 30),
    },
  ];
}

async function withExtendedHoursVolume(
  rows: GappersRow[],
  provider: GappersDataProvider,
  now: Date,
) {
  const windows = getExtendedHoursWindows(now);

  return Promise.all(
    rows.map(async (row) => {
      const bars = await Promise.all(
        windows.map((window) =>
          provider.getAggregateBars({
            adjusted: false,
            from: String(window.from.getTime()),
            symbol: row.symbol,
            timeframe: "5m",
            to: String(window.to.getTime()),
          }),
        ),
      );
      const activeVolume = bars
        .flat()
        .filter((bar) => isInAnyWindow(new Date(bar.barStartAt), windows))
        .reduce((sum, bar) => sum + bar.volume, 0);

      return {
        ...row,
        activeDollarVolume: activeVolume * row.price,
        activeVolume,
      };
    }),
  );
}

function buildUniverse(references: MassiveReferenceTicker[]) {
  const universe = new Map<string, { name: string; securityType: GappersSecurityType }>();

  for (const item of buildCommonStockUniverse(references).values()) {
    universe.set(item.symbol, { name: item.name, securityType: "Stock" });
  }

  for (const item of references) {
    const symbol = String(item.ticker ?? "").toUpperCase();
    const type = String(item.type ?? "").toUpperCase();
    const market = String(item.market ?? "").toLowerCase();
    const locale = String(item.locale ?? "").toLowerCase();

    if (!symbol || item.active === false || locale !== "us" || market !== "stocks") {
      continue;
    }

    if (type === "ETF") {
      universe.set(symbol, { name: item.name ?? symbol, securityType: "ETF" });
    }
  }

  return universe;
}

function normalizeCandidate(
  snapshot: MassiveSnapshotTicker,
  reference: { name: string; securityType: GappersSecurityType } | undefined,
  options: { usePreviousSessionVolumeFallback: boolean },
): Omit<GappersRow, "previousCloseAt"> | null {
  const normalized = normalizeMarketSnapshotTicker(snapshot);

  if (!normalized || !reference) {
    return null;
  }

  const currentRegularVolume =
    firstFiniteNumber([
      getPath(snapshot, ["day", "v"]),
      getPath(snapshot, ["session", "volume"]),
    ]) ?? 0;
  const previousRegularVolume =
    firstFiniteNumber([
      getPath(snapshot, ["prevDay", "v"]),
      getPath(snapshot, ["session", "previous_volume"]),
      getPath(snapshot, ["session", "previous_day_volume"]),
    ]) ?? null;
  const activeVolume =
    options.usePreviousSessionVolumeFallback &&
    currentRegularVolume <= 0 &&
    previousRegularVolume != null
      ? previousRegularVolume
      : currentRegularVolume;

  return {
    activeDollarVolume: activeVolume * normalized.price,
    activeVolume,
    gapPercent:
      ((normalized.price - normalized.previousClose) / normalized.previousClose) *
      100,
    lastUpdatedAt: normalized.lastUpdatedAt,
    name: reference.name,
    previousClose: normalized.previousClose,
    price: normalized.price,
    securityType: reference.securityType,
    symbol: normalized.symbol,
  };
}

function sortByDollarVolume(rows: GappersRow[]) {
  return [...rows].sort((a, b) => b.activeDollarVolume - a.activeDollarVolume || a.symbol.localeCompare(b.symbol));
}

function getPreviousRegularCloseAt(now: Date) {
  const previousTradingDay = getPreviousTradingDayParts(now);

  return easternDateTimeToUtc(
    previousTradingDay.year,
    previousTradingDay.month,
    previousTradingDay.day,
    16,
    0,
  );
}

function isInAnyWindow(value: Date, windows: ExtendedHoursWindow[]) {
  const time = value.getTime();

  return windows.some((window) => time >= window.from.getTime() && time < window.to.getTime());
}

function getPath(value: Record<string, unknown>, path: string[]) {
  let current: unknown = value;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function firstFiniteNumber(values: unknown[]) {
  for (const value of values) {
    const parsed = numberFrom(value);

    if (parsed != null) {
      return parsed;
    }
  }

  return null;
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

function getPreviousTradingDayParts(now: Date) {
  const today = easternDateParts(now);
  const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day, 12));

  do {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } while (!isUsEquityTradingDay(easternDateParts(cursor)));

  return easternDateParts(cursor);
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
        Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)) /
      60_000;

    candidate = new Date(candidate.getTime() + deltaMinutes * 60_000);
  }

  return candidate;
}
