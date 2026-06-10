import type { MarketDataProvider, OhlcvBar } from "./types";

export const STOCKBEE_MARKET_MONITOR_URL =
  "https://docs.google.com/spreadsheet/pub?key=0Am_cU8NLIU20dEhiQnVHN3Nnc3B1S3J6eGhKZFo0N3c&output=csv";
export const STOCKBEE_MARKET_MONITOR_WORKBOOK_URL =
  "https://docs.google.com/spreadsheet/pub?key=0Am_cU8NLIU20dEhiQnVHN3Nnc3B1S3J6eGhKZFo0N3c&output=html";

const DEFAULT_MARKET_INDEX_SYMBOLS = ["SPY", "QQQ", "IWM", "DIA"] as const;
const MARKET_INDEX_LOOKBACK_DAYS = 420;
const STOCKBEE_MARKET_MONITOR_SPREADSHEET_ID =
  "1O6OhS7ciA8zwfycBfGPbP2fWJnR0pn2UUvFZVDP9jpE";

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

export type StockbeeMarketMonitorSheet = {
  csvUrl: string;
  gid: string;
  name: string;
  year: number;
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

export async function fetchStockbeeMarketMonitorWorkbookRows(input: {
  fetcher?: BreadthFetcher;
  workbookUrl?: string;
} = {}) {
  const fetcher = input.fetcher ?? fetch;
  const workbookUrl = input.workbookUrl ?? STOCKBEE_MARKET_MONITOR_WORKBOOK_URL;
  const response = await fetcher(workbookUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Stockbee Market Monitor request failed with ${response.status}`);
  }

  const sheets = parseStockbeeMarketMonitorSheets(await response.text());
  const sheetRows = await Promise.all(
    sheets.map(async (sheet) => {
      const sheetResponse = await fetcher(sheet.csvUrl, { cache: "no-store" });

      if (!sheetResponse.ok) {
        throw new Error(
          `Stockbee Market Monitor request failed with ${sheetResponse.status}`,
        );
      }

      return parseStockbeeMarketMonitorCsv(await sheetResponse.text(), {
        fallbackYear: sheet.year,
      });
    }),
  );

  return dedupeStockbeeRowsByDate(sheetRows.flat()).sort((left, right) =>
    right.date.localeCompare(left.date),
  );
}

export function parseStockbeeMarketMonitorCsv(
  csv: string,
  options: { fallbackYear?: number } = {},
): StockbeeBreadthRow[] {
  const rows = parseCsv(csv).filter((row) => row.some((cell) => cell.trim() !== ""));
  const headerIndex = rows.findIndex((row) => normalizeHeader(row[0]) === "date");

  if (headerIndex === -1) {
    return [];
  }

  const columnMap = stockbeeColumnMap(rows[headerIndex]);

  return rows
    .slice(headerIndex + 1)
    .map((row) => rowFromCsv(row, columnMap, options.fallbackYear))
    .filter((row): row is StockbeeBreadthRow => row != null);
}

export function parseStockbeeMarketMonitorSheets(
  html: string,
): StockbeeMarketMonitorSheet[] {
  const sheetsByYear = new Map<
    number,
    StockbeeMarketMonitorSheet & { priority: number }
  >();
  const itemPattern = /items\.push\(\{name:\s*"([^"]+)"[\s\S]*?gid:\s*"(\d+)"/g;

  for (const match of html.matchAll(itemPattern)) {
    const name = decodeGooglePublishedSheetString(match[1]);
    const gid = match[2];
    const directYear = name.match(/^\d{4}$/);
    const reformattedYear = name.match(/^Copy of (\d{4}) reformatted$/i);
    const year = Number(directYear?.[0] ?? reformattedYear?.[1]);

    if (!year) {
      continue;
    }

    const priority = reformattedYear ? 1 : 0;
    const existing = sheetsByYear.get(year);

    if (existing && existing.priority > priority) {
      continue;
    }

    sheetsByYear.set(year, {
      csvUrl: `https://docs.google.com/spreadsheets/d/${STOCKBEE_MARKET_MONITOR_SPREADSHEET_ID}/pub?gid=${gid}&single=true&output=csv`,
      gid,
      name,
      priority,
      year,
    });
  }

  return [...sheetsByYear.values()]
    .sort((left, right) => right.year - left.year)
    .map((sheet) => ({
      csvUrl: sheet.csvUrl,
      gid: sheet.gid,
      name: sheet.name,
      year: sheet.year,
    }));
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

type StockbeeColumnMap = {
  [key in keyof StockbeeBreadthRow]?: number;
};

