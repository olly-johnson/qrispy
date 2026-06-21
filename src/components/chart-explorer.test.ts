import { describe, expect, it } from "vitest";

import { INTRADAY_TABS, initialLogicalRange } from "./chart-explorer";

describe("chart explorer renderer", () => {
  it("offers hourly, five-minute, and one-minute intraday tabs", () => {
    expect(INTRADAY_TABS).toEqual([
      { id: "1h", label: "1 hour" },
      { id: "5m", label: "5 minute" },
      { id: "1m", label: "1 minute" },
    ]);
  });

  it("starts each chart at its selected range index", () => {
    expect(initialLogicalRange({ startIndex: 12, visibleBars: 50 })).toEqual({
      from: 12,
      to: 62,
    });
  });
});
