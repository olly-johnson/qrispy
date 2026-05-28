import { describe, expect, it } from "vitest";

import { mapLatestPositions } from "@/lib/app-data";

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
