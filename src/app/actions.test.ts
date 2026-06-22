import { revalidatePath } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { inngest } from "@/inngest/client";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildTradeZeroSyncEvent } from "@/lib/sync/events";
import {
  getLatestSuccessfulTradeZeroSyncToDate,
  recordTradeZeroSyncQueued,
} from "@/lib/sync/job-runs";
import {
  createTradeReviewGroup,
  deleteTradeReviewGroup,
  removeTradeReviewGroupMember,
  renameTradeReviewGroup,
  requestTradeZeroSync,
  updateTradeStopLoss,
} from "./actions";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/sync/events", () => ({
  buildTradeZeroSyncEvent: vi.fn(),
}));

vi.mock("@/lib/sync/job-runs", () => ({
  getLatestSuccessfulTradeZeroSyncToDate: vi.fn(),
  recordTradeZeroSyncQueued: vi.fn(),
  recordTradeZeroSyncFailed: vi.fn(),
}));

describe("requestTradeZeroSync", () => {
  it("creates a manual sync event from the latest successful sync date", async () => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "user-1",
      email: "owner@example.com",
    });
    vi.mocked(getLatestSuccessfulTradeZeroSyncToDate).mockResolvedValue(
      "2026-06-07",
    );
    vi.mocked(buildTradeZeroSyncEvent).mockReturnValue({
      name: "tradezero/sync.requested",
      id: "event-1",
      data: {
        user_id: "user-1",
        requested_by: "manual",
        sync_scope: "backfill",
        from_date: "2026-06-07",
        to_date: "2026-06-10",
        idempotency_key: "tradezero-sync:user-1:manual:2026-06-10",
      },
    });
    vi.mocked(recordTradeZeroSyncQueued).mockResolvedValue({ id: "job-1" });
    vi.mocked(inngest.send).mockResolvedValue({ ids: ["event-1"] });

    await requestTradeZeroSync();

    expect(getLatestSuccessfulTradeZeroSyncToDate).toHaveBeenCalledWith("user-1");
    expect(buildTradeZeroSyncEvent).toHaveBeenCalledWith({
      userId: "user-1",
      requestedBy: "manual",
      fromDate: "2026-06-07",
    });
    expect(recordTradeZeroSyncQueued).toHaveBeenCalledWith({
      user_id: "user-1",
      requested_by: "manual",
      sync_scope: "backfill",
      from_date: "2026-06-07",
      to_date: "2026-06-10",
      idempotency_key: "tradezero-sync:user-1:manual:2026-06-10",
    });
    expect(inngest.send).toHaveBeenCalledWith({
      name: "tradezero/sync.requested",
      id: "event-1",
      data: {
        user_id: "user-1",
        requested_by: "manual",
        sync_scope: "backfill",
        from_date: "2026-06-07",
        to_date: "2026-06-10",
        idempotency_key: "tradezero-sync:user-1:manual:2026-06-10",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/jobs");
  });
});

describe("updateTradeStopLoss", () => {
  it("updates one authenticated stop group and recalculates risk", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1", email: "test@example.com" });

    const maybeSingle = vi.fn().mockResolvedValue({
        data: {
          id: "group-1",
          trade_id: "trade-1",
          user_id: "user-1",
          direction: "LONG",
        avg_entry_price: 90,
        quantity: 10,
      },
      error: null,
    });
    const selectSecondEq = vi.fn(() => ({ maybeSingle }));
    const selectFirstEq = vi.fn(() => ({ eq: selectSecondEq }));
    const select = vi.fn(() => ({ eq: selectFirstEq }));
    const updateSecondEq = vi.fn().mockResolvedValue({ error: null });
    const updateFirstEq = vi.fn(() => ({ eq: updateSecondEq }));
    const update = vi.fn(() => ({ eq: updateFirstEq }));
    const from = vi.fn(() => ({ select, update }));

    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);

    const formData = new FormData();
    formData.set("stopLoss", "86.25");

    await updateTradeStopLoss("group-1", formData);

    expect(from).toHaveBeenCalledWith("trade_stop_groups");
    expect(select).toHaveBeenCalledWith("id,trade_id,direction,avg_entry_price,quantity");
    expect(selectFirstEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(selectSecondEq).toHaveBeenCalledWith("id", "group-1");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        stop_loss_price: 86.25,
        risk_per_share: 3.75,
        risk_amount: 37.5,
      }),
    );
    expect(updateFirstEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(updateSecondEq).toHaveBeenCalledWith("id", "group-1");
    expect(revalidatePath).toHaveBeenCalledWith("/positions");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/trades/trade-1");
  });
});

