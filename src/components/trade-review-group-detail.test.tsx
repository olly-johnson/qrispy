/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  deleteTradeReviewGroup: vi.fn(),
  loadTradeReviewMemberCharts: vi.fn(),
  removeTradeReviewGroupMember: vi.fn(),
  renameTradeReviewGroup: vi.fn(),
}));

vi.mock("@/components/trade-chart-panel", () => ({
  TradeChartPanel: ({ title }: { title: string }) => <div data-testid="member-chart">{title}</div>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

import { TradeReviewGroupDetail } from "./trade-review-group-detail";
import { loadTradeReviewMemberCharts } from "@/app/actions";
import type { TradeReviewGroupDetail as TradeReviewGroupDetailData } from "@/lib/app-data";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

  it("loads a member chart only when expanded and caches it when reopened", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    vi.mocked(loadTradeReviewMemberCharts).mockResolvedValue({ charts: [], error: null });

    await act(async () => {
      root.render(<TradeReviewGroupDetail group={group} />);
    });

    const viewButton = button(container, "View chart");
    expect(loadTradeReviewMemberCharts).not.toHaveBeenCalled();

    await act(async () => {
      viewButton.click();
    });

    expect(loadTradeReviewMemberCharts).toHaveBeenCalledWith("group-1", "car-1");
    expect(container.textContent).toContain("Original trade chart");
    expect(button(container, "Hide chart")).toBeTruthy();

    await act(async () => {
      button(container, "Hide chart").click();
    });

    await act(async () => {
      button(container, "View chart").click();
    });

    expect(loadTradeReviewMemberCharts).toHaveBeenCalledTimes(1);
    root.unmount();
  });
});

function button(container: HTMLElement, text: string) {
  const element = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === text,
  );
  if (!element) throw new Error(`Missing ${text} button`);
  return element;
}

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
