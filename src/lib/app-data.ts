import { buildPortfolioSummary } from "@/lib/portfolio/metrics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  realizedPnl: number | null;
  totalFees: number | null;
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
        gte(column: "opened_at", value: string): {
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
};

const TRADE_HISTORY_START_DATE = "2026-01-01T00:00:00.000Z";

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
    .gte("opened_at", TRADE_HISTORY_START_DATE)
    .lt("opened_at", tomorrowUtc(options.now ?? new Date()))
    .order("opened_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapTrade);
}

export async function getTradeDetail(userId: string, tradeId: string) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .eq("id", tradeId)
    .maybeSingle();

  return data ? mapTrade(data) : null;
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
    realizedPnl: numberOrNull(row.realized_pnl),
    totalFees: numberOrNull(row.total_fees),
  };
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
