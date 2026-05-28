"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/inngest/client";
import { requireUser } from "@/lib/auth/session";
import { buildTradeZeroSyncEvent } from "@/lib/sync/events";
import {
  recordTradeZeroSyncFailed,
  recordTradeZeroSyncQueued,
} from "@/lib/sync/job-runs";

export async function requestTradeZeroSync() {
  const user = await requireUser();
  const event = buildTradeZeroSyncEvent({
    userId: user.id,
    requestedBy: "manual",
  });

  const jobRun = await recordTradeZeroSyncQueued(event.data);

  try {
    await inngest.send(event);
  } catch (error) {
    await recordTradeZeroSyncFailed(event.data, error, { id: jobRun?.id });
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath("/jobs");
}
