import { tradeHeadlinePnlValue } from "@/lib/trades/display";

describe("tradeHeadlinePnlValue", () => {
  it("uses stop-loss P&L for open trades", () => {
    expect(
      tradeHeadlinePnlValue({
        status: "OPEN",
        realizedPnl: 207,
        stopGroups: [
          { stopUnrealizedPnl: -15 },
          { stopUnrealizedPnl: 4 },
        ],
      }),
    ).toBe(-11);
  });

  it("keeps realized P&L for closed trades", () => {
    expect(
      tradeHeadlinePnlValue({
        status: "CLOSED",
        realizedPnl: 207,
        stopGroups: [{ stopUnrealizedPnl: -15 }],
      }),
    ).toBe(207);
  });

  it("stays empty for open trades without stop-loss P&L", () => {
    expect(
      tradeHeadlinePnlValue({
        status: "OPEN",
        realizedPnl: 207,
        stopGroups: [{ stopUnrealizedPnl: null }],
      }),
    ).toBeNull();
  });
});
