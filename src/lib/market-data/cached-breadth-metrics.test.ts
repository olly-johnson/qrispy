import { describe, expect, it, vi } from "vitest";

import { readCachedBreadthMetrics } from "./cached-breadth-metrics";

describe("readCachedBreadthMetrics", () => {
  it("reads cached breadth metrics from the Supabase RPC", async () => {
    const client = fakeRpcClient([{
      down_13_in_34_days: 7,
      ratio_10_day: 1.8,
      ratio_5_day: 1.2,
      t2108: 55.25,
      t2108_covered: 4321,
      up_13_in_34_days: 11,
    }]);

    await expect(
      readCachedBreadthMetrics({
        asOfDate: "2026-06-11",
        client,
        symbols: ["acme", "soft"],
        todayDown4Percent: 3,
        todayUp4Percent: 4,
      }),
    ).resolves.toEqual({
      down13In34Days: 7,
      historyEndDate: null,
      isStale: false,
      ratio10Day: 1.8,
      ratio5Day: 1.2,
      t2108: 55.25,
      t2108Covered: 4321,
      up13In34Days: 11,
    });
    expect(client.rpc).toHaveBeenCalledWith("calculate_cached_breadth_metrics", {
      as_of_date: "2026-06-11",
      symbols: ["ACME", "SOFT"],
      today_down4: 3,
      today_up4: 4,
    });
  });

  it("returns empty metrics when the RPC is unavailable", async () => {
    const client = fakeRpcClient(null, new Error("missing function"));

    await expect(
      readCachedBreadthMetrics({
        asOfDate: "2026-06-11",
        client,
        symbols: ["ACME"],
        todayDown4Percent: 0,
        todayUp4Percent: 0,
      }),
    ).resolves.toEqual({
      down13In34Days: null,
      historyEndDate: null,
      isStale: false,
      ratio10Day: null,
      ratio5Day: null,
      t2108: null,
      t2108Covered: 0,
      up13In34Days: null,
    });
  });

  it("hides stale cached historical metrics and keeps the latest cache date", async () => {
    const client = fakeRpcClient({
      down_13_in_34_days: 1040,
      history_end_date: "2026-06-10",
      is_stale: true,
      ratio_10_day: 0.7,
      ratio_5_day: 0.56,
      t2108: 47.1,
      t2108_covered: 4098,
      up_13_in_34_days: 732,
    });

    await expect(
      readCachedBreadthMetrics({
        asOfDate: "2026-06-15",
        client,
        symbols: ["ACME"],
        todayDown4Percent: 325,
        todayUp4Percent: 483,
      }),
    ).resolves.toEqual({
      down13In34Days: null,
      historyEndDate: "2026-06-10",
      isStale: true,
      ratio10Day: null,
      ratio5Day: null,
      t2108: null,
      t2108Covered: 0,
      up13In34Days: null,
    });
  });
});

function fakeRpcClient(data: Record<string, unknown> | null, error: unknown = null) {
  return {
    rpc: vi.fn(() => Promise.resolve({ data, error })),
  };
}
