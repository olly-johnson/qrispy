import { dashboardPositionUnrealizedValue } from "@/lib/positions/display";

describe("dashboardPositionUnrealizedValue", () => {
  it("uses the stop-loss unrealized total instead of market value", () => {
    expect(
      dashboardPositionUnrealizedValue({
        stopUnrealizedPnl: -37,
        marketValue: 628,
      }),
    ).toBe(-37);
  });

  it("stays empty when no stop-loss total is available", () => {
    expect(
      dashboardPositionUnrealizedValue({
        stopUnrealizedPnl: null,
        marketValue: 628,
      }),
    ).toBeNull();
  });
});
