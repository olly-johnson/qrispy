import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  deleteTradeReviewGroup: vi.fn(),
  removeTradeReviewGroupMember: vi.fn(),
  renameTradeReviewGroup: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

import { TradeReviewGroupDetail } from "./trade-review-group-detail";
import type { TradeReviewGroupDetail as TradeReviewGroupDetailData } from "@/lib/app-data";

describe("TradeReviewGroupDetail", () => {
  it("renders campaign totals and a chronological trade timeline", () => {
    const html = renderToStaticMarkup(<TradeReviewGroupDetail group={group} />);

    expect(html).toContain("CAR · 2–16 Jun 2026");
    expect(html).toContain("Campaign totals");
    expect(html).toContain("2 trades");
    expect(html).toContain("SHORT");
    expect(html).toContain("LONG");
    expect(html).toContain('href="/trades/trade-1"');
    expect(html).toContain("Remove from group");
  });
});

const group: TradeReviewGroupDetailData = {
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
  timeline: [
    trade("trade-1", "car-1", "SHORT", "2026-06-02T14:30:00.000Z"),
    trade("trade-2", "car-2", "LONG", "2026-06-16T14:30:00.000Z"),
  ],
};

function trade(id: string, reconstructionKey: string, direction: string, openedAt: string) {
  return {
    id,
    reconstructionKey,
    symbol: "CAR",
    direction,
    status: "CLOSED",
    openedAt,
    closedAt: "2026-06-16T18:00:00.000Z",
    entryQuantity: 100,
    maxAbsQuantity: 100,
    avgEntryPrice: 10,
    avgExitPrice: 11,
    realizedPnl: -100,
    totalFees: 2,
    fills: [],
  };
}
