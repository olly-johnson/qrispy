"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/inngest/client";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTradeZeroSyncEvent } from "@/lib/sync/events";
import {
  getLatestSuccessfulTradeZeroSyncToDate,
  recordTradeZeroSyncFailed,
  recordTradeZeroSyncQueued,
} from "@/lib/sync/job-runs";

export async function requestTradeZeroSync() {
  const user = await requireUser();
  const latestSuccessfulSyncToDate =
    await getLatestSuccessfulTradeZeroSyncToDate(user.id);
  const event = buildTradeZeroSyncEvent({
    userId: user.id,
    requestedBy: "manual",
    ...(latestSuccessfulSyncToDate ? { fromDate: latestSuccessfulSyncToDate } : {}),
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

export async function updateTradeStopLoss(stopGroupId: string, formData: FormData) {
  const user = await requireUser();
  const stopLossPrice = parsePositiveNumber(formData.get("stopLoss"));
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase
    .from("trade_stop_groups")
    .select("id,trade_id,direction,avg_entry_price,quantity")
    .eq("user_id", user.id)
    .eq("id", stopGroupId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Stop group not found");
  }

  const avgEntryPrice = numberOrNull(data.avg_entry_price);
  const quantity = numberOrNull(data.quantity);
  const direction = String(data.direction);
  const riskPerShare =
    avgEntryPrice == null
      ? null
      : direction === "SHORT"
        ? roundMoney(stopLossPrice - avgEntryPrice)
        : roundMoney(avgEntryPrice - stopLossPrice);
  const riskAmount =
    riskPerShare == null || quantity == null
      ? null
      : roundMoney(riskPerShare * quantity);

  const updateResult = await supabase
    .from("trade_stop_groups")
    .update({
      stop_loss_price: stopLossPrice,
      risk_per_share: riskPerShare,
      risk_amount: riskAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("id", stopGroupId);

  if (updateResult.error) {
    throw updateResult.error;
  }

  revalidatePath("/positions");
  revalidatePath("/dashboard");
  revalidatePath(`/trades/${String(data.trade_id)}`);
}

function parsePositiveNumber(value: FormDataEntryValue | null) {
  const parsed = typeof value === "string" ? Number(value) : NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Stop loss must be a positive number");
  }

  return roundMoney(parsed);
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
