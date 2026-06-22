import { describe, expect, it } from "vitest";

import type { ReviewableTrade } from "@/lib/trade-review-groups";
import {
  buildTradeHistoryItems,
  formatTradeReviewGroupLabel,
  getTradeReviewSelection,
  validateTradeReviewGroup,
} from "@/lib/trade-review-groups";

const carLong = trade({
  id: "car-long",
  reconstructionKey: "car-long-key",
  direction: "LONG",
  openedAt: "2026-06-02T14:30:00.000Z",
  closedAt: "2026-06-04T16:00:00.000Z",
  realizedPnl: -50,
  totalFees: 2,
});
const carShort = trade({
  id: "car-short",
  reconstructionKey: "car-short-key",
  direction: "SHORT",
  openedAt: "2026-06-16T14:30:00.000Z",
  closedAt: "2026-06-16T17:00:00.000Z",
  realizedPnl: -30,
  totalFees: 3,
});
const amdTrade = trade({
  id: "amd",
  reconstructionKey: "amd-key",
  symbol: "AMD",
  openedAt: "2026-06-12T14:30:00.000Z",
  closedAt: "2026-06-12T16:00:00.000Z",
  realizedPnl: 15,
  totalFees: 1,
});
const openCarTrade = trade({
  id: "car-open",
  reconstructionKey: "car-open-key",
  status: "OPEN",
  openedAt: "2026-06-20T14:30:00.000Z",
  closedAt: null,
});

describe("validateTradeReviewGroup", () => {
  it("allows closed trades with the same symbol even when their directions differ", () => {
    expect(validateTradeReviewGroup([carLong, carShort])).toEqual({ symbol: "CAR" });
  });

  it("requires at least two trades", () => {
    expect(() => validateTradeReviewGroup([carLong])).toThrow(
      "Select at least two trades.",
    );
  });

  it("rejects open trades", () => {
    expect(() => validateTradeReviewGroup([carLong, openCarTrade])).toThrow(
      "Only closed trades can be grouped.",
    );
  });

  it("rejects trades with different symbols", () => {
    expect(() => validateTradeReviewGroup([carLong, amdTrade])).toThrow(
      "Selected trades must use the same symbol.",
    );
  });

  it("rejects duplicate and missing reconstruction keys", () => {
    expect(() => validateTradeReviewGroup([carLong, { ...carLong }])).toThrow(
      "Each selected trade must be unique.",
    );
    expect(() => validateTradeReviewGroup([carLong, { ...carShort, reconstructionKey: "" }])).toThrow(
      "Each selected trade must have a reconstruction key.",
    );
  });
});

describe("formatTradeReviewGroupLabel", () => {
  it("uses a trimmed custom name when one exists", () => {
    expect(
      formatTradeReviewGroupLabel({
        customName: "  CAR re-short thesis  ",
        symbol: "CAR",
        openedAt: carLong.openedAt,
        closedAt: carShort.closedAt!,
      }),
    ).toBe("CAR re-short thesis");
  });

  it("builds a compact default symbol and date-range label", () => {
    expect(
      formatTradeReviewGroupLabel({
        customName: "  ",
        symbol: "CAR",
        openedAt: carLong.openedAt,
        closedAt: carShort.closedAt!,
      }),
    ).toBe("CAR · 2–16 Jun 2026");
  });
});

