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

const BACKFILL_START_DATE = "2025-12-01";

export function buildTradeZeroSyncEvent(input: {
  userId: string;
  requestedBy: "manual" | "schedule";
  fromDate?: string;
  now?: Date;
}): TradeZeroSyncRequestedEvent {
  const now = input.now ?? new Date();
  const toDate = now.toISOString().slice(0, 10);
  const fromDate =
    input.fromDate ??
    (input.requestedBy === "schedule" ? previousUtcDate(now) : BACKFILL_START_DATE);
  const idempotencyKey = `tradezero-sync:${input.userId}:${input.requestedBy}:${toDate}`;
  const eventId = `${idempotencyKey}:${now.toISOString()}`;

  return {
    name: "tradezero/sync.requested",
    id: eventId,
    data: {
      user_id: input.userId,
      requested_by: input.requestedBy,
      sync_scope: input.requestedBy === "manual" ? "backfill" : "daily",
      from_date: fromDate,
      to_date: toDate,
      idempotency_key: idempotencyKey,
    },
  };
}

function previousUtcDate(date: Date) {
  return new Date(date.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
