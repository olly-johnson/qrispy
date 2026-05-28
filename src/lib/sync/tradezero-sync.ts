import {
  isExecutableTradeZeroFillPayload,
  normalizeTradeZeroFill,
} from "@/lib/tradezero/normalize";
import {
  getTradeZeroAccountDisplayName,
  getTradeZeroAccountId,
} from "@/lib/tradezero/account";
import { TradeZeroClient } from "@/lib/tradezero/client";
import {
  buildTradeZeroPortfolioSnapshot,
  buildTradeZeroPositionSnapshot,
} from "@/lib/tradezero/snapshot";
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

type RebuildTradeClient = {
  from(table: "fills"): {
    select(columns: "*"): {
      eq(column: "user_id", value: string): {
        in(column: "account_id", values: string[]): {
          gte(column: "trade_date", value: string): {
            lte(column: "trade_date", value: string): {
              order(
                column: "executed_at",
                options: { ascending: boolean },
              ): Promise<{
                data: Record<string, unknown>[] | null;
                error: unknown;
              }>;
            };
          };
        };
      };
    };
  };
  from(table: "trades"): {
    delete(): {
      eq(column: "user_id", value: string): {
        in(column: "account_id", values: string[]): {
          gte(column: "opened_at", value: string): {
            lt(
              column: "opened_at",
              value: string,
            ): Promise<{
              error: unknown;
            }>;
          };
        };
      };
    };
    upsert(
      values: Record<string, unknown>[],
      options: { onConflict: string },
    ): Promise<{
      error: unknown;
    }>;
  };
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

    let accounts = await tradeZero.listAccounts();
    if (accounts.length === 0) {
      const { data: storedAccounts, error: storedAccountsError } = await supabase
        .from("accounts")
        .select("broker_account_id,display_name")
        .eq("user_id", input.userId)
        .eq("broker", "tradezero");

      if (storedAccountsError) {
        throw storedAccountsError;
      }

      accounts = (storedAccounts ?? []).map((account) => ({
        account: account.broker_account_id,
        displayName: account.display_name,
      }));
    }

    const normalizedFills: CanonicalFill[] = [];
    const accountIds: string[] = [];

    for (const accountPayload of accounts) {
      const brokerAccountId = getTradeZeroAccountId(accountPayload);
      const { data: account, error: accountError } = await supabase
        .from("accounts")
        .upsert(
          {
            user_id: input.userId,
            broker: "tradezero",
            broker_account_id: brokerAccountId,
            display_name: getTradeZeroAccountDisplayName(accountPayload, brokerAccountId),
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
      accountIds.push(accountId);
      const snapshotAt = new Date().toISOString();
      const pnl = await tradeZero.getAccountPnl(brokerAccountId);
      const positions = await tradeZero.listPositions(brokerAccountId);
      const positionSnapshots = positions.map((position) =>
        buildTradeZeroPositionSnapshot({ pnl, position }),
      );
      const portfolioSnapshot = buildTradeZeroPortfolioSnapshot({
        pnl,
        positionSnapshots,
      });

      await supabase.from("account_portfolio_snapshots").upsert(
        {
          user_id: input.userId,
          account_id: accountId,
          snapshot_at: snapshotAt,
          snapshot_date: snapshotAt.slice(0, 10),
          equity: portfolioSnapshot.equity,
          cash: portfolioSnapshot.cash,
          buying_power: numberFrom(pnl, ["buyingPower", "buying_power"]),
          long_market_value: portfolioSnapshot.longMarketValue,
          short_market_value: portfolioSnapshot.shortMarketValue,
          gross_exposure: portfolioSnapshot.grossExposure,
          net_exposure: portfolioSnapshot.netExposure,
          percent_invested: portfolioSnapshot.percentInvested,
          day_pnl: portfolioSnapshot.dayPnl,
          unrealized_pnl: portfolioSnapshot.unrealizedPnl,
          realized_pnl: portfolioSnapshot.realizedPnl,
          source: "tradezero",
          raw_payload: pnl,
        },
        { onConflict: "account_id,snapshot_at,source" },
      );

      if (positionSnapshots.length > 0) {
        await supabase.from("broker_position_snapshots").upsert(
          positionSnapshots.map((positionSnapshot, index) => ({
            user_id: input.userId,
            account_id: accountId,
            snapshot_at: snapshotAt,
            symbol: positionSnapshot.symbol,
            quantity: positionSnapshot.quantity,
            average_price: positionSnapshot.averagePrice,
            last_price: positionSnapshot.lastPrice,
            market_value: positionSnapshot.marketValue,
            unrealized_pnl: positionSnapshot.unrealizedPnl,
            currency: "USD",
            raw_payload: positions[index],
          })),
          { onConflict: "account_id,snapshot_at,symbol,asset_class" },
        );
      }

      const orders = await tradeZero.listHistoricalOrders({
        accountId: brokerAccountId,
        startDate: input.fromDate,
        endDate: input.toDate,
      });

      const accountFills = orders
        .filter((order) => isExecutableTradeZeroFillPayload(order))
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
            sec_fee: fill.fees,
            raw_payload: fill.rawPayload,
          })),
          { onConflict: "user_id,idempotency_key" },
        );
      }
    }

    await replaceReconstructedTrades({
      client: supabase,
      userId: input.userId,
      accountIds,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
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

export async function replaceReconstructedTrades(input: {
  client?: unknown;
  userId: string;
  accountIds: string[];
  fromDate: string;
  toDate: string;
}) {
  if (input.accountIds.length === 0) {
    return;
  }

  const supabase = input.client ?? createSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const client = supabase as RebuildTradeClient;
  const { data, error } = await client
    .from("fills")
    .select("*")
    .eq("user_id", input.userId)
    .in("account_id", input.accountIds)
    .gte("trade_date", input.fromDate)
    .lte("trade_date", input.toDate)
    .order("executed_at", { ascending: true });

  if (error) {
    throw error;
  }

  const fills = ((data ?? []) as Record<string, unknown>[]).map(storedFillToCanonicalFill);
  const deleteResult = await client
    .from("trades")
    .delete()
    .eq("user_id", input.userId)
    .in("account_id", input.accountIds)
    .gte("opened_at", `${input.fromDate}T00:00:00.000Z`)
    .lt("opened_at", nextDate(input.toDate));

  if (deleteResult.error) {
    throw deleteResult.error;
  }

  const trades = reconstructTrades(fills);
  if (trades.length === 0) {
    return;
  }

  const upsertResult = await client.from("trades").upsert(
    trades.map((trade) => ({
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
    })),
    { onConflict: "user_id,reconstruction_key" },
  );

  if (upsertResult.error) {
    throw upsertResult.error;
  }
}

function storedFillToCanonicalFill(row: Record<string, unknown>): CanonicalFill {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    accountId: String(row.account_id),
    broker: String(row.broker),
    sourceType: row.source_type === "csv" ? "csv" : "api",
    sourceFillId: row.source_fill_id ? String(row.source_fill_id) : undefined,
    idempotencyKey: String(row.idempotency_key),
    symbol: String(row.symbol),
    assetClass: String(row.asset_class ?? "equity"),
    side: String(row.side) === "BUY" ? "BUY" : "SELL",
    quantity: numberFrom(row, ["quantity"]) ?? 0,
    price: numberFrom(row, ["price"]) ?? 0,
    executedAt: String(row.executed_at),
    executedTz: row.executed_tz ? String(row.executed_tz) : undefined,
    tradeDate: String(row.trade_date),
    currency: String(row.currency ?? "USD"),
    commission: numberFrom(row, ["commission"]) ?? 0,
    fees:
      (numberFrom(row, ["sec_fee"]) ?? 0) +
      (numberFrom(row, ["taf_fee"]) ?? 0) +
      (numberFrom(row, ["nscc_fee"]) ?? 0) +
      (numberFrom(row, ["nasdaq_fee"]) ?? 0) +
      (numberFrom(row, ["ecn_remove_fee"]) ?? 0) -
      (numberFrom(row, ["ecn_add_rebate"]) ?? 0),
    grossProceeds: numberFrom(row, ["gross_proceeds"]),
    netProceeds: numberFrom(row, ["net_proceeds"]),
    rawPayload: row.raw_payload,
  };
}

function nextDate(date: string) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString();
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
