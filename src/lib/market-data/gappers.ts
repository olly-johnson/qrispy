import type {
  MassiveReferenceTicker,
  MassiveSnapshotTicker,
} from "./massive";
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
const MIN_SERVER_GAP_PERCENT = 0;

export async function buildGappersSnapshot({
  now = new Date(),
  provider,
}: {
  now?: Date;
  provider: GappersDataProvider | null;
}): Promise<GappersSnapshot> {
  const mode = getGappersMode(now);
  const loadedAt = now.toISOString();
  const previousCloseAt = getPreviousRegularCloseAt(now).toISOString();

  if (!provider) {
    return {
      error: "Massive API key is not configured.",
      loadedAt,
      mode,
      rows: [],
    };
  }

  try {
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
        ),
      )
      .filter((row): row is Omit<GappersRow, "previousCloseAt"> => row != null)
      .map((row) => ({ ...row, previousCloseAt }))
      .filter((row) => row.price > MIN_SERVER_PRICE && row.gapPercent >= MIN_SERVER_GAP_PERCENT);

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

  return minutes >= 4 * 60 && minutes < 9 * 60 + 30 ? "extended" : "regular";
}

export function getExtendedHoursWindows(now: Date): ExtendedHoursWindow[] {
  const today = easternDateParts(now);
  const yesterdayNoon = new Date(Date.UTC(today.year, today.month - 1, today.day - 1, 12));
  const yesterday = easternDateParts(yesterdayNoon);

  return [
    {
      from: easternDateTimeToUtc(yesterday.year, yesterday.month, yesterday.day, 16, 0),
      to: easternDateTimeToUtc(yesterday.year, yesterday.month, yesterday.day, 20, 0),
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

  for (const item of references) {
    const symbol = String(item.ticker ?? "").toUpperCase();
    const type = String(item.type ?? "").toUpperCase();
    const market = String(item.market ?? "").toLowerCase();
    const locale = String(item.locale ?? "").toLowerCase();

    if (!symbol || item.active === false || locale !== "us" || market !== "stocks") {
      continue;
    }

    if (type === "CS") {
      universe.set(symbol, { name: item.name ?? symbol, securityType: "Stock" });
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
): Omit<GappersRow, "previousCloseAt"> | null {
  const symbol = String(snapshot.ticker ?? "").toUpperCase();
  const price = firstFiniteNumber([
    getPath(snapshot, ["fmv"]),
    getPath(snapshot, ["lastTrade", "p"]),
    getPath(snapshot, ["last_trade", "price"]),
    getPath(snapshot, ["min", "c"]),
    getPath(snapshot, ["day", "c"]),
  ]);
  const previousClose = firstFiniteNumber([
    getPath(snapshot, ["prevDay", "c"]),
    getPath(snapshot, ["session", "previous_close"]),
  ]);

  if (!symbol || !reference || price == null || previousClose == null || previousClose <= 0) {
    return null;
  }

  const activeVolume =
    firstFiniteNumber([getPath(snapshot, ["day", "v"]), getPath(snapshot, ["session", "volume"])]) ?? 0;
  const updated = firstFiniteNumber([snapshot.updated, snapshot.last_updated]);

  return {
    activeDollarVolume: activeVolume * price,
    activeVolume,
    gapPercent: ((price - previousClose) / previousClose) * 100,
    lastUpdatedAt: updated == null ? null : timestampToIso(updated),
    name: reference.name,
    previousClose,
    price,
    securityType: reference.securityType,
    symbol,
  };
}

function sortByDollarVolume(rows: GappersRow[]) {
  return [...rows].sort((a, b) => b.activeDollarVolume - a.activeDollarVolume || a.symbol.localeCompare(b.symbol));
}

function getPreviousRegularCloseAt(now: Date) {
  const today = easternDateParts(now);
  const yesterdayNoon = new Date(
    Date.UTC(today.year, today.month - 1, today.day - 1, 12),
  );
  const yesterday = easternDateParts(yesterdayNoon);

  return easternDateTimeToUtc(
    yesterday.year,
    yesterday.month,
    yesterday.day,
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

function timestampToIso(value: number) {
  const milliseconds = value > 10_000_000_000_000 ? Math.floor(value / 1_000_000) : value;

  return new Date(milliseconds).toISOString();
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
        Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)) /
      60_000;

    candidate = new Date(candidate.getTime() + deltaMinutes * 60_000);
  }

  return candidate;
}