const STOCKBEE_COLUMN_ALIASES: Record<keyof StockbeeBreadthRow, string[]> = {
  date: ["date"],
  down13In34Days: [
    "numberofstocksdown13plusin34days",
    "3413bear",
    "mm3413minus",
  ],
  down25Month: [
    "numberofstocksdown25plusinamonth",
    "numberofstocksdown25inamonth",
    "25downmonth",
    "25downmonth",
  ],
  down25Quarter: [
    "numberofstocksdown25plusinaquarter",
    "numberofstocksdown25inaquarter",
    "numberofstocks25downplusinaquarter",
    "25downquarter",
  ],
  down4Percent: [
    "numberofstocksdown4plustoday",
    "4downdaily",
    "numberofstocksdown4onhighvolume",
  ],
  down50Month: [
    "numberofstocksdown50plusinamonth",
    "numberofstocksdown50inamonth",
    "50downmonth",
    "50down",
  ],
  ratio10Day: [
    "10dayratio",
    "10daybreadthratio",
    "10daybreadthratioof4up4down",
  ],
  ratio5Day: [
    "5dayratio",
    "5daybreadthratio",
    "5daybreadthratioof4up4down",
  ],
  sp500: ["sp"],
  t2108: ["t2108", "t2108ofstocksabove40dayma"],
  universeCount: [
    "wordencommonstockuniverse",
    "commonstocks",
    "numberofstocksinwordencommonstockuniverse",
    "numberofstocksinwordendatabase",
    "totalnoetf",
    "total",
  ],
  up13In34Days: [
    "numberofstocksup13plusin34days",
    "3413bull",
    "mm3413plus",
  ],
  up25Month: [
    "numberofstocksup25plusinamonth",
    "numberofstocksup25inamonth",
    "25plusmonth",
    "25month",
  ],
  up25Quarter: [
    "numberofstocksup25plusinaquarter",
    "numberofstocksup25inaquarter",
    "25plusquarter",
  ],
  up4Percent: [
    "numberofstocksup4plustoday",
    "4plusdaily",
    "numberofstocksup4onhighvolume",
  ],
  up50Month: [
    "numberofstocksup50plusinamonth",
    "numberofstocksup50inamonth",
    "50plusmonth",
    "50up",
  ],
};

function rowFromCsv(
  row: string[],
  columnMap: StockbeeColumnMap,
  fallbackYear: number | undefined,
) {
  const date = dateFromMarketMonitor(row[columnMap.date ?? 0], fallbackYear);

  if (!date) {
    return null;
  }

  return {
    date,
    up4Percent: numberFromCell(row[columnMap.up4Percent ?? -1]),
    down4Percent: numberFromCell(row[columnMap.down4Percent ?? -1]),
    ratio5Day: numberFromCell(row[columnMap.ratio5Day ?? -1]),
    ratio10Day: numberFromCell(row[columnMap.ratio10Day ?? -1]),
    up25Quarter: numberFromCell(row[columnMap.up25Quarter ?? -1]),
    down25Quarter: numberFromCell(row[columnMap.down25Quarter ?? -1]),
    up25Month: numberFromCell(row[columnMap.up25Month ?? -1]),
    down25Month: numberFromCell(row[columnMap.down25Month ?? -1]),
    up50Month: numberFromCell(row[columnMap.up50Month ?? -1]),
    down50Month: numberFromCell(row[columnMap.down50Month ?? -1]),
    up13In34Days: numberFromCell(row[columnMap.up13In34Days ?? -1]),
    down13In34Days: numberFromCell(row[columnMap.down13In34Days ?? -1]),
    universeCount: numberFromCell(row[columnMap.universeCount ?? -1]),
    t2108: numberFromCell(row[columnMap.t2108 ?? -1]),
    sp500: numberFromCell(row[columnMap.sp500 ?? -1]),
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

function stockbeeColumnMap(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const map: StockbeeColumnMap = {};

  for (const [field, aliases] of Object.entries(STOCKBEE_COLUMN_ALIASES) as [
    keyof StockbeeBreadthRow,
    string[],
  ][]) {
    const index = normalizedHeaders.findIndex((header) =>
      aliases.includes(header),
    );

    if (index >= 0) {
      map[field] = index;
    }
  }

  return map;
}

function dateFromMarketMonitor(value: string | undefined, fallbackYear?: number) {
  const parts = (value ?? "")
    .trim()
    .split(/[/.]/)
    .map((part) => Number(part));
  let [month, day, year] = parts;

  if (!month || !day || (!year && !fallbackYear)) {
    return null;
  }

  if (month > 12 && day <= 12) {
    [month, day] = [day, month];
  }

  if (!year) {
    if (!fallbackYear) {
      return null;
    }
    year = fallbackYear;
  } else if (year < 100) {
    year += 2000;
  } else if (fallbackYear && (year < 2000 || year > new Date().getUTCFullYear() + 1)) {
    year = fallbackYear;
  }

  if (!year || !validDateParts(year, month, day)) {
    return null;
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function numberFromCell(value: string | undefined) {
  const parsed = Number((value ?? "").replaceAll(",", "").trim());

  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll("#", "number")
    .replaceAll("+", "plus")
    .replaceAll("-", "minus")
    .replaceAll("&", "")
    .replaceAll(">", "")
    .replace(/[^a-z0-9]+/g, "");
}

function decodeGooglePublishedSheetString(value: string) {
  return value.replaceAll("\\/", "/").replace(/\\x([0-9a-f]{2})/gi, (_, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function dedupeStockbeeRowsByDate(rows: StockbeeBreadthRow[]) {
  const byDate = new Map<string, StockbeeBreadthRow>();

  for (const row of rows) {
    const existing = byDate.get(row.date);

    if (!existing || stockbeeRowScore(row) > stockbeeRowScore(existing)) {
      byDate.set(row.date, row);
    }
  }

  return [...byDate.values()];
}

function stockbeeRowScore(row: StockbeeBreadthRow) {
  return Object.entries(row).filter(
    ([field, value]) => field !== "date" && typeof value === "number" && value !== 0,
  ).length;
}

function validDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
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
