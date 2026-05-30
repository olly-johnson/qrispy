import { describe, expect, it } from "vitest";

import { buildTradeZeroSyncEvent } from "./events";

describe("buildTradeZeroSyncEvent", () => {
  it("creates a manual sync event for the configured backfill window", () => {
    const event = buildTradeZeroSyncEvent({
      userId: "user-1",
      requestedBy: "manual",
      now: new Date("2026-05-28T10:15:00.000Z"),
    });

    expect(event).toEqual({
      name: "tradezero/sync.requested",
      id: "tradezero-sync:user-1:manual:2026-05-28:2026-05-28T10:15:00.000Z",
      data: {
        user_id: "user-1",
        requested_by: "manual",
        sync_scope: "backfill",
        from_date: "2025-12-01",
        to_date: "2026-05-28",
        idempotency_key: "tradezero-sync:user-1:manual:2026-05-28",
      },
    });
  });

  it("keeps the daily job key stable while giving repeat requests distinct event ids", () => {
    const first = buildTradeZeroSyncEvent({
      userId: "user-1",
      requestedBy: "manual",
      now: new Date("2026-05-28T10:15:00.000Z"),
    });
    const second = buildTradeZeroSyncEvent({
      userId: "user-1",
      requestedBy: "manual",
      now: new Date("2026-05-28T10:16:00.000Z"),
    });

    expect(first.data.idempotency_key).toBe(second.data.idempotency_key);
    expect(first.id).not.toBe(second.id);
  });
});
