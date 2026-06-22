import { buildPortfolioSummary } from "@/lib/portfolio/metrics";
import type { OpenTradeStopInput } from "@/lib/portfolio/metrics";
import { buildTradeExpectancySnapshots } from "@/lib/portfolio/expectancy";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";
import { getTradeCharts, type TradeCharts } from "@/lib/market-data/trade-charts";
import type { MarketDataProvider } from "@/lib/market-data/types";
import {
  buildTradeHistoryItems,
  type ReviewableTrade,
  type TradeHistoryItem,
  type TradeReviewGroupMemberSource,
  type TradeReviewGroupSource,
} from "@/lib/trade-review-groups";
import { reconstructTrades } from "@/lib/trades/reconstruct";
import type { CanonicalFill } from "@/lib/trades/types";

export type DashboardPosition = {
  id: string;
  accountId: string;
  symbol: string;
  quantity: number;
  averagePrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  stopUnrealizedPnl: number | null;
  stopGroups: PositionStopGroup[];
};

export type PositionStopGroup = {
  id: string;
  tradeId: string;
  entryDate: string;
  direction: string;
  quantity: number | null;
  avgEntryPrice: number | null;
  stopLossPrice: number | null;
  stopUnrealizedPnl: number | null;
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
  stopGroups: PositionStopGroup[];
  charts?: TradeCharts;
};

export type TradeReviewGroupDetail = {
  id: string;
  customName: string | null;
  symbol: string;
  createdAt: string;
  updatedAt: string;
  label: string;
  openedAt: string;
  closedAt: string;
  tradeCount: number;
  realizedPnl: number | null;
  totalFees: number | null;
  timeline: Array<ReviewableTrade & { fills: TradeDetailFill[] }>;
  charts?: TradeCharts;
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
  from(table: "trade_review_groups"): {
    select(columns: "*"): {
      eq(column: "user_id", value: string): {
        order(
          column: "created_at",
          options: { ascending: boolean },
        ): Promise<{
          data: Record<string, unknown>[] | null;
          error: unknown;
        }>;
      };
    };
  };
  from(table: "trade_review_group_members"): {
    select(columns: "*"): {
      eq(column: "user_id", value: string): {
        order(
          column: "created_at",
          options: { ascending: boolean },
        ): Promise<{
          data: Record<string, unknown>[] | null;
          error: unknown;
        }>;
      };
    };
  };
};

