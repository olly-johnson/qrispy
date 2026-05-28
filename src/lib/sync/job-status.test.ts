import { describe, expect, it } from "vitest";

import { describeLatestSyncJob } from "@/lib/sync/job-status";

describe("describeLatestSyncJob", () => {
  it("summarizes the latest queued sync for the dashboard", () => {
    expect(
      describeLatestSyncJob({
        status: "queued",
        createdAt: "2026-05-28T17:20:00.000Z",
        completedAt: null,
        error: null,
      }),
    ).toBe("Latest sync queued at 28 May 2026, 18:20");
  });

  it("includes the error for failed syncs", () => {
    expect(
      describeLatestSyncJob({
        status: "failed",
        createdAt: "2026-05-28T17:20:00.000Z",
        completedAt: "2026-05-28T17:21:00.000Z",
        error: "Safety confirmations are missing",
      }),
    ).toBe("Latest sync failed at 28 May 2026, 18:21: Safety confirmations are missing");
  });
});
