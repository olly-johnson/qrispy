import { describe, expect, it, vi } from "vitest";

import { getTradeHistory, mapLatestPositions } from "@/lib/app-data";

describe("mapLatestPositions", () => {
  it("keeps only one row per account and symbol from the latest snapshot", () => {
    expect(
      mapLatestPositions([
        {
          id: "latest-docn",
          account_id: "account-1",
          snapshot_at: "2026-05-28T16:39:00Z",
          symbol: "DOCN",
          quantity: 4,
          average_price: 102.36,
          market_value: 614.16,
          unrealized_pnl: 204.72,
        },
        {
          id: "latest-fcel",
          account_id: "account-1",
          snapshot_at: "2026-05-28T16:39:00Z",
          symbol: "FCEL",
          quantity: 14,
          average_price: 14.47,
          market_value: 336.84,
          unrealized_pnl: 134.26,
        },
        {
          id: "older-docn",
          account_id: "account-1",
          snapshot_at: "2026-05-28T16:37:00Z",
          symbol: "DOCN",
          quantity: 4,
          average_price: 102.36,
          market_value: 614.16,
          unrealized_pnl: 204.72,
        },
      ]),
    ).toEqual([
      {
        id: "latest-docn",
        symbol: "DOCN",
        quantity: 4,
        averagePrice: 102.36,
        marketValue: 614.16,
        unrealizedPnl: 204.72,
      },
      {
        id: "latest-fcel",
        symbol: "FCEL",
        quantity: 14,
        averagePrice: 14.47,
        marketValue: 336.84,
        unrealizedPnl: 134.26,
      },
    ]);
  });
});

describe("getTradeHistory", () => {
  it("loads all trades that overlap Jan 1 through today's date without the dashboard limit", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: "trade-1",
          symbol: "SNDK",
          direction: "LONG",
          status: "CLOSED",
          opened_at: "2025-12-19T14:50:30.000Z",
          closed_at: "2026-01-06T14:31:11.000Z",
          realized_pnl: 12.5,
          total_fees: 1.25,
        },
        {
          id: "trade-2",
          symbol: "OLD",
          direction: "LONG",
          status: "CLOSED",
          opened_at: "2025-12-18T15:00:00.000Z",
          closed_at: "2025-12-20T16:00:00.000Z",
          realized_pnl: 9,
          total_fees: 1,
        },
      ],
      error: null,
    });
    const lt = vi.fn(() => ({ order }));
    const eq = vi.fn(() => ({ lt }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await expect(
      getTradeHistory("user-1", {
        client: { from },
        now: new Date("2026-05-28T12:00:00.000Z"),
      }),
    ).resolves.toEqual([
      {
        id: "trade-1",
        symbol: "SNDK",
        direction: "LONG",
        status: "CLOSED",
        openedAt: "2025-12-19T14:50:30.000Z",
        closedAt: "2026-01-06T14:31:11.000Z",
        realizedPnl: 12.5,
        totalFees: 1.25,
      },
    ]);

    expect(from).toHaveBeenCalledWith("trades");
    expect(select).toHaveBeenCalledWith("*");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(lt).toHaveBeenCalledWith("opened_at", "2026-05-29T00:00:00.000Z");
    expect(order).toHaveBeenCalledWith("opened_at", { ascending: false });
    expect(JSON.stringify({ from: from.mock.calls })).not.toContain("limit");
  });
});
