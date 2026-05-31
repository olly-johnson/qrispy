import { getTradeZeroConfig } from "@/lib/env";
import {
  assertTradeZeroReadOnlyRequest,
  assertTradeZeroSafetyConfirmed,
} from "@/lib/tradezero/safety";

type JsonObject = Record<string, unknown>;

export type TradeZeroAccount = JsonObject;
export type TradeZeroPosition = JsonObject;
export type TradeZeroOrder = JsonObject;

type HistoricalOrderPage = {
  rows: JsonObject[];
  pagination: {
    currentLimit: number;
    currentOffset: number;
    totalRecords: number;
  } | null;
};

const HISTORY_PAGE_SIZE = 100;
const HISTORY_WINDOW_DAYS = 7;

export class TradeZeroClient {
  constructor(
    private readonly config = getTradeZeroConfig(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  isConfigured() {
    return this.config != null;
  }

  async listAccounts(): Promise<TradeZeroAccount[]> {
    return this.getArray("/v1/api/accounts");
  }

  async getAccountPnl(accountId: string): Promise<JsonObject> {
    return this.getObject(`/v1/api/accounts/${accountId}/pnl`);
  }

  async listPositions(accountId: string): Promise<TradeZeroPosition[]> {
    return this.getArray(`/v1/api/accounts/${accountId}/positions`);
  }

  async listHistoricalOrders(input: {
    accountId: string;
    startDate: string;
    endDate?: string;
  }): Promise<TradeZeroOrder[]> {
    if (!input.endDate) {
      const path = `/v1/api/accounts/${input.accountId}/orders-with-pagination/start-date/${input.startDate}`;
      return this.getArray(path);
    }

    const byKey = new Map<string, TradeZeroOrder>();

    for (const windowStart of historyWindowStartDates(input.startDate, input.endDate)) {
      let offset = 0;

      while (true) {
        const page = await this.getHistoricalOrderPage({
          accountId: input.accountId,
          startDate: windowStart,
          offset,
        });

        for (const row of page.rows) {
          if (!isWithinHistoryWindow(row, input.startDate, input.endDate)) {
            continue;
          }

          byKey.set(historicalOrderKey(row), row);
        }

        if (!page.pagination) {
          break;
        }

        const nextOffset =
          page.pagination.currentOffset + page.pagination.currentLimit;
        if (nextOffset >= page.pagination.totalRecords || page.rows.length === 0) {
          break;
        }

        offset = nextOffset;
      }
    }

    return [...byKey.values()];
  }

  private async getObject(path: string): Promise<JsonObject> {
    const response = await this.request(path);
    const json = await response.json();
    return normalizeEnvelope(json) as JsonObject;
  }

  private async getArray(path: string): Promise<JsonObject[]> {
    const response = await this.request(path);
    const json = await response.json();
    const data = normalizeEnvelope(json);
    return Array.isArray(data) ? data : [];
  }

  private async getHistoricalOrderPage(input: {
    accountId: string;
    startDate: string;
    offset: number;
  }): Promise<HistoricalOrderPage> {
    const path = `/v1/api/accounts/${input.accountId}/orders-with-pagination/start-date/${input.startDate}?limit=${HISTORY_PAGE_SIZE}&offset=${input.offset}`;
    const response = await this.request(path);
    const json = await response.json();
    const data = normalizeEnvelope(json);

    return {
      rows: Array.isArray(data) ? data : [],
      pagination: normalizePagination(json),
    };
  }

  private async request(path: string) {
    if (!this.config) {
      throw new Error("TradeZero credentials are not configured");
    }

    assertTradeZeroSafetyConfirmed();
    assertTradeZeroReadOnlyRequest({ method: "GET", path });

    const response = await this.fetcher(`${this.config.baseUrl}${path}`, {
      method: "GET",
      headers: {
        "TZ-API-KEY-ID": this.config.apiKeyId,
        "TZ-API-SECRET-KEY": this.config.apiSecretKey,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`TradeZero request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  }
}

function normalizeEnvelope(json: unknown) {
  if (json && typeof json === "object" && "data" in json) {
    return (json as { data: unknown }).data;
  }

  if (json && typeof json === "object") {
    const envelope = json as Record<string, unknown>;
    for (const key of [
      "accounts",
      "positions",
      "orders",
      "tradingHistory",
      "items",
      "results",
    ]) {
      if (Array.isArray(envelope[key])) {
        return envelope[key];
      }
    }
  }

  return json;
}

function normalizePagination(json: unknown): HistoricalOrderPage["pagination"] {
  if (!json || typeof json !== "object" || !("pagination" in json)) {
    return null;
  }

  const pagination = (json as { pagination: unknown }).pagination;
  if (!pagination || typeof pagination !== "object") {
    return null;
  }

  const record = pagination as Record<string, unknown>;
  const currentLimit = numberField(record.currentLimit);
  const currentOffset = numberField(record.currentOffset);
  const totalRecords = numberField(record.totalRecords);

  if (currentLimit == null || currentOffset == null || totalRecords == null) {
    return null;
  }

  return { currentLimit, currentOffset, totalRecords };
}

function historyWindowStartDates(startDate: string, endDate: string) {
  const starts: string[] = [];
  const cursor = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);

  while (cursor <= end) {
    starts.push(formatIsoDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + HISTORY_WINDOW_DAYS);
  }

  return starts;
}

function isWithinHistoryWindow(
  row: TradeZeroOrder,
  startDate: string,
  endDate: string,
) {
  const rowDate = orderDate(row);
  return rowDate != null && rowDate >= startDate && rowDate <= endDate;
}

function orderDate(row: TradeZeroOrder) {
  for (const key of ["tradeDate", "entryDate", "executedAt"]) {
    const value = row[key];
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
  }

  return null;
}

function historicalOrderKey(row: TradeZeroOrder) {
  for (const key of ["tradeId", "executionId", "id"]) {
    const value = row[key];
    if (typeof value === "string" || typeof value === "number") {
      return `${key}:${value}`;
    }
  }

  return JSON.stringify(row);
}

function parseIsoDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`);
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function numberField(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
