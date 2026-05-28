import { normalizeTradeZeroFill } from "@/lib/tradezero/normalize";
import { TradeZeroClient } from "@/lib/tradezero/client";
import { reconstructTrades } from "@/lib/trades/reconstruct";
import type { CanonicalFill } from "@/lib/trades/types";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  recordTradeZeroSyncFailed,
  recordTradeZeroSyncRunning,
  recordTradeZeroSyncSucceeded,
} from "@/lib/sync/job-runs";

type SyncInput = {
  userId: string;
  fromDate: string;
  toDate: string;
  idempotencyKey: string;
};

export async function runTradeZeroSync(input: SyncInput) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for TradeZero sync");
  }

  const jobRun = await recordTradeZeroSyncRunning(input, { client: supabase });

  try {
    const tradeZero = new TradeZeroClient();

    if (!tradeZero.isConfigured()) {
      throw new Error("TradeZero credentials are required for sync");
    }

    const accounts = await tradeZero.listAccounts();
    const normalizedFills: CanonicalFill[] = [];

    for (const accountPayload of accounts) {
      const brokerAccountId = stringFrom(accountPayload, ["accountId", "id", "accountNumber"]);
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .upsert(
          {
            user_id: input.userId,
            broker: "tradezero",
            broker_account_id: brokerAccountId,
            display_name: stringFrom(accountPayload, ["displayName", "name"], brokerAccountId),
            currency: "USD",
          },
          { onConflict: "user_id,broker,broker_account_id" },
        )
        .select("id")
        .single();

      if (accountError) {
        throw accountError;
      }

      const accountId = account.id as string;
      const snapshotAt = new Date().toISOString();
      const pnl = await tradeZero.getAccountPnl(brokerAccountId);
      await supabase.from("account_portfolio_snapshots").upsert(
        {
          user_id: input.userId,
          account_id: accountId,
          snapshot_at: snapshotAt,
          snapshot_date: snapshotAt.slice(0, 10),
          equity: numberFrom(pnl, ["equity", "accountValue"]),
          cash: numberFrom(pnl, ["cash", "cashBalance"]),
          buying_power: numberFrom(pnl, ["buyingPower", "buying_power"]),
          realized_pnl: numberFrom(pnl, ["realizedPnl", "realized_pnl"]),
          source: "tradezero",
          raw_payload: pnl,
        },
        { onConflict: "account_id,snapshot_at,source" },
      );

      const positions = await tradeZero.listPositions(brokerAccountId);
      if (positions.length > 0) {
        await supabase.from("broker_position_snapshots").upsert(
          positions.map((position) => ({
            user_id: input.userId,
            account_id: accountId,
            snapshot_at: snapshotAt,
            symbol: stringFrom(position, ["symbol"]).toUpperCase(),
            quantity: numberFrom(position, ["quantity", "qty"], 0),
            average_price: numberFrom(position, ["averagePrice", "avgPrice"]),
            last_price: numberFrom(position, ["lastPrice", "price"]),
            market_value: numberFrom(position, ["marketValue", "market_value"]),
            unrealized_pnl: numberFrom(position, ["unrealizedPnl", "unrealized_pnl"]),
            currency: "USD",
            raw_payload: position,
          })),
          { onConflict: "account_id,snapshot_at,symbol,asset_class" },
        );
      }

      const orders = await tradeZero.listHistoricalOrders({
        accountId: brokerAccountId,
        startDate: input.fromDate,
      });

      const accountFills = orders
        .filter((order) => hasFillQuantity(order))
        .map((payload) =>
          normalizeTradeZeroFill({
            userId: input.userId,
            accountId,
            brokerAccountId,
            payload,
          }),
        );

      normalizedFills.push(...accountFills);

      if (accountFills.length > 0) {
        await supabase.from("fills").upsert(
          accountFills.map((fill) => ({
            user_id: fill.userId,
            account_id: fill.accountId,
            broker: fill.broker,
            source_type: fill.sourceType,
            source_fill_id: fill.sourceFillId,
            idempotency_key: fill.idempotencyKey,
            symbol: fill.symbol,
            asset_class: fill.assetClass,
            side: fill.side,
            quantity: fill.quantity,
            price: fill.price,
            executed_at: fill.executedAt,
            executed_tz: fill.executedTz,
            trade_date: fill.tradeDate,
            currency: fill.currency,
            net_proceeds: fill.netProceeds,
            commission: fill.commission,
            raw_payload: fill.rawPayload,
          })),
          { onConflict: "user_id,idempotency_key" },
        );
      }
    }

    await persistReconstructedTrades(normalizedFills);
    await recordTradeZeroSyncSucceeded(input, { client: supabase, id: jobRun?.id });

    return {
      accountCount: accounts.length,
      fillCount: normalizedFills.length,
    };
  } catch (error) {
    await recordTradeZeroSyncFailed(input, error, { client: supabase, id: jobRun?.id });
    throw error;
  }
}

async function persistReconstructedTrades(fills: CanonicalFill[]) {
  const supabase = createSupabaseAdminClient();

  if (!supabase || fills.length === 0) {
    return;
  }

  for (const trade of reconstructTrades(fills)) {
    await supabase.from("trades").upsert(
      {
        user_id: trade.userId,
        account_id: trade.accountId,
        reconstruction_key: trade.id,
        symbol: trade.symbol,
        asset_class: trade.assetClass,
        direction: trade.direction,
        opened_at: trade.openedAt,
        closed_at: trade.closedAt,
        status: trade.status,
        entry_quantity: trade.entryQuantity,
        max_abs_quantity: trade.maxAbsQuantity,
        avg_entry_price: trade.avgEntryPrice,
        avg_exit_price: trade.avgExitPrice,
        realized_pnl: trade.realizedPnl,
        total_fees: trade.totalFees,
        reconstruction_version: trade.reconstructionVersion,
      },
      { onConflict: "user_id,reconstruction_key" },
    );
  }
}

function hasFillQuantity(payload: Record<string, unknown>) {
  return numberFrom(payload, ["qty", "quantity"]) != null;
}

function stringFrom(
  payload: Record<string, unknown>,
  keys: string[],
  fallback?: string,
) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  if (fallback != null) {
    return fallback;
  }

  throw new Error(`Missing field: ${keys.join(" or ")}`);
}

function numberFrom(
  payload: Record<string, unknown>,
  keys: string[],
  fallback?: number,
) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replaceAll(",", ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}