type TradeFillClient = {
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

type TradeDetailClient = TradeFillClient & {
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
  from(table: "trade_stop_groups"): {
    select(columns: "*"): {
      eq(column: "user_id", value: string): {
        in(column: "trade_id", values: string[]): {
          order(
            column: "entry_date",
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

type TradeReviewGroupDetailClient = TradeFillClient & {
  from(table: "trade_review_groups"): {
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
  from(table: "trade_review_group_members"): {
    select(columns: "*"): {
      eq(column: "user_id", value: string): {
        eq(column: "group_id", value: string): {
          order(
            column: "created_at",
            options: { ascending: boolean },
          ): Promise<{
            data: Record<string, unknown>[] | null;
            error: unknown;
          }>;
        };
      };
    };
  };
  from(table: "trades"): {
    select(columns: "*"): {
      eq(column: "user_id", value: string): {
        in(column: "reconstruction_key", values: string[]): {
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

type OpenTradeStopRow = OpenTradeStopInput & {
  stopGroupId?: string;
  tradeId: string;
  openedAt: string;
  avgEntryPrice: number | null;
};

const TRADE_HISTORY_START_DATE = "2026-01-01T00:00:00.000Z";
const TRADE_RECONSTRUCTION_LOOKBACK_START_DATE = "2025-12-01";

export async function getDashboardData(userId: string) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return emptyDashboardData();
  }

  const [
    snapshotResult,
    positionsResult,
    tradesResult,
    openTradesResult,
    jobsResult,
    expectancyTradesResult,
  ] =
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
        .from("trades")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "OPEN")
        .order("opened_at", { ascending: false })
        .limit(200),
      supabase
        .from("job_runs")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("trades")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "CLOSED")
        .order("closed_at", { ascending: false }),
    ]);

  const positions = mapLatestPositions(positionsResult.data ?? []);
  const trades = (tradesResult.data ?? []).map(mapTrade);
  const expectancyTrades = (expectancyTradesResult.data ?? []).map(mapTrade);
  const openTradeRows = openTradesResult.data ?? [];
  const openTrades = openTradeRows.map(mapOpenTradeStop);
  const stopGroupRows =
    openTradeRows.length > 0
      ? await loadStopGroupRows({
          client: supabase,
          userId,
          tradeIds: openTradeRows.map((trade) => String(trade.id)),
        })
      : [];
  const stopGroups = stopGroupRows.map(mapPersistedStopGroup);
  const positionsWithStops = attachPositionStopGroups(positions, stopGroups);
  const cappedStopGroups = positionsWithStops.flatMap((position) =>
    position.stopGroups.map((group) => ({
      accountId: position.accountId,
      symbol: position.symbol,
      direction: group.direction,
      quantity: group.quantity,
      stopLossPrice: group.stopLossPrice,
    })),
  );
  const equityStopInputs =
    stopGroups.length > 0
      ? cappedStopGroups
      : openTrades.map((group) => ({
          accountId: group.accountId,
          symbol: group.symbol,
          direction: group.direction,
          quantity: group.quantity,
          stopLossPrice: group.stopLossPrice,
        }));
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
    positions: positionsWithStops,
    openTrades: equityStopInputs,
    openTradesCount: equityStopInputs.length,
  });

  return {
    summary,
    expectancy: buildTradeExpectancySnapshots(expectancyTrades),
    positions: positionsWithStops,
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
): Promise<TradeHistoryItem[]> {
  const supabase =
    (options.client as TradeHistoryClient | undefined) ??
    ((await createSupabaseServerClient()) as TradeHistoryClient | null);

  if (!supabase) {
    return [];
  }

  const [tradesResult, groupsResult, membersResult] = await Promise.all([
    supabase
      .from("trades")
      .select("*")
      .eq("user_id", userId)
      .lt("opened_at", tomorrowUtc(options.now ?? new Date()))
      .order("opened_at", { ascending: false }),
    supabase
      .from("trade_review_groups")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("trade_review_group_members")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  for (const result of [tradesResult, groupsResult, membersResult]) {
    if (result.error) {
      throw result.error;
    }
  }

  return buildTradeHistoryItems({
    trades: (tradesResult.data ?? [])
      .filter(overlapsTradeHistoryWindow)
      .map(mapReviewableTrade),
    groups: (groupsResult.data ?? []).map(mapTradeReviewGroup),
    members: (membersResult.data ?? []).map(mapTradeReviewGroupMember),
  });
}

export async function getTradeDetail(
  userId: string,
  tradeId: string,
  options: {
    client?: unknown;
    marketDataClient?: unknown;
    marketDataProvider?: MarketDataProvider | null;
    now?: Date;
  } = {},
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

  const fills = await loadTradeDetailFills({
    client: supabase,
    now: options.now ?? new Date(),
    trade: data,
    userId,
  });

  const stopGroups =
    String(data.status) === "OPEN"
      ? (
          await loadStopGroupRows({
            client: supabase,
            userId,
            tradeIds: [tradeId],
          })
        ).map(mapPersistedStopGroupForPosition)
      : [];

  const trade = {
    ...mapTrade(data),
    fills,
    stopGroups,
  };

  const marketDataProvider =
    options.marketDataProvider === undefined
      ? createMassiveMarketDataProvider()
      : options.marketDataProvider;
  const marketDataClient =
    options.marketDataClient ?? createSupabaseAdminClient();

  if (marketDataClient && marketDataProvider) {
    let charts: TradeCharts;

    try {
      charts = await getTradeCharts({
        trade,
        client: marketDataClient,
        provider: marketDataProvider,
        now: options.now,
      });
    } catch (error) {
      charts = {
        charts: [],
        error: `Market data unavailable: ${errorMessage(error)}`,
      };
    }

    return {
      ...trade,
      charts,
    };
  }

  return trade;
}

export async function getTradeReviewGroupDetail(
  userId: string,
  groupId: string,
  options: { client?: unknown; now?: Date } = {},
): Promise<TradeReviewGroupDetail | null> {
  const supabase =
    (options.client as TradeReviewGroupDetailClient | undefined) ??
    ((await createSupabaseServerClient()) as TradeReviewGroupDetailClient | null);

  if (!supabase) {
    return null;
  }

  const groupResult = await supabase
    .from("trade_review_groups")
    .select("*")
    .eq("user_id", userId)
    .eq("id", groupId)
    .maybeSingle();

  if (groupResult.error) {
    throw groupResult.error;
  }
  if (!groupResult.data) {
    return null;
  }

  const membersResult = await supabase
    .from("trade_review_group_members")
    .select("*")
    .eq("user_id", userId)
    .eq("group_id", groupId)
    .order("created_at", { ascending: true });

  if (membersResult.error) {
    throw membersResult.error;
  }

  const members = (membersResult.data ?? []).map(mapTradeReviewGroupMember);
  if (members.length === 0) {
    return null;
  }

  const tradesResult = await supabase
    .from("trades")
    .select("*")
    .eq("user_id", userId)
    .in(
      "reconstruction_key",
      members.map((member) => member.reconstructionKey),
    )
    .order("opened_at", { ascending: true });

  if (tradesResult.error) {
    throw tradesResult.error;
  }

  const timelineRows = (tradesResult.data ?? []).filter(
    (row) => String(row.status) === "CLOSED",
  );
  if (timelineRows.length === 0) {
    return null;
  }

  const timeline = await Promise.all(
    timelineRows.map(async (row) => ({
      ...mapReviewableTrade(row),
      fills: await loadTradeDetailFills({
        client: supabase,
        now: options.now ?? new Date(),
        trade: row,
        userId,
      }),
    })),
  );
  timeline.sort((left, right) => left.openedAt.localeCompare(right.openedAt));

  const group = mapTradeReviewGroup(groupResult.data);
  const groupItem = buildTradeHistoryItems({
    trades: timeline,
    groups: [group],
    members,
  }).find((item) => item.kind === "group" && item.group.id === groupId);

  if (!groupItem || groupItem.kind !== "group") {
    return null;
  }

  return {
    ...groupItem.group,
    timeline,
  };
}

async function loadTradeDetailFills(input: {
  client: TradeFillClient;
  trade: Record<string, unknown>;
  now: Date;
  userId: string;
}) {
  const fillsResult = await input.client
    .from("trade_fills")
    .select(
      "allocated_quantity,allocation_role,allocation_price,fills(id,source_fill_id,side,quantity,price,executed_at,commission,sec_fee,taf_fee,nscc_fee,nasdaq_fee,ecn_remove_fee,ecn_add_rebate,raw_payload)",
    )
    .eq("user_id", input.userId)
    .eq("trade_id", String(input.trade.id))
    .order("allocation_role", { ascending: true });

  if (fillsResult.error) {
    throw fillsResult.error;
  }

  const fills = (fillsResult.data ?? []).map(mapTradeDetailFill).sort(compareDetailFills);
  if (fills.length > 0) {
    return fills;
  }

  return reconstructTradeDetailFills(input);
}

async function reconstructTradeDetailFills(input: {
  client: TradeFillClient;
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
    expectancy: buildTradeExpectancySnapshots([]),
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

export function attachPositionStopGroups(
  positions: DashboardPosition[],
  openTrades: OpenTradeStopRow[],
) {
  return positions.map((position) => {
    const matchedTrades = openTrades
      .filter(
        (trade) =>
          trade.accountId === position.accountId && trade.symbol === position.symbol,
      )
      .sort((left, right) => left.openedAt.localeCompare(right.openedAt));
    const cappedTrades = capTradesToPositionQuantity(position, matchedTrades);
    const stopGroups = cappedTrades
      .map((trade) => ({
        id: trade.stopGroupId ?? trade.tradeId,
        tradeId: trade.tradeId,
        entryDate: trade.openedAt.slice(0, 10),
        direction: trade.direction,
        quantity: trade.quantity,
        avgEntryPrice: trade.avgEntryPrice,
        stopLossPrice: trade.stopLossPrice,
        stopUnrealizedPnl: stopUnrealizedPnl(trade),
      }));

    return {
      ...position,
      stopGroups,
      stopUnrealizedPnl: sumStopUnrealizedPnl(stopGroups),
    };
  });
}

function capTradesToPositionQuantity(
  position: DashboardPosition,
  trades: OpenTradeStopRow[],
) {
  let remainingQuantity = Math.abs(position.quantity);

  return trades
    .map((trade) => {
      if (trade.quantity == null) {
        return trade;
      }

      const quantity = Math.min(trade.quantity, remainingQuantity);
      remainingQuantity = Math.max(remainingQuantity - quantity, 0);

      return {
        ...trade,
        quantity: roundShareQuantity(quantity),
      };
    })
    .filter((trade) => trade.quantity == null || trade.quantity > 0.000001);
}

function mapPosition(row: Record<string, unknown>): DashboardPosition {
  return {
    id: String(row.id ?? `${String(row.account_id)}:${String(row.symbol)}`),
    accountId: String(row.account_id ?? ""),
    symbol: String(row.symbol),
    quantity: numberOrZero(row.quantity),
    averagePrice: numberOrNull(row.average_price),
    marketValue: numberOrNull(row.market_value),
    unrealizedPnl: numberOrNull(row.unrealized_pnl),
    stopUnrealizedPnl: null,
    stopGroups: [],
  };
}

function mapOpenTradeStop(row: Record<string, unknown>): OpenTradeStopRow {
  return {
    tradeId: String(row.id),
    accountId: String(row.account_id ?? ""),
    symbol: String(row.symbol),
    direction: String(row.direction),
    openedAt: String(row.opened_at),
    quantity: numberOrNull(row.max_abs_quantity ?? row.entry_quantity),
    avgEntryPrice: numberOrNull(row.avg_entry_price),
    stopLossPrice: numberOrNull(row.initial_stop_price),
  };
}

function mapPersistedStopGroup(row: Record<string, unknown>): OpenTradeStopRow {
  return {
    stopGroupId: String(row.id),
    tradeId: String(row.trade_id),
    accountId: String(row.account_id ?? ""),
    symbol: String(row.symbol),
    direction: String(row.direction),
    openedAt: `${String(row.entry_date)}T00:00:00.000Z`,
    quantity: numberOrNull(row.quantity),
    avgEntryPrice: numberOrNull(row.avg_entry_price),
    stopLossPrice: numberOrNull(row.stop_loss_price),
  };
}

function mapPersistedStopGroupForPosition(
  row: Record<string, unknown>,
): PositionStopGroup {
  const stopGroup = mapPersistedStopGroup(row);

  return {
    id: stopGroup.stopGroupId ?? stopGroup.tradeId,
    tradeId: stopGroup.tradeId,
    entryDate: stopGroup.openedAt.slice(0, 10),
    direction: stopGroup.direction,
    quantity: stopGroup.quantity,
    avgEntryPrice: stopGroup.avgEntryPrice,
    stopLossPrice: stopGroup.stopLossPrice,
    stopUnrealizedPnl: stopUnrealizedPnl(stopGroup),
  };
}

export async function loadStopGroupRows(input: {
  client: unknown;
  userId: string;
  tradeIds: string[];
}) {
  const client = input.client as {
    from(table: "trade_stop_groups"): {
      select(columns: "*"): {
        eq(column: "user_id", value: string): {
          in(column: "trade_id", values: string[]): {
            order(
              column: "entry_date",
              options: { ascending: boolean },
            ): Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
          };
        };
      };
    };
  };

  const { data, error } = await client
    .from("trade_stop_groups")
    .select("*")
    .eq("user_id", input.userId)
    .in("trade_id", input.tradeIds)
    .order("entry_date", { ascending: true });

  if (error) {
    if (isMissingStopGroupsTableError(error)) {
      return [];
    }

    throw error;
  }

  return data ?? [];
}

function isMissingStopGroupsTableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const payload = error as { code?: unknown; message?: unknown };

  return (
    payload.code === "PGRST205" &&
    typeof payload.message === "string" &&
    payload.message.includes("trade_stop_groups")
  );
}

function stopUnrealizedPnl(trade: OpenTradeStopRow) {
  if (
    trade.quantity == null ||
    trade.avgEntryPrice == null ||
    trade.stopLossPrice == null
  ) {
    return null;
  }

  const value =
    trade.direction === "SHORT"
      ? (trade.avgEntryPrice - trade.stopLossPrice) * trade.quantity
      : (trade.stopLossPrice - trade.avgEntryPrice) * trade.quantity;

  return roundMoney(value);
}

function sumStopUnrealizedPnl(stopGroups: PositionStopGroup[]) {
  const values = stopGroups
    .map((group) => group.stopUnrealizedPnl)
    .filter((value): value is number => value != null);

  if (values.length === 0) {
    return null;
  }

  return roundMoney(values.reduce((total, value) => total + value, 0));
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

function mapReviewableTrade(row: Record<string, unknown>): ReviewableTrade {
  return {
    ...mapTrade(row),
    reconstructionKey: String(row.reconstruction_key ?? ""),
  };
}

function mapTradeReviewGroup(
  row: Record<string, unknown>,
): TradeReviewGroupSource {
  return {
    id: String(row.id),
    customName: row.custom_name ? String(row.custom_name) : null,
    symbol: String(row.symbol),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapTradeReviewGroupMember(
  row: Record<string, unknown>,
): TradeReviewGroupMemberSource {
  return {
    groupId: String(row.group_id),
    reconstructionKey: String(row.reconstruction_key),
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundShareQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
