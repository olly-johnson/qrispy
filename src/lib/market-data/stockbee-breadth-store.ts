import {
  buildMarketBreadthSnapshot,
  parseStockbeeMarketMonitorCsv,
  STOCKBEE_MARKET_MONITOR_URL,
  type MarketBreadthSnapshot,
  type StockbeeBreadthRow,
} from "./breadth";

export type StockbeeBreadthYearGroup = {
  rows: StockbeeBreadthRow[];
  year: string;
};

type StockbeeFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type StockbeeBreadthHistory = {
  groups: StockbeeBreadthYearGroup[];
  liveRows: StockbeeBreadthRow[];
  selectedRows: StockbeeBreadthRow[];
  selectedYear: string | null;
  snapshot: MarketBreadthSnapshot;
  syncError: string | null;
};

type StockbeeBreadthClient = {
  from(table: "stockbee_breadth_rows"): {
    select(columns: "*"): {
      order(
        column: "date",
        options: { ascending: boolean },
      ): Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
    upsert(
      rows: Record<string, unknown>[],
      options: { onConflict: "date" },
    ): Promise<{ error: unknown }>;
  };
};

export async function loadStockbeeBreadthHistory(input: {
  client: unknown;
  fetcher?: StockbeeFetcher;
  requestedYear?: string;
  sourceUrl?: string;
}): Promise<StockbeeBreadthHistory> {
  const fetcher = input.fetcher ?? fetch;
  const sourceUrl = input.sourceUrl ?? STOCKBEE_MARKET_MONITOR_URL;
  let liveRows: StockbeeBreadthRow[] = [];
  let syncError: string | null = null;

  try {
    const response = await fetcher(sourceUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(
        `Stockbee Market Monitor request failed with ${response.status}`,
      );
    }

    liveRows = parseStockbeeMarketMonitorCsv(await response.text());
    await syncStockbeeBreadthRows({
      client: input.client,
      fetchedAt: new Date(),
      rows: liveRows,
      sourceUrl,
    });
  } catch (error) {
    syncError = errorMessage(error);
  }

  let persistedRows: StockbeeBreadthRow[];

  try {
    persistedRows = await readStockbeeBreadthRows({ client: input.client });
  } catch (error) {
    persistedRows = liveRows;
    syncError = `Persisted Stockbee history unavailable: ${errorMessage(error)}`;
  }

  const sourceRows = persistedRows.length > 0 ? persistedRows : liveRows;
  const groups = groupStockbeeBreadthRowsByYear(sourceRows);
  const selectedYear = selectedStockbeeBreadthYear(groups, input.requestedYear);
  const selectedRows =
    groups.find((group) => group.year === selectedYear)?.rows ?? [];

  return {
    groups,
    liveRows,
    selectedRows,
    selectedYear,
    snapshot: buildMarketBreadthSnapshot(sourceRows),
    syncError,
  };
}

export function stockbeeBreadthUpsertPayload(
  row: StockbeeBreadthRow,
  sourceUrl: string,
  fetchedAt: Date,
) {
  const timestamp = fetchedAt.toISOString();

  return {
    date: row.date,
    down_13_in_34_days: row.down13In34Days,
    down_25_month: row.down25Month,
    down_25_quarter: row.down25Quarter,
    down_4_percent: row.down4Percent,
    down_50_month: row.down50Month,
    ratio_10_day: row.ratio10Day,
    ratio_5_day: row.ratio5Day,
    source_fetched_at: timestamp,
    source_url: sourceUrl,
    sp500: row.sp500,
    t2108: row.t2108,
    universe_count: row.universeCount,
    up_13_in_34_days: row.up13In34Days,
    up_25_month: row.up25Month,
    up_25_quarter: row.up25Quarter,
    up_4_percent: row.up4Percent,
    up_50_month: row.up50Month,
    updated_at: timestamp,
  };
}

export async function syncStockbeeBreadthRows(input: {
  client: unknown;
  fetchedAt: Date;
  rows: StockbeeBreadthRow[];
  sourceUrl: string;
}) {
  if (input.rows.length === 0) {
    return;
  }

  const client = input.client as StockbeeBreadthClient;
  const result = await client.from("stockbee_breadth_rows").upsert(
    input.rows.map((row) =>
      stockbeeBreadthUpsertPayload(row, input.sourceUrl, input.fetchedAt),
    ),
    { onConflict: "date" },
  );

  if (result.error) {
    throw result.error;
  }
}

export async function readStockbeeBreadthRows(input: { client: unknown }) {
  const client = input.client as StockbeeBreadthClient;
  const { data, error } = await client
    .from("stockbee_breadth_rows")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(stockbeeBreadthRowFromStoredRow);
}

export function groupStockbeeBreadthRowsByYear(rows: StockbeeBreadthRow[]) {
  const groups = new Map<string, StockbeeBreadthRow[]>();

  for (const row of rows) {
    const year = row.date.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), row]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, yearRows]) => ({
      rows: yearRows,
      year,
    }));
}

export function selectedStockbeeBreadthYear(
  groups: StockbeeBreadthYearGroup[],
  requestedYear: string | undefined,
) {
  if (requestedYear && groups.some((group) => group.year === requestedYear)) {
    return requestedYear;
  }

  return groups[0]?.year ?? null;
}

function stockbeeBreadthRowFromStoredRow(
  row: Record<string, unknown>,
): StockbeeBreadthRow {
  return {
    date: String(row.date),
    down13In34Days: numberOrZero(row.down_13_in_34_days),
    down25Month: numberOrZero(row.down_25_month),
    down25Quarter: numberOrZero(row.down_25_quarter),
    down4Percent: numberOrZero(row.down_4_percent),
    down50Month: numberOrZero(row.down_50_month),
    ratio10Day: numberOrZero(row.ratio_10_day),
    ratio5Day: numberOrZero(row.ratio_5_day),
    sp500: numberOrZero(row.sp500),
    t2108: numberOrZero(row.t2108),
    universeCount: numberOrZero(row.universe_count),
    up13In34Days: numberOrZero(row.up_13_in_34_days),
    up25Month: numberOrZero(row.up_25_month),
    up25Quarter: numberOrZero(row.up_25_quarter),
    up4Percent: numberOrZero(row.up_4_percent),
    up50Month: numberOrZero(row.up_50_month),
  };
}

function numberOrZero(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = stringValue(record.message);
    const code = stringValue(record.code);

    if (message && code) {
      return `${code}: ${message}`;
    }
    if (message) {
      return message;
    }
  }

  return String(error);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
