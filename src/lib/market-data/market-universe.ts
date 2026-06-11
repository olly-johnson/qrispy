import type {
  MassiveReferenceTicker,
  MassiveSnapshotTicker,
} from "./massive";

export type CommonStockUniverseEntry = {
  name: string;
  symbol: string;
};

export type NormalizedMarketSnapshot = {
  lastUpdatedAt: string | null;
  price: number;
  previousClose: number;
  symbol: string;
  volume: number;
};

export function buildCommonStockUniverse(rows: MassiveReferenceTicker[]) {
  const universe = new Map<string, CommonStockUniverseEntry>();

  for (const item of rows) {
    const symbol = String(item.ticker ?? "").toUpperCase();
    const type = String(item.type ?? "").toUpperCase();
    const market = String(item.market ?? "").toLowerCase();
    const locale = String(item.locale ?? "").toLowerCase();

    if (!symbol || item.active === false || locale !== "us" || market !== "stocks") {
      continue;
    }
    if (type !== "CS") {
      continue;
    }

    universe.set(symbol, { name: item.name ?? symbol, symbol });
  }

  return universe;
}

export function normalizeMarketSnapshotTicker(
  snapshot: MassiveSnapshotTicker,
): NormalizedMarketSnapshot | null {
  const symbol = String(snapshot.ticker ?? "").toUpperCase();
  const previousClose = firstFiniteNumber([
    getPath(snapshot, ["prevDay", "c"]),
    getPath(snapshot, ["session", "previous_close"]),
  ]);

  if (!symbol || previousClose == null || previousClose <= 0) {
    return null;
  }

  const livePrice = firstPositiveFiniteNumber([
    getPath(snapshot, ["fmv"]),
    getPath(snapshot, ["lastTrade", "p"]),
    getPath(snapshot, ["last_trade", "price"]),
    getPath(snapshot, ["min", "c"]),
    getPath(snapshot, ["day", "c"]),
  ]);
  const price =
    priceFromChange(snapshot, previousClose, livePrice == null) ?? livePrice;

  if (price == null) {
    return null;
  }

  const volume =
    firstFiniteNumber([
      getPath(snapshot, ["day", "v"]),
      getPath(snapshot, ["session", "volume"]),
    ]) ?? 0;
  const updated = firstPositiveFiniteNumber([
    snapshot.updated,
    snapshot.last_updated,
  ]);

  return {
    lastUpdatedAt: updated == null ? null : timestampToIso(updated),
    price,
    previousClose,
    symbol,
    volume,
  };
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

function firstPositiveFiniteNumber(values: unknown[]) {
  for (const value of values) {
    const parsed = numberFrom(value);

    if (parsed != null && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function priceFromChange(
  snapshot: MassiveSnapshotTicker,
  previousClose: number,
  useZeroChange: boolean,
) {
  const changePercent = numberFrom(snapshot.todaysChangePerc);

  if (changePercent != null && (changePercent !== 0 || useZeroChange)) {
    return previousClose * (1 + changePercent / 100);
  }

  const change = numberFrom(snapshot.todaysChange);

  return change != null && (change !== 0 || useZeroChange)
    ? previousClose + change
    : null;
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
  const milliseconds =
    value > 10_000_000_000_000 ? Math.floor(value / 1_000_000) : value;

  return new Date(milliseconds).toISOString();
}
