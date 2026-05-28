import { getTradeZeroConfig } from "@/lib/env";
import {
  assertTradeZeroReadOnlyRequest,
  assertTradeZeroSafetyConfirmed,
} from "@/lib/tradezero/safety";

type JsonObject = Record<string, unknown>;

export type TradeZeroAccount = JsonObject;
export type TradeZeroPosition = JsonObject;
export type TradeZeroOrder = JsonObject;

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
  }): Promise<TradeZeroOrder[]> {
    const path = `/v1/api/accounts/${input.accountId}/orders-with-pagination/start-date/${input.startDate}`;
    return this.getArray(path);
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

  return json;
}
