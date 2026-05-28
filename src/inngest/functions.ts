import { inngest } from "@/inngest/client";
import { runTradeZeroSync } from "@/lib/sync/tradezero-sync";

export const tradeZeroSync = inngest.createFunction(
  {
    id: "tradezero-sync",
    concurrency: {
      limit: 1,
      key: "event.data.user_id",
    },
    triggers: [{ event: "tradezero/sync.requested" }],
  },
  async ({ event, step }) => {
    return step.run("sync-tradezero", async () =>
      runTradeZeroSync({
        userId: event.data.user_id,
        fromDate: event.data.from_date,
        toDate: event.data.to_date,
        idempotencyKey: event.data.idempotency_key,
      }),
    );
  },
);
