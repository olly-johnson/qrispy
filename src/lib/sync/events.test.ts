import { describe, expect, it } from "vitest";

import { buildTradeZeroSyncEvent } from "./events";

describe("buildTradeZeroSyncEvent", () => {
  it("creates an idempotent manual sync event for the configured backfill window", () => {
    const event = buildTradeZeroSyncEvent({
      userId: "user-1",
      requestedBy: "manual",
      now: new Date("2026-05-28T10:15:00.000Z"),
    });

    expect(event).toEqual({
      name: "tradezero/sync.requested",
      id: "tradezero-sync:user-1:manual:2026-05-28",
      data: {
        user_id: "user-1",
        requested_by: "manual",
        sync_scope: "backfill",
        from_date: "2026-01-01",
        to_date: "2026-05-28",
        idempotency_key: "tradezero-sync:user-1:manual:2026-05-28",
      },
    });
  });
});
