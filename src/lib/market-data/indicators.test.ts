import { describe, expect, it } from "vitest";

import { ema, sma, vwap } from "./indicators";

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

  it("resets VWAP when the New York trading session changes", () => {
    expect(
      vwap([
        {
          time: "2026-01-05T14:30:00.000Z",
          high: 12,
          low: 8,
          close: 10,
          volume: 100,
        },
        {
          time: "2026-01-05T14:31:00.000Z",
          high: 15,
          low: 9,
          close: 12,
          volume: 100,
        },
        {
          time: "2026-01-06T14:30:00.000Z",
          high: 22,
          low: 18,
          close: 20,
          volume: 200,
        },
      ]),
    ).toEqual([
      { time: "2026-01-05T14:30:00.000Z", value: 10 },
      { time: "2026-01-05T14:31:00.000Z", value: 11 },
      { time: "2026-01-06T14:30:00.000Z", value: 20 },
    ]);
  });
});
