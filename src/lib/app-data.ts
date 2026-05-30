import { buildPortfolioSummary } from "@/lib/portfolio/metrics";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reconstructTrades } from "@/lib/trades/reconstruct";
import type { CanonicalFill } from "@/lib/trades/types";

export type DashboardPosition = {
  id: string;
  symbol: string;
  quantity: number;
  averagePrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
};

export type DashboardTrade = {
  id: string;
  symbol: string;
  direction: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  entryQuantity: number | null;
  maxAbsQuantity: number | null;
  avgEntryPrice: number | null;
  avgExitPrice: number | null;
  realizedPnl: number | null;
  totalFees: number | null;
};

export type TradeDetailFill = {
  id: string;
  sourceFillId: string | null;
  allocationRole: string;
  side: string;
  allocatedQuantity: number;
  fillQuantity: number;
  price: number | null;
  allocationPrice: number | null;
  executedAt: string;
  commission: number;
  fees: number;
  rawPayload: unknown;
};

export type TradeDetail = DashboardTrade & {
  fills: TradeDetailFill[];
};

export type JobRun = {
  id: string;
  status: string;
  jobType: string;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
};

type TradeHistoryClient = {
  from(table: "trades"): {
    select(columns: "*"): {
      eq(column: "user_id", value: string): {
        lt(column: "opened_at", value: string): {
          order(
            column: "opened_at",
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

type TradeDetailClient = {
  from(table: "trades"): {
    select(columns: "*"): {
      eq(column: "user_id", value: string): {
        eq(column: "id", value: string): {
          maybeSingle(): Promise<{
            data: Record<string, unknown> | null;
            error: unknown;
          }>;
        };
      };
    };
  };
  from(table: "trade_fills"): {
    select(columns: string): {
      eq(column: "user_id", value: string): {
        eq(column: "trade_id", value: string): {
          order(
            column: "allocation_role",
            options: { ascending: boolean },
          ): Promise<{
            data: Record<string, unknown>[] | null;
            error: unknown;
          }>;
        };
      };
    };
  };
  from(table: "fills"): {
    select(columns: "*"): {
      eq(column: "user_id", value: string): {
        eq(column: "account_id", value: string): {
          eq(column: "symbol", value: string): {
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
  };
};

const TRADE_HISTORY_START_DATE = "2026-01-01T00:00:00.000Z";
const TRADE_RECONSTRUCTION_LOOKBACK_START_DATE = "2025-12-01";

export async function getDashboardData(userId: string) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return emptyDashboardData();
  }

  const [snapshotResult, positionsResult, tradesResult, jobsResult] =
    await Promise.all([
      supabase
        .from("account_portfolio_snapshots")
        .select("*")
        .eq("user_id", userId)
        .order("snapshot_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("broker_position_snapshots")
        .select("*")
        .eq("user_id", userId)
        .order("snapshot_at", { ascending: false })
        .limit(200),
      supabase
        .from("trades")
        .select("*")
        .eq("user_id", userId)
        .order("opened_at", { ascending: false })
        .limit(8),
      supabase
        .from("job_runs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const positions = mapLatestPositions(positionsResult.data ?? []);
  const trades = (tradesResult.data ?? []).map(mapTrade);
  const summary = buildPortfolioSummary({
    snapshot: snapshotResult.data
      ? {
          equity: numberOrNull(snapshotResult.data.equity),
          cash: numberOrNull(snapshotResult.data.cash),
          buyingPower: numberOrNull(snapshotResult.data.buying_power),
          grossExposure: numberOrNull(snapshotResult.data.gross_exposure),
          longMarketValue: numberOrNull(snapshotResult.data.long_market_value),
          shortMarketValue: numberOrNull(snapshotResult.data.short_market_value),
          netExposure: numberOrNull(snapshotResult.data.net_exposure),
          percentInvested: numberOrNull(snapshotResult.data.percent_invested),
          realizedPnl: numberOrNull(snapshotResult.data.realized_pnl),
        }
      : null,
    positions,
    openTradesCount: trades.filter((trade) => trade.status === "OPEN").length,
  });

  return {
    summary,
    positions,
    trades,
    jobs: (jobsResult.data ?? []).map(mapJob),
    latestSnapshotAt: snapshotResult.data?.snapshot_at as string | undefined,
    hasData:
      positions.length > 0 ||
      trades.length > 0 ||
      snapshotResult.data != null ||
      (jobsResult.data?.length ?? 0) > 0,
  };
}

export async function getTradeHistory(
  userId: string,
  options: { client?: unknown; now?: Date } = {},
) {
  const supabase =
    (options.client as TradeHistoryClient | undefined) ??
    ((await createSupabaseServerClient()) as TradeHistoryClient | null);

  if (!supabase) {
    return [] as DashboardTrade[];
  }

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .lt("opened_at", tomorrowUtc(options.now ?? new Date()))
    .order("opened_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).filter(overlapsTradeHistoryWindow).map(mapTrade);
}

export async function getTradeDetail(
  userId: string,
  tradeId: string,
  options: { client?: unknown; now?: Date } = {},
): Promise<TradeDetail | null> {
  const supabase =
    (options.client as TradeDetailClient | undefined) ??
    ((await createSupabaseServerClient()) as TradeDetailClient | null);

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .eq("id", tradeId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const fillsResult = await supabase
    .from("trade_fills")
    .select(
      "allocated_quantity,allocation_role,allocation_price,fills(id,source_fill_id,side,quantity,price,executed_at,commission,sec_fee,taf_fee,nscc_fee,nasdaq_fee,ecn_remove_fee,ecn_add_rebate,raw_payload)",
    )
    .eq("user_id", userId)
    .eq("trade_id", tradeId)
    .order("allocation_role", { ascending: true });

  if (fillsResult.error) {
    throw fillsResult.error;
  }

  let fills = (fillsResult.data ?? []).map(mapTradeDetailFill).sort(compareDetailFills);

  if (fills.length === 0) {
    fills = await reconstructTradeDetailFills({
      client: supabase,
      trade: data,
      now: options.now ?? new Date(),
      userId,
    });
  }

  return {
    ...mapTrade(data),
    fills,
  };
}

async function reconstructTradeDetailFills(input: {
  client: TradeDetailClient;
  trade: Record<string, unknown>;
  now: Date;
  userId: string;
}) {
  const accountId = String(input.trade.account_id ?? "");
  const symbol = String(input.trade.symbol ?? "");
  const reconstructionKey = String(input.trade.reconstruction_key ?? "");

  if (!accountId || !symbol || !reconstructionKey) {
    return [] as TradeDetailFill[];
  }

  const fillsResult = await input.client
    .from("fills")
    .select("*")
    .eq("user_id", input.userId)
    .eq("account_id", accountId)
    .eq("symbol", symbol)
    .gte("trade_date", TRADE_RECONSTRUCTION_LOOKBACK_START_DATE)
    .lte("trade_date", input.now.toISOString().slice(0, 10))
    .order("executed_at", { ascending: true });

  if (fillsResult.error) {
    throw fillsResult.error;
  }

  const storedFills = fillsResult.data ?? [];
  const fillById = new Map(storedFills.map((fill) => [String(fill.id), fill]));
  const reconstructedTrade = reconstructTrades(
    storedFills.map(storedFillToCanonicalFill),
  ).find((trade) => trade.id === reconstructionKey);

  if (!reconstructedTrade) {
    return [];
  }

  return reconstructedTrade.allocations
    .map((allocation) => {
      const fill = fillById.get(allocation.fillId);
      if (!fill) {
        return null;
      }

      return mapAllocatedStoredFill(fill, {
        allocationPrice: allocation.allocationPrice,
        allocationRole: allocation.allocationRole,
        allocatedQuantity: allocation.allocatedQuantity,
      });
    })
    .filter((fill): fill is TradeDetailFill => fill != null)
    .sort(compareDetailFills);
}

function emptyDashboardData() {
  const summary = buildPortfolioSummary({
    snapshot: null,
    positions: [],
    openTradesCount: 0,
  });

  return {
    summary,
    positions: [] as DashboardPosition[],
    trades: [] as DashboardTrade[],
    jobs: [] as JobRun[],
    latestSnapshotAt: undefined,
    hasData: false,
  };
}

export function mapLatestPositions(rows: Record<string, unknown>[]) {
  const latestSnapshotAt = rows[0]?.snapshot_at;
  const seen = new Set<string>();
  const positions: DashboardPosition[] = [];

  for (const row of rows) {
    if (row.snapshot_at !== latestSnapshotAt) {
      continue;
    }

    const key = `${String(row.account_id)}:${String(row.symbol)}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    positions.push(mapPosition(row));
  }

  return positions;
}

function mapPosition(row: Record<string, unknown>): DashboardPosition {
  return {
    id: String(row.id ?? `${String(row.account_id)}:${String(row.symbol)}`),
    symbol: String(row.symbol),
    quantity: numberOrZero(row.quantity),
    averagePrice: numberOrNull(row.average_price),
    marketValue: numberOrNull(row.market_value),
    unrealizedPnl: numberOrNull(row.unrealized_pnl),
  };
}

function mapTrade(row: Record<string, unknown>): DashboardTrade {
  return {
    id: String(row.id),
    symbol: String(row.symbol),
    direction: String(row.direction),
    status: String(row.status),
    openedAt: String(row.opened_at),
    closedAt: row.closed_at ? String(row.closed_at) : null,
    entryQuantity: numberOrNull(row.entry_quantity),
    maxAbsQuantity: numberOrNull(row.max_abs_quantity),
    avgEntryPrice: numberOrNull(row.avg_entry_price),
    avgExitPrice: numberOrNull(row.avg_exit_price),
    realizedPnl: numberOrNull(row.realized_pnl),
    totalFees: numberOrNull(row.total_fees),
  };
}

function mapTradeDetailFill(row: Record<string, unknown>): TradeDetailFill {
  const fill = nestedFill(row.fills);
  const allocatedQuantity = numberOrZero(row.allocated_quantity);
  const fillQuantity = numberOrZero(fill.quantity);
  const feeTotal = fillFeeTotal(fill);

  return {
    id: String(fill.id),
    sourceFillId: fill.source_fill_id ? String(fill.source_fill_id) : null,
    allocationRole: String(row.allocation_role),
    side: String(fill.side),
    allocatedQuantity,
    fillQuantity,
    price: numberOrNull(fill.price),
    allocationPrice: numberOrNull(row.allocation_price),
    executedAt: String(fill.executed_at),
    commission: prorate(numberOrZero(fill.commission), allocatedQuantity, fillQuantity),
    fees: prorate(feeTotal, allocatedQuantity, fillQuantity),
    rawPayload: fill.raw_payload,
  };
}

function mapAllocatedStoredFill(
  fill: Record<string, unknown>,
  allocation: {
    allocatedQuantity: number;
    allocationRole: string;
    allocationPrice: number;
  },
): TradeDetailFill {
  const fillQuantity = numberOrZero(fill.quantity);

  return {
    id: String(fill.id),
    sourceFillId: fill.source_fill_id ? String(fill.source_fill_id) : null,
    allocationRole: allocation.allocationRole,
    side: String(fill.side),
    allocatedQuantity: allocation.allocatedQuantity,
    fillQuantity,
    price: numberOrNull(fill.price),
    allocationPrice: allocation.allocationPrice,
    executedAt: String(fill.executed_at),
    commission: prorate(
      numberOrZero(fill.commission),
      allocation.allocatedQuantity,
      fillQuantity,
    ),
    fees: prorate(fillFeeTotal(fill), allocation.allocatedQuantity, fillQuantity),
    rawPayload: fill.raw_payload,
  };
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
    quantity: numberOrZero(row.quantity),
    price: numberOrZero(row.price),
    executedAt: String(row.executed_at),
    executedTz: row.executed_tz ? String(row.executed_tz) : undefined,
    tradeDate: String(row.trade_date),
    currency: String(row.currency ?? "USD"),
    commission: numberOrZero(row.commission),
    fees: fillFeeTotal(row),
    grossProceeds: numberOrNull(row.gross_proceeds) ?? undefined,
    netProceeds: numberOrNull(row.net_proceeds) ?? undefined,
    rawPayload: row.raw_payload,
  };
}

function fillFeeTotal(fill: Record<string, unknown>) {
  return (
    numberOrZero(fill.sec_fee) +
    numberOrZero(fill.taf_fee) +
    numberOrZero(fill.nscc_fee) +
    numberOrZero(fill.nasdaq_fee) +
    numberOrZero(fill.ecn_remove_fee) -
    numberOrZero(fill.ecn_add_rebate)
  );
}

function prorate(value: number, allocatedQuantity: number, fillQuantity: number) {
  if (fillQuantity === 0) {
    return 0;
  }

  return value * (allocatedQuantity / fillQuantity);
}

function nestedFill(value: unknown) {
  if (Array.isArray(value)) {
    return (value[0] ?? {}) as Record<string, unknown>;
  }

  return (value ?? {}) as Record<string, unknown>;
}

function compareDetailFills(left: TradeDetailFill, right: TradeDetailFill) {
  const timeDiff = Date.parse(left.executedAt) - Date.parse(right.executedAt);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return left.id.localeCompare(right.id);
}

function mapJob(row: Record<string, unknown>): JobRun {
  return {
    id: String(row.id),
    status: String(row.status),
    jobType: String(row.job_type),
    createdAt: String(row.created_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    error: row.error ? String(row.error) : null,
  };
}

function tomorrowUtc(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  ).toISOString();
}

function overlapsTradeHistoryWindow(row: Record<string, unknown>) {
  const closedAt = row.closed_at ? String(row.closed_at) : null;

  return closedAt == null || closedAt >= TRADE_HISTORY_START_DATE;
}

function numberOrZero(value: unknown) {
  return numberOrNull(value) ?? 0;
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
