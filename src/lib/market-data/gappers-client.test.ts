import { describe, expect, it } from "vitest";

import { DEFAULT_GAPPERS_FILTERS, filterGappersRows } from "./gappers-client";
import type { GappersRow } from "./gappers";

describe("filterGappersRows", () => {
  it("uses default price, gap, dollar volume, and type filters", () => {
    expect(
      filterGappersRows(
        [
          row("ACME", "Stock", 1, 6, 100_000),
          row("LOWP", "Stock", 0.5, 20, 200_000),
          row("LOWG", "Stock", 4, 5.9, 200_000),
          row("LOWD", "ETF", 4, 8, 99_999),
          row("IETF", "ETF", 4, 8, 250_000),
        ],
        DEFAULT_GAPPERS_FILTERS,
      ).map((item) => item.symbol),
    ).toEqual(["ACME", "IETF"]);
  });

  it("can hide stocks or ETFs independently", () => {
    const rows = [row("ACME", "Stock", 1, 6, 100_000), row("IETF", "ETF", 4, 8, 250_000)];

    expect(
      filterGappersRows(rows, {
        ...DEFAULT_GAPPERS_FILTERS,
        includeEtfs: false,
      }).map((item) => item.symbol),
    ).toEqual(["ACME"]);

    expect(
      filterGappersRows(rows, {
        ...DEFAULT_GAPPERS_FILTERS,
        includeStocks: false,
      }).map((item) => item.symbol),
    ).toEqual(["IETF"]);
  });
});

function row(
  symbol: string,
  securityType: GappersRow["securityType"],
  price: number,
  gapPercent: number,
  activeDollarVolume: number,
): GappersRow {
  return {
    activeDollarVolume,
    activeVolume: 10_000,
    gapPercent,
    lastUpdatedAt: null,
    name: symbol,
    previousClose: 1,
    price,
    securityType,
    symbol,
  };
}
