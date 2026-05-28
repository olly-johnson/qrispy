"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/inngest/client";
import { requireUser } from "@/lib/auth/session";
import { buildTradeZeroSyncEvent } from "@/lib/sync/events";

export async function requestTradeZeroSync() {
  const user = await requireUser();
  const event = buildTradeZeroSyncEvent({
    userId: user.id,
    requestedBy: "manual",
  });

  await inngest.send(event);
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
}
