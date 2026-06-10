import { describe, expect, it, vi } from "vitest";

import {
  getLatestSuccessfulTradeZeroSyncToDate,
  recordTradeZeroSyncQueued,
} from "@/lib/sync/job-runs";
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
        completed_at: null,
        error: null,
        user_id: "user-123",
        job_type: "tradezero_sync",
        status: "queued",
        idempotency_key: "tradezero-sync:user-123:manual:2026-05-28",
        metadata: {
          from_date: "2025-12-01",
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

  it("clears stale errors when a queued job is recorded again", async () => {
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

    await recordTradeZeroSyncQueued(event.data, { client: { from } });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        completed_at: null,
        error: null,
        status: "queued",
      }),
      { onConflict: "user_id,job_type,idempotency_key" },
    );
  });
});

describe("getLatestSuccessfulTradeZeroSyncToDate", () => {
  it("reads the to_date from the latest successful sync job", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        metadata: {
          to_date: "2026-06-07",
        },
      },
      error: null,
    });
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const statusEq = vi.fn(() => ({ order }));
    const jobTypeEq = vi.fn(() => ({ eq: statusEq }));
    const userEq = vi.fn(() => ({ eq: jobTypeEq }));
    const select = vi.fn(() => ({ eq: userEq }));
    const from = vi.fn(() => ({ select }));

    await expect(
      getLatestSuccessfulTradeZeroSyncToDate("user-123", { client: { from } }),
    ).resolves.toBe("2026-06-07");

    expect(from).toHaveBeenCalledWith("job_runs");
    expect(select).toHaveBeenCalledWith("metadata");
    expect(userEq).toHaveBeenCalledWith("user_id", "user-123");
    expect(jobTypeEq).toHaveBeenCalledWith("job_type", "tradezero_sync");
    expect(statusEq).toHaveBeenCalledWith("status", "succeeded");
    expect(order).toHaveBeenCalledWith("completed_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it("returns null when no successful sync job exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const limit = vi.fn(() => ({ maybeSingle }));
    const order = vi.fn(() => ({ limit }));
    const statusEq = vi.fn(() => ({ order }));
    const jobTypeEq = vi.fn(() => ({ eq: statusEq }));
    const userEq = vi.fn(() => ({ eq: jobTypeEq }));
    const select = vi.fn(() => ({ eq: userEq }));
    const from = vi.fn(() => ({ select }));

    await expect(
      getLatestSuccessfulTradeZeroSyncToDate("user-123", { client: { from } }),
    ).resolves.toBeNull();
  });
});
