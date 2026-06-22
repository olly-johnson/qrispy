import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  createTradeReviewGroup: vi.fn(),
}));

import { TradeHistoryTable } from "./trade-history-table";
import type { TradeHistoryItem } from "@/lib/trade-review-groups";

describe("TradeHistoryTable", () => {
  it("renders selectable closed trades and collapsed review groups", () => {
    const html = renderToStaticMarkup(<TradeHistoryTable items={items} />);

    expect(html).toContain('aria-label="Select CAR trade-1"');
    expect(html).toContain("Group selected (0)");
    expect(html).toContain("disabled");
    expect(html).toContain("CAR · 2–16 Jun 2026");
    expect(html).toContain('href="/trades/groups/group-1"');
    expect(html).toContain("2 trades");
  });
});

const items: TradeHistoryItem[] = [
  {
    kind: "trade",
    trade: {
      id: "trade-1",
      reconstructionKey: "car-1",
      symbol: "CAR",
      direction: "SHORT",
      status: "CLOSED",
      openedAt: "2026-06-18T14:30:00.000Z",
      closedAt: "2026-06-18T18:00:00.000Z",
      entryQuantity: 100,
      maxAbsQuantity: 100,
      avgEntryPrice: 10,
      avgExitPrice: 11,
      realizedPnl: -100,
      totalFees: 2,
    },
  },
  {
    kind: "group",
    group: {
      id: "group-1",
      customName: null,
      symbol: "CAR",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:00.000Z",
      label: "CAR · 2–16 Jun 2026",
      openedAt: "2026-06-02T14:30:00.000Z",
      closedAt: "2026-06-16T18:00:00.000Z",
      tradeCount: 2,
      realizedPnl: -350,
      totalFees: 8,
    },
  },
];
