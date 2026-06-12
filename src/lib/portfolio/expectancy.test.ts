import { describe, expect, it } from "vitest";

import {
  buildTradeExpectancySnapshots,
  type ExpectancyTradeInput,
} from "./expectancy";

describe("buildTradeExpectancySnapshots", () => {
  it("computes all-trade batting average and gain/loss metrics from eligible closed trades", () => {
    const snapshots = buildTradeExpectancySnapshots([
      trade({
        id: "older-win",
        openedAt: "2026-01-01T10:00:00.000Z",
        closedAt: "2026-01-01T16:00:00.000Z",
        realizedPnl: 100,
      }),
      trade({
        id: "loss",
        openedAt: "2026-01-02T10:00:00.000Z",
        closedAt: "2026-01-02T16:00:00.000Z",
        realizedPnl: -50,
      }),
      trade({
        id: "open",
        status: "OPEN",
        openedAt: "2026-01-03T10:00:00.000Z",
        closedAt: null,
        realizedPnl: 999,
      }),
      trade({
        id: "null-pnl",
        openedAt: "2026-01-04T10:00:00.000Z",
        closedAt: "2026-01-04T16:00:00.000Z",
        realizedPnl: null,
      }),
    ]);

    expect(snapshots.all).toEqual({
      label: "All trades",
      tradeCount: 2,
      winCount: 1,
      battingAverage: 0.5,
      averageGain: 100,
      averageLoss: 50,
      gainLossRatio: 2,
    });
  });

  it("uses the 30 most recent eligible closed trades for the recent snapshot", () => {
    const oldestWinner = trade({
      id: "oldest-winner",
      openedAt: "2026-01-01T10:00:00.000Z",
      closedAt: "2026-01-01T16:00:00.000Z",
      realizedPnl: 500,
    });
    const newerLosses = Array.from({ length: 30 }, (_, index) =>
      trade({
        id: `newer-loss-${index}`,
        openedAt: `2026-02-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
        closedAt: `2026-02-${String(index + 1).padStart(2, "0")}T16:00:00.000Z`,
        realizedPnl: -10,
      }),
    );

    const snapshots = buildTradeExpectancySnapshots([
      oldestWinner,
      ...newerLosses,
    ]);

    expect(snapshots.all.tradeCount).toBe(31);
    expect(snapshots.all.winCount).toBe(1);
    expect(snapshots.last30).toMatchObject({
      label: "Last 30",
      tradeCount: 30,
      winCount: 0,
      battingAverage: 0,
      averageGain: null,
      averageLoss: 10,
      gainLossRatio: null,
    });
  });

  it("falls back to opened date when closed date is missing", () => {
    const snapshots = buildTradeExpectancySnapshots([
      trade({
        id: "newer-by-open",
        openedAt: "2026-03-02T10:00:00.000Z",
        closedAt: null,
        realizedPnl: 100,
      }),
      trade({
        id: "older-by-close",
        openedAt: "2026-03-01T10:00:00.000Z",
        closedAt: "2026-03-01T16:00:00.000Z",
        realizedPnl: -50,
      }),
    ]);

    expect(snapshots.last30.tradeCount).toBe(2);
    expect(snapshots.last30.battingAverage).toBe(0.5);
  });

  it("returns unavailable loss and ratio values when a snapshot has no losses", () => {
    const snapshots = buildTradeExpectancySnapshots([
      trade({ id: "win-1", realizedPnl: 125 }),
      trade({ id: "win-2", realizedPnl: 75 }),
    ]);

    expect(snapshots.all).toMatchObject({
      tradeCount: 2,
      winCount: 2,
      battingAverage: 1,
      averageGain: 100,
      averageLoss: null,
      gainLossRatio: null,
    });
  });

  it("returns empty snapshots when there are no eligible trades", () => {
    const snapshots = buildTradeExpectancySnapshots([
      trade({ id: "open", status: "OPEN", closedAt: null, realizedPnl: 50 }),
      trade({ id: "missing", realizedPnl: null }),
    ]);

    expect(snapshots.all).toEqual({
      label: "All trades",
      tradeCount: 0,
      winCount: 0,
      battingAverage: null,
      averageGain: null,
      averageLoss: null,
      gainLossRatio: null,
    });
    expect(snapshots.last30).toEqual({
      label: "Last 30",
      tradeCount: 0,
      winCount: 0,
      battingAverage: null,
      averageGain: null,
      averageLoss: null,
      gainLossRatio: null,
    });
  });
});

function trade(
  input: Partial<ExpectancyTradeInput> & { id: string },
): ExpectancyTradeInput {
  return {
    status: "CLOSED",
    openedAt: "2026-01-01T10:00:00.000Z",
    closedAt: "2026-01-01T16:00:00.000Z",
    realizedPnl: 0,
    ...input,
  };
}
