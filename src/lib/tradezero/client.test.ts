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

  it("walks overlapping history windows, paginates offsets, and dedupes fills", async () => {
    vi.stubEnv("TRADEZERO_READ_ONLY_CONFIRMED", "true");
    vi.stubEnv("TRADEZERO_BROKER_2FA_CONFIRMED", "true");
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          pagination: {
            currentLimit: 2,
            currentOffset: 0,
            totalRecords: 3,
          },
          tradingHistory: [
            { tradeId: 1, symbol: "AAPL", tradeDate: "2026-01-02T00:00:00" },
            { tradeId: 2, symbol: "MSFT", tradeDate: "2026-01-30T00:00:00" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          pagination: {
            currentLimit: 2,
            currentOffset: 2,
            totalRecords: 3,
          },
          tradingHistory: [
            { tradeId: 3, symbol: "NVDA", tradeDate: "2026-01-09T00:00:00" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          pagination: {
            currentLimit: 2,
            currentOffset: 0,
            totalRecords: 2,
          },
          tradingHistory: [
            { tradeId: 1, symbol: "AAPL", tradeDate: "2026-01-02T00:00:00" },
            { tradeId: 4, symbol: "TSLA", tradeDate: "2026-01-10T00:00:00" },
          ],
        }),
      );

    const orders = await new TradeZeroClient(config, fetcher).listHistoricalOrders({
      accountId: "TZP12345678",
      startDate: "2026-01-01",
      endDate: "2026-01-10",
    });

    expect(orders.map((order) => order.tradeId)).toEqual([1, 3, 4]);
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://webapi.tradezero.com/v1/api/accounts/TZP12345678/orders-with-pagination/start-date/2026-01-01?limit=100&offset=0",
      expect.any(Object),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://webapi.tradezero.com/v1/api/accounts/TZP12345678/orders-with-pagination/start-date/2026-01-01?limit=100&offset=2",
      expect.any(Object),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      "https://webapi.tradezero.com/v1/api/accounts/TZP12345678/orders-with-pagination/start-date/2026-01-08?limit=100&offset=0",
      expect.any(Object),
    );
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
