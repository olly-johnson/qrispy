export type TradeZeroSyncRequestedEvent = {
  name: "tradezero/sync.requested";
  id: string;
  data: {
    user_id: string;
    requested_by: "manual" | "schedule";
    sync_scope: "daily" | "backfill";
    from_date: string;
    to_date: string;
    idempotency_key: string;
  };
};

const BACKFILL_START_DATE = "2026-01-01";

export function buildTradeZeroSyncEvent(input: {
  userId: string;
  requestedBy: "manual" | "schedule";
  now?: Date;
}): TradeZeroSyncRequestedEvent {
  const now = input.now ?? new Date();
  const toDate = now.toISOString().slice(0, 10);
  const idempotencyKey = `tradezero-sync:${input.userId}:${input.requestedBy}:${toDate}`;
  const eventId = `${idempotencyKey}:${now.toISOString()}`;

  return {
    name: "tradezero/sync.requested",
    id: eventId,
    data: {
      user_id: input.userId,
      requested_by: input.requestedBy,
      sync_scope: input.requestedBy === "manual" ? "backfill" : "daily",
      from_date: BACKFILL_START_DATE,
      to_date: toDate,
      idempotency_key: idempotencyKey,
    },
  };
}