describe("buildTradeHistoryItems", () => {
  it("collapses active members into one summed group row", () => {
    const items = buildTradeHistoryItems({
      trades: [carLong, carShort, amdTrade],
      groups: [group()],
      members: [
        { groupId: "group-1", reconstructionKey: carLong.reconstructionKey },
        { groupId: "group-1", reconstructionKey: carShort.reconstructionKey },
      ],
    });

    expect(items).toEqual([
      { kind: "trade", trade: amdTrade },
      {
        kind: "group",
        group: expect.objectContaining({
          id: "group-1",
          label: "CAR · 2–16 Jun 2026",
          openedAt: carLong.openedAt,
          closedAt: carShort.closedAt,
          tradeCount: 2,
          realizedPnl: -80,
          totalFees: 5,
        }),
      },
    ]);
  });

  it("does not hide current trades or create a group for stale memberships", () => {
    expect(
      buildTradeHistoryItems({
        trades: [carLong, amdTrade],
        groups: [group()],
        members: [{ groupId: "group-1", reconstructionKey: "stale-key" }],
      }),
    ).toEqual([
      { kind: "trade", trade: amdTrade },
      { kind: "trade", trade: carLong },
    ]);
  });

  it("leaves a formerly grouped trade visible when it now resolves as open", () => {
    expect(
      buildTradeHistoryItems({
        trades: [openCarTrade],
        groups: [group()],
        members: [
          { groupId: "group-1", reconstructionKey: openCarTrade.reconstructionKey },
        ],
      }),
    ).toEqual([{ kind: "trade", trade: openCarTrade }]);
  });

  it("restores the remaining closed member when its paired membership now resolves as open", () => {
    expect(
      buildTradeHistoryItems({
        trades: [carLong, openCarTrade],
        groups: [group()],
        members: [
          { groupId: "group-1", reconstructionKey: carLong.reconstructionKey },
          { groupId: "group-1", reconstructionKey: openCarTrade.reconstructionKey },
        ],
      }),
    ).toEqual([
      { kind: "trade", trade: openCarTrade },
      { kind: "trade", trade: carLong },
    ]);
  });

  it("returns null numeric group totals only when every active member value is null", () => {
    const first = { ...carLong, realizedPnl: null, totalFees: null };
    const second = { ...carShort, realizedPnl: null, totalFees: 3 };
    const items = buildTradeHistoryItems({
      trades: [first, second],
      groups: [group()],
      members: [
        { groupId: "group-1", reconstructionKey: first.reconstructionKey },
        { groupId: "group-1", reconstructionKey: second.reconstructionKey },
      ],
    });

    expect(items[0]).toMatchObject({
      kind: "group",
      group: { realizedPnl: null, totalFees: 3 },
    });
  });
});

describe("getTradeReviewSelection", () => {
  it("accepts selected closed individual rows with the same ticker and mixed directions", () => {
    expect(
      getTradeReviewSelection(
        [
          { kind: "trade", trade: carLong },
          { kind: "trade", trade: carShort },
          { kind: "group", group: { ...group(), label: "Existing CAR group", openedAt: carLong.openedAt, closedAt: carShort.closedAt!, tradeCount: 2, realizedPnl: -80, totalFees: 5 } },
        ],
        ["car-short", "car-long"],
      ),
    ).toEqual({ selectedTradeIds: ["car-long", "car-short"], error: null });
  });

  it("returns an eligibility error for too few, open, or cross-ticker selections", () => {
    expect(getTradeReviewSelection([{ kind: "trade", trade: carLong }], ["car-long"])).toMatchObject({ error: "Select at least two trades." });
    expect(getTradeReviewSelection([{ kind: "trade", trade: carLong }, { kind: "trade", trade: openCarTrade }], ["car-long", "car-open"])).toMatchObject({ error: "Only closed trades can be grouped." });
    expect(getTradeReviewSelection([{ kind: "trade", trade: carLong }, { kind: "trade", trade: amdTrade }], ["car-long", "amd"])).toMatchObject({ error: "Selected trades must use the same symbol." });
  });
});

function group() {
  return {
    id: "group-1",
    customName: null,
    symbol: "CAR",
    createdAt: "2026-06-16T18:00:00.000Z",
    updatedAt: "2026-06-16T18:00:00.000Z",
  };
}

function trade(input: Partial<ReviewableTrade> & Pick<ReviewableTrade, "id" | "reconstructionKey">): ReviewableTrade {
  return {
    id: input.id,
    reconstructionKey: input.reconstructionKey,
    symbol: input.symbol ?? "CAR",
    direction: input.direction ?? "LONG",
    status: input.status ?? "CLOSED",
    openedAt: input.openedAt ?? "2026-06-01T14:30:00.000Z",
    closedAt: input.closedAt === undefined ? "2026-06-01T16:00:00.000Z" : input.closedAt,
    entryQuantity: input.entryQuantity ?? 10,
    maxAbsQuantity: input.maxAbsQuantity ?? 10,
    avgEntryPrice: input.avgEntryPrice ?? 10,
    avgExitPrice: input.avgExitPrice ?? 9,
    realizedPnl: input.realizedPnl ?? null,
    totalFees: input.totalFees ?? null,
  };
}
