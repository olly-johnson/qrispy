"use server";

import { revalidatePath } from "next/cache";

import { inngest } from "@/inngest/client";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTradeZeroSyncEvent } from "@/lib/sync/events";
import {
  type ReviewableTrade,
  validateTradeReviewGroup,
} from "@/lib/trade-review-groups";
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

export async function createTradeReviewGroup(formData: FormData): Promise<void> {
  const tradeIds = formData
    .getAll("tradeId")
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");

  if (new Set(tradeIds).size < 2) {
    throw new Error("Select at least two trades.");
  }

  const user = await requireUser();
  const supabase = await getReviewGroupSupabase();
  const { data: rows, error: tradesError } = await supabase
    .from("trades")
    .select("id,reconstruction_key,status,symbol")
    .eq("user_id", user.id)
    .in("id", tradeIds);

  if (tradesError) throw tradesError;
  if ((rows ?? []).length !== new Set(tradeIds).size) {
    throw new Error("One or more selected trades could not be found.");
  }

  const trades = (rows ?? []).map((row) => ({
    ...row,
    reconstructionKey: String(row.reconstruction_key ?? ""),
    status: String(row.status ?? ""),
    symbol: String(row.symbol ?? ""),
  }));
  const { symbol } = validateTradeReviewGroup(trades as unknown as ReviewableTrade[]);
  const reconstructionKeys = trades.map((trade) => trade.reconstructionKey);
  const { data: existingMembers, error: memberLookupError } = await supabase
    .from("trade_review_group_members")
    .select("reconstruction_key")
    .eq("user_id", user.id)
    .in("reconstruction_key", reconstructionKeys);

  if (memberLookupError) throw memberLookupError;
  if ((existingMembers ?? []).length > 0) {
    throw new Error("One or more selected trades are already in a review group.");
  }

  const { data: group, error: groupError } = await supabase
    .from("trade_review_groups")
    .insert({ user_id: user.id, symbol })
    .select("id")
    .single();
  if (groupError) throw groupError;
  if (!group) throw new Error("Unable to create trade review group.");

  const { error: insertMembersError } = await supabase
    .from("trade_review_group_members")
    .insert(
      reconstructionKeys.map((reconstructionKey) => ({
        group_id: group.id,
        user_id: user.id,
        reconstruction_key: reconstructionKey,
      })),
    );
  if (insertMembersError) {
    await supabase
      .from("trade_review_groups")
      .delete()
      .eq("user_id", user.id)
      .eq("id", group.id);
    throw insertMembersError;
  }

  revalidatePath("/trades");
}

export async function renameTradeReviewGroup(groupId: string, formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await getReviewGroupSupabase();
  const name = formData.get("name");
  const customName = typeof name === "string" && name.trim() ? name.trim() : null;
  const { error } = await supabase
    .from("trade_review_groups")
    .update({ custom_name: customName, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", groupId);
  if (error) throw error;

  revalidateReviewGroupPaths(groupId);
}

export async function removeTradeReviewGroupMember(
  groupId: string,
  reconstructionKey: string,
): Promise<void> {
  const user = await requireUser();
  const supabase = await getReviewGroupSupabase();
  const { error: removeError } = await supabase
    .from("trade_review_group_members")
    .delete()
    .eq("user_id", user.id)
    .eq("group_id", groupId)
    .eq("reconstruction_key", reconstructionKey);
  if (removeError) throw removeError;

  const { data: remaining, error: countError } = await supabase
    .from("trade_review_group_members")
    .select("reconstruction_key")
    .eq("user_id", user.id)
    .eq("group_id", groupId);
  if (countError) throw countError;
  if ((remaining ?? []).length < 2) {
    const { error: deleteError } = await supabase
      .from("trade_review_groups")
      .delete()
      .eq("user_id", user.id)
      .eq("id", groupId);
    if (deleteError) throw deleteError;
  }

  revalidateReviewGroupPaths(groupId);
}

export async function deleteTradeReviewGroup(groupId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await getReviewGroupSupabase();
  const { error } = await supabase
    .from("trade_review_groups")
    .delete()
    .eq("user_id", user.id)
    .eq("id", groupId);
  if (error) throw error;

  revalidateReviewGroupPaths(groupId);
}

function revalidateReviewGroupPaths(groupId: string) {
  revalidatePath("/trades");
  revalidatePath(`/trades/groups/${groupId}`);
}

async function getReviewGroupSupabase() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
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
