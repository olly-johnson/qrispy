import { describe, expect, it, vi } from "vitest";

import { replaceReconstructedTrades } from "@/lib/sync/tradezero-sync";

describe("replaceReconstructedTrades", () => {
  it("rebuilds trades from stored fills and deletes stale reconstructed rows", async () => {
    const fillsOrder = vi.fn().mockResolvedValue({
      data: [
        storedFill({
          id: "fill-1",
          side: "SELL",
          quantity: 35,
          price: 14.65,
          executedAt: "2026-01-08T15:18:00.000Z",
          fees: 1,
        }),
        storedFill({
          id: "fill-2",
          side: "BUY",
          quantity: 35,
          price: 13.56,
          executedAt: "2026-01-08T19:05:00.000Z",
          fees: 0.99,
        }),
      ],
      error: null,
    });
    const fillsLte = vi.fn(() => ({ order: fillsOrder }));
    const fillsGte = vi.fn(() => ({ lte: fillsLte }));
    const fillsIn = vi.fn(() => ({ gte: fillsGte }));
    const fillsEq = vi.fn(() => ({ in: fillsIn }));
    const fillsSelect = vi.fn(() => ({ eq: fillsEq }));

    const deleteLt = vi.fn().mockResolvedValue({ error: null });
    const deleteGte = vi.fn(() => ({ lt: deleteLt }));
    const deleteIn = vi.fn(() => ({ gte: deleteGte }));
    const deleteEq = vi.fn(() => ({ in: deleteIn }));
    const deleteTrades = vi.fn(() => ({ eq: deleteEq }));
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => {
      if (table === "fills") {
        return { select: fillsSelect };
      }

      return {
        delete: deleteTrades,
        upsert,
      };
    });

    await replaceReconstructedTrades({
      client: { from },
      userId: "user-1",
      accountIds: ["account-1"],
      fromDate: "2026-01-01",
      toDate: "2026-05-28",
    });

    expect(deleteTrades).toHaveBeenCalledOnce();
    expect(deleteGte).toHaveBeenCalledWith("opened_at", "2026-01-01T00:00:00.000Z");
    expect(deleteLt).toHaveBeenCalledWith("opened_at", "2026-05-29T00:00:00.000Z");
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        symbol: "CRML",
        direction: "SHORT",
        status: "CLOSED",
        entry_quantity: 35,
        realized_pnl: 37.16,
      }),
    ]);
  });
});

function storedFill(input: {
  id: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  executedAt: string;
  fees: number;
}) {
  return {
    id: input.id,
    user_id: "user-1",
    account_id: "account-1",
    broker: "tradezero",
    source_type: "api",
    source_fill_id: input.id,
    idempotency_key: `tradezero_api|TZ123|${input.id}`,
    symbol: "CRML",
    asset_class: "equity",
    side: input.side,
    quantity: input.quantity,
    price: input.price,
    executed_at: input.executedAt,
    executed_tz: "America/New_York",
    trade_date: input.executedAt.slice(0, 10),
    currency: "USD",
    commission: 0,
    fees: input.fees,
    sec_fee: input.fees,
    net_proceeds: null,
    raw_payload: {},
  };
}