describe("trade review group actions", () => {
  it("creates an authenticated same-symbol group with mixed directions", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    const { from, calls } = reviewGroupClient({
      trades: [
        reviewTrade("trade-1", "car-long", "LONG"),
        reviewTrade("trade-2", "car-short", "SHORT"),
      ],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);

    await createTradeReviewGroup(formDataWith(["trade-1", "trade-2"]));

    expect(calls.groupInsert).toHaveBeenCalledWith({ user_id: "user-1", symbol: "CAR" });
    expect(calls.memberInsert).toHaveBeenCalledWith([
      { group_id: "group-1", user_id: "user-1", reconstruction_key: "car-long" },
      { group_id: "group-1", user_id: "user-1", reconstruction_key: "car-short" },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/trades");
  });

  it("rejects an insufficient selection before creating a group", async () => {
    await expect(createTradeReviewGroup(formDataWith(["trade-1"]))).rejects.toThrow(
      "Select at least two trades.",
    );
  });

  it("rejects selected trades with different symbols", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    const { from } = reviewGroupClient({
      trades: [reviewTrade("trade-1", "car", "LONG"), reviewTrade("trade-2", "amd", "SHORT", "AMD")],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);

    await expect(createTradeReviewGroup(formDataWith(["trade-1", "trade-2"]))).rejects.toThrow(
      "Selected trades must use the same symbol.",
    );
  });

  it("renames an owned group with trimmed text and revalidates its route", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    const { from, calls } = reviewGroupClient();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);
    const formData = new FormData();
    formData.set("name", "  CAR re-short  ");

    await renameTradeReviewGroup("group-1", formData);

    expect(calls.groupUpdate).toHaveBeenCalledWith(expect.objectContaining({ custom_name: "CAR re-short" }));
    expect(calls.groupUpdateUserId).toHaveBeenCalledWith("user_id", "user-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trades/groups/group-1");
  });

  it("removes a final owned member and deletes the now empty group", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    const { from, calls } = reviewGroupClient({ remainingMembers: [] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);

    await removeTradeReviewGroupMember("group-1", "car-long");

    expect(calls.memberDeleteUserId).toHaveBeenCalledWith("user_id", "user-1");
    expect(calls.groupDeleteUserId).toHaveBeenCalledWith("user_id", "user-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trades/groups/group-1");
  });

  it("deletes only the owned group and revalidates its route", async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: "user-1", email: "test@example.com" });
    const { from, calls } = reviewGroupClient();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from } as never);

    await deleteTradeReviewGroup("group-1");

    expect(calls.groupDeleteUserId).toHaveBeenCalledWith("user_id", "user-1");
    expect(revalidatePath).toHaveBeenCalledWith("/trades");
    expect(revalidatePath).toHaveBeenCalledWith("/trades/groups/group-1");
  });
});

function formDataWith(tradeIds: string[]) {
  const formData = new FormData();
  for (const tradeId of tradeIds) formData.append("tradeId", tradeId);
  return formData;
}

function reviewTrade(id: string, reconstructionKey: string, direction: string, symbol = "CAR") {
  return { id, reconstruction_key: reconstructionKey, status: "CLOSED", direction, symbol };
}

function reviewGroupClient(input: { trades?: Record<string, unknown>[]; remainingMembers?: Record<string, unknown>[]; existingMembers?: Record<string, unknown>[] } = {}) {
  const calls = {
    groupInsert: vi.fn(), memberInsert: vi.fn(), groupUpdate: vi.fn(), groupUpdateUserId: vi.fn(),
    memberDeleteUserId: vi.fn(), groupDeleteUserId: vi.fn(),
  };
  const trades = input.trades ?? [];
  const remainingMembers = input.remainingMembers ?? [{ reconstruction_key: "car-short" }];
  const existingMembers = input.existingMembers ?? [];
  const from = vi.fn((table: string) => {
    if (table === "trades") {
      const in_ = vi.fn().mockResolvedValue({ data: trades, error: null });
      const eq = vi.fn(() => ({ in: in_ }));
      return { select: vi.fn(() => ({ eq })) };
    }
    if (table === "trade_review_groups") {
      const groupDeleteId = vi.fn().mockResolvedValue({ error: null });
      const groupDeleteUserId = vi.fn(() => ({ eq: groupDeleteId }));
      calls.groupDeleteUserId = groupDeleteUserId;
      const groupUpdateId = vi.fn().mockResolvedValue({ error: null });
      const groupUpdateUserId = vi.fn(() => ({ eq: groupUpdateId }));
      calls.groupUpdateUserId = groupUpdateUserId;
      const groupUpdate = vi.fn(() => ({ eq: groupUpdateUserId }));
      calls.groupUpdate = groupUpdate;
      const select = vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { id: "group-1" }, error: null }) }));
      const insert = vi.fn(() => ({ select }));
      calls.groupInsert = insert;
      return { insert, update: groupUpdate, delete: vi.fn(() => ({ eq: groupDeleteUserId })) };
    }
    const memberDeleteKey = vi.fn().mockResolvedValue({ error: null });
    const memberDeleteGroup = vi.fn(() => ({ eq: memberDeleteKey }));
    const memberDeleteUserId = vi.fn(() => ({ eq: memberDeleteGroup }));
    if (!calls.memberDeleteUserId.mock.calls.length) calls.memberDeleteUserId = memberDeleteUserId;
    const memberInsert = vi.fn().mockResolvedValue({ error: null });
    calls.memberInsert = memberInsert;
    const select = vi.fn(() => {
      const query = {
        eq: vi.fn(),
        in: vi.fn(),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: remainingMembers, error: null }),
      };
      query.eq.mockImplementation(() => query);
      query.in.mockImplementation(() => ({
        then: (resolve: (value: unknown) => unknown) => resolve({ data: existingMembers, error: null }),
      }));
      return query;
    });
    return { insert: memberInsert, delete: vi.fn(() => ({ eq: memberDeleteUserId })), select };
  });
  return { from, calls };
}
