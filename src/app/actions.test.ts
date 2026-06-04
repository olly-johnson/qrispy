import { revalidatePath } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { updateTradeStopLoss } from "./actions";

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
  recordTradeZeroSyncQueued: vi.fn(),
  recordTradeZeroSyncFailed: vi.fn(),
}));

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
