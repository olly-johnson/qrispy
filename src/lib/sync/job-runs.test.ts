import { describe, expect, it, vi } from "vitest";

import { recordTradeZeroSyncQueued } from "@/lib/sync/job-runs";
import { buildTradeZeroSyncEvent } from "@/lib/sync/events";

describe("recordTradeZeroSyncQueued", () => {
  it("persists a queued job run for a manual sync request", async () => {
    const event = buildTradeZeroSyncEvent({
      userId: "user-123",
      requestedBy: "manual",
      now: new Date("2026-05-28T09:30:00.000Z"),
    });
    const single = vi.fn().mockResolvedValue({
      data: { id: "job-123" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));

    await expect(
      recordTradeZeroSyncQueued(event.data, { client: { from } }),
    ).resolves.toEqual({ id: "job-123" });

    expect(from).toHaveBeenCalledWith("job_runs");
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "user-123",
        job_type: "tradezero_sync",
        status: "queued",
        idempotency_key: "tradezero-sync:user-123:manual:2026-05-28",
        metadata: {
          from_date: "2026-01-01",
          requested_by: "manual",
          sync_scope: "backfill",
          to_date: "2026-05-28",
        },
      },
      { onConflict: "user_id,job_type,idempotency_key" },
    );
    expect(select).toHaveBeenCalledWith("id");
    expect(single).toHaveBeenCalledOnce();
  });
});
