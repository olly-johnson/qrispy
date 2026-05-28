import { afterEach, describe, expect, it, vi } from "vitest";

import { TradeZeroClient } from "./client";

const config = {
  baseUrl: "https://webapi.tradezero.com",
  apiKeyId: "key-id",
  apiSecretKey: "secret-key",
};

describe("TradeZeroClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads accounts from the documented accounts envelope", async () => {
    vi.stubEnv("TRADEZERO_READ_ONLY_CONFIRMED", "true");
    vi.stubEnv("TRADEZERO_BROKER_2FA_CONFIRMED", "true");
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        accounts: [
          {
            account: "TZP12345678",
            accountType: "Paper",
          },
        ],
      }),
    );

    const accounts = await new TradeZeroClient(config, fetcher).listAccounts();

    expect(accounts).toEqual([
      {
        account: "TZP12345678",
        accountType: "Paper",
      },
    ]);
  });

  it("reads historical orders from the documented trading history envelope", async () => {
    vi.stubEnv("TRADEZERO_READ_ONLY_CONFIRMED", "true");
    vi.stubEnv("TRADEZERO_BROKER_2FA_CONFIRMED", "true");
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        pagination: {
          currentLimit: 100,
          currentOffset: 0,
          totalRecords: 1,
        },
        tradingHistory: [
          {
            tradeId: 9001,
            symbol: "AAPL",
            side: "Buy",
            qty: 15,
            price: 180.25,
          },
        ],
      }),
    );

    const orders = await new TradeZeroClient(config, fetcher).listHistoricalOrders({
      accountId: "TZP12345678",
      startDate: "2026-01-01",
    });

    expect(orders).toEqual([
      {
        tradeId: 9001,
        symbol: "AAPL",
        side: "Buy",
        qty: 15,
        price: 180.25,
      },
    ]);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
