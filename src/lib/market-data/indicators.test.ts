import { describe, expect, it } from "vitest";

import { ema, sma } from "./indicators";

describe("market data indicators", () => {
  const bars = [1, 2, 3, 4, 5].map((close, index) => ({
    time: `2026-01-0${index + 1}`,
    close,
  }));

  it("calculates simple moving averages after enough bars are available", () => {
    expect(sma(bars, 3)).toEqual([
      { time: "2026-01-03", value: 2 },
      { time: "2026-01-04", value: 3 },
      { time: "2026-01-05", value: 4 },
    ]);
  });

  it("calculates exponential moving averages from the first full-period average", () => {
    expect(ema(bars, 3)).toEqual([
      { time: "2026-01-03", value: 2 },
      { time: "2026-01-04", value: 3 },
      { time: "2026-01-05", value: 4 },
    ]);
  });
});
