import type { MarketDataProvider, OhlcvBar } from "./types";

export const STOCKBEE_MARKET_MONITOR_URL =
  "https://docs.google.com/spreadsheet/pub?key=0Am_cU8NLIU20dEhiQnVHN3Nnc3B1S3J6eGhKZFo0N3c&output=csv";

const DEFAULT_MARKET_INDEX_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA"] as const;
const MARKET_INDEX_LOOKBACK_DAYS = 420;

export type StockbeeBreadthRow = {
  date: string;
  up4Percent: number;
  down4Percent: number;
  ratio5Day: number;
  ratio10Day: number;
  up25Quarter: number;
  down25Quarter: number;
  up25Month: number;
  down25Month: number;
  up50Month: number;
  down50Month: number;
  up13In34Days: number;
  down13In34Days: number;
  universeCount: number;
  t2108: number;
  sp500: number;
};

export type MarketBreadthSnapshot = {
  latest: StockbeeBreadthRow | null;
  tableRows: StockbeeBreadthRow[];
  chartRows: StockbeeBreadthRow[];
};

export type MarketIndexBreadthSummary = {
  symbol: string;
  price: number | null;
  priceAboveSma10: boolean | null;
  priceAboveSma20: boolean | null;
  sma10AboveSma20: boolean | null;
  sma50AboveSma200: boolean | null;
};

export type DashboardBreadthSnapshot = {
  date: string | null;
  up4Percent: number | null;
  down4Percent: number | null;
  fourPercentBias: BreadthBias;
  up13In34Days: number | null;
  down13In34Days: number | null;
  thirteenThirtyFourBias: BreadthBias;
  t2108: number | null;
  indexes: DashboardBreadthIndexStatus[];
};

export type BreadthBias = "down" | "flat" | "up" | null;

export type DashboardBreadthIndexStatus = {
  symbol: string;
  priceAboveSma10: boolean | null;
  priceAboveSma20: boolean | null;
  sma10AboveSma20: boolean | null;
};

type BreadthFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export async function getStockbeeMarketBreadth(input: {
  fetcher?: BreadthFetcher;
  rowLimit?: number;
  url?: string;
} = {}): Promise<MarketBreadthSnapshot> {
  const fetcher = input.fetcher ?? fetch;
  const response = await fetcher(input.url ?? STOCKBEE_MARKET_MONITOR_URL, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Stockbee Market Monitor request failed with ${response.status}`);
  }

  return buildMarketBreadthSnapshot(
    parseStockbeeMarketMonitorCsv(await response.text()),
    input.rowLimit,
  );
}

export function parseStockbeeMarketMonitorCsv(csv: string): StockbeeBreadthRow[] {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim() !== ""));
  const headerIndex = rows.findIndex((row) => normalizeHeader(row[0]) === "date");

  if (headerIndex === -1) {
    return [];
  }

  return rows
    .slice(headerIndex + 1)
    .map(rowFromCsv)
    .filter((row): row is StockbeeBreadthRow => row != null);
}

export function buildMarketBreadthSnapshot(
  rows: StockbeeBreadthRow[],
  rowLimit = 30,
): MarketBreadthSnapshot {
  const tableRows = rows.slice(0, rowLimit);

  return {
    latest: rows[0] ?? null,
    tableRows,
    chartRows: [...tableRows].reverse(),
  };
}

export function buildDashboardBreadthSnapshot(
  breadth: MarketBreadthSnapshot,
  indexes: MarketIndexBreadthSummary[],
): DashboardBreadthSnapshot {
  const latest = breadth.latest;
  const indexBySymbol = new Map(
    indexes.map((index) => [index.symbol.toUpperCase(), index]),
  );

  return {
    date: latest?.date ?? null,
    up4Percent: latest?.up4Percent ?? null,
    down4Percent: latest?.down4Percent ?? null,
    fourPercentBias: breadthBias(latest?.up4Percent, latest?.down4Percent),
    up13In34Days: latest?.up13In34Days ?? null,
    down13In34Days: latest?.down13In34Days ?? null,
    thirteenThirtyFourBias: breadthBias(
      latest?.up13In34Days,
      latest?.down13In34Days,
    ),
    t2108: latest?.t2108 ?? null,
    indexes: ["SPY", "QQQ"].map((symbol) => {
      const summary = indexBySymbol.get(symbol);

      return {
        symbol,
        priceAboveSma10: summary?.priceAboveSma10 ?? null,
        priceAboveSma20: summary?.priceAboveSma20 ?? null,
        sma10AboveSma20: summary?.sma10AboveSma20 ?? null,
      };
    }),
  };
}

export function t2108Color(value: number | null) {
  if (value == null) {
    return "#71717a";
  }

  if (value <= 20) {
    return "#22c55e";
  }
  if (value <= 50) {
    return interpolateColor("#22c55e", "#eab308", (value - 20) / 30);
  }
  if (value <= 70) {
    return interpolateColor("#eab308", "#f97316", (value - 50) / 20);
  }
  if (value <= 90) {
    return interpolateColor("#f97316", "#ef4444", (value - 70) / 20);
  }

  return "#ef4444";
}

export async function getMarketIndexBreadthSummaries(input: {
  provider: MarketDataProvider | null;
  now?: Date;
  symbols?: readonly string[];
}): Promise<MarketIndexBreadthSummary[]> {
  const symbols = input.symbols ?? DEFAULT_MARKET_INDEX_SYMBOLS;

  if (!input.provider) {
    return symbols.map((symbol) => emptyMarketIndexSummary(symbol));
  }

  const to = datePart(input.now ?? new Date());
  const from = datePart(addDays(input.now ?? new Date(), -MARKET_INDEX_LOOKBACK_DAYS));

  return Promise.all(
    symbols.map(async (symbol) =>
      summarizeMarketIndexBars(
        symbol,
        await input.provider!.getAggregateBars({
          symbol,
          timeframe: "1d",
          from,
          to,
          adjusted: true,
        }),
      ),
    ),
  );
}

export function summarizeMarketIndexBars(
  symbol: string,
  bars: OhlcvBar[],
): MarketIndexBreadthSummary {
  const closes = bars
    .filter((bar) => Number.isFinite(bar.close))
    .sort((left, right) => left.barStartAt.localeCompare(right.barStartAt))
    .map((bar) => bar.close);
  const price = closes.at(-1) ?? null;
  const sma10 = averageTail(closes, 10);
  const sma20 = averageTail(closes, 20);
  const sma50 = averageTail(closes, 50);
  const sma200 = averageTail(closes, 200);

  return {
    symbol,
    price: price == null ? null : round(price, 2),
    priceAboveSma10: compareGreater(price, sma10),
    priceAboveSma20: compareGreater(price, sma20),
    sma10AboveSma20: compareGreater(sma10, sma20),
    sma50AboveSma200: compareGreater(sma50, sma200),
  };
}

function rowFromCsv(row: string[]) {
  const date = dateFromMarketMonitor(row[0]);

  if (!date) {
    return null;
  }

  return {
    date,
    up4Percent: numberFromCell(row[1]),
    down4Percent: numberFromCell(row[2]),
    ratio5Day: numberFromCell(row[3]),
    ratio10Day: numberFromCell(row[4]),
    up25Quarter: numberFromCell(row[5]),
    down25Quarter: numberFromCell(row[6]),
    up25Month: numberFromCell(row[7]),
    down25Month: numberFromCell(row[8]),
    up50Month: numberFromCell(row[9]),
    down50Month: numberFromCell(row[10]),
    up13In34Days: numberFromCell(row[11]),
    down13In34Days: numberFromCell(row[12]),
    universeCount: numberFromCell(row[13]),
    t2108: numberFromCell(row[14]),
    sp500: numberFromCell(row[15]),
  };
}

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  rows.push(row);

  return rows;
}

function dateFromMarketMonitor(value: string) {
  const [month, day, year] = value.trim().split("/").map((part) => Number(part));

  if (!month || !day || !year) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function numberFromCell(value: string | undefined) {
  const parsed = Number((value ?? "").replaceAll(",", "").trim());

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase();
}

function averageTail(values: number[], period: number) {
  if (values.length < period) {
    return null;
  }

  const slice = values.slice(-period);
  return round(slice.reduce((sum, value) => sum + value, 0) / period, 4);
}

function compareGreater(left: number | null, right: number | null) {
  if (left == null || right == null) {
    return null;
  }

  return left > right;
}

function breadthBias(
  up: number | null | undefined,
  down: number | null | undefined,
): BreadthBias {
  if (up == null || down == null) {
    return null;
  }
  if (up === down) {
    return "flat";
  }

  return up > down ? "up" : "down";
}

function interpolateColor(from: string, to: string, ratio: number) {
  const boundedRatio = Math.min(1, Math.max(0, ratio));
  const fromRgb = rgbFromHex(from);
  const toRgb = rgbFromHex(to);
  const rgb = fromRgb.map((channel, index) =>
    Math.round(channel + (toRgb[index] - channel) * boundedRatio),
  );

  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function rgbFromHex(hex: string) {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

function emptyMarketIndexSummary(symbol: string): MarketIndexBreadthSummary {
  return {
    symbol,
    price: null,
    priceAboveSma10: null,
    priceAboveSma20: null,
    sma10AboveSma20: null,
    sma50AboveSma200: null,
  };
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function datePart(value: Date) {
  return value.toISOString().slice(0, 10);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
