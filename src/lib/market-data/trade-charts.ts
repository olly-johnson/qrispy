import type { TradeDetail, TradeDetailFill } from "@/lib/app-data";
import { ema, sma } from "./indicators";
import { getCachedOrFetchBars } from "./cache";
import type {
  IndicatorPoint,
  MarketDataProvider,
  MarketDataRequest,
  MarketDataTimeframe,
  OhlcvBar,
} from "./types";

export type TradeChartMarker = {
  time: string;
  price: number;
  quantity: number;
  side: string;
  role: string;
  text: string;
};

export type TradeChartOverlay = {
  id: string;
  label: string;
  color: string;
  points: IndicatorPoint[];
};

export type TradeChartDataset = {
  id: string;
  label: string;
  timeframe: MarketDataTimeframe;
  bars: OhlcvBar[];
  overlays: TradeChartOverlay[];
  markers: TradeChartMarker[];
};

export type TradeCharts = {
  charts: TradeChartDataset[];
  error: string | null;
};

type GetTradeChartsInput = {
  trade: TradeDetail;
  client: unknown;
  provider: MarketDataProvider | null;
  now?: Date;
};

export async function getTradeCharts(input: GetTradeChartsInput): Promise<TradeCharts> {
  if (!input.provider) {
    return { charts: [], error: "Massive API key is not configured." };
  }

  const endAnchor = input.trade.closedAt ?? input.now?.toISOString() ?? new Date().toISOString();
  const dailyRequest = rangeRequest({
    symbol: input.trade.symbol,
    timeframe: "1d",
    from: addDays(input.trade.openedAt, -500),
    to: addDays(endAnchor, 120),
  });
  const weeklyRequest = rangeRequest({
    symbol: input.trade.symbol,
    timeframe: "1w",
    from: addDays(input.trade.openedAt, -1800),
    to: addDays(endAnchor, 400),
  });
  const entryDate = datePart(firstFillDate(input.trade.fills, "ENTRY") ?? input.trade.openedAt);
  const exitDate = datePart(firstFillDate(input.trade.fills, "EXIT") ?? endAnchor);
  const requests: Array<{ id: string; label: string; request: MarketDataRequest }> = [
    { id: "daily", label: "Daily", request: dailyRequest },
    { id: "weekly", label: "Weekly", request: weeklyRequest },
    {
      id: "entry-5m",
      label: "Entry 5m",
      request: rangeRequest({
        symbol: input.trade.symbol,
        timeframe: "5m",
        from: entryDate,
        to: entryDate,
      }),
    },
    {
      id: "entry-1h",
      label: "Entry 1h",
      request: rangeRequest({
        symbol: input.trade.symbol,
        timeframe: "1h",
        from: entryDate,
        to: entryDate,
      }),
    },
    {
      id: "exit-5m",
      label: "Exit 5m",
      request: rangeRequest({
        symbol: input.trade.symbol,
        timeframe: "5m",
        from: exitDate,
        to: exitDate,
      }),
    },
    {
      id: "exit-1h",
      label: "Exit 1h",
      request: rangeRequest({
        symbol: input.trade.symbol,
        timeframe: "1h",
        from: exitDate,
        to: exitDate,
      }),
    },
  ];

  const charts = await Promise.all(
    requests.map(async ({ id, label, request }) => {
      const bars = await getCachedOrFetchBars({
        client: input.client,
        provider: input.provider as MarketDataProvider,
        request,
      });
      const visibleBars =
        request.timeframe === "1d" || request.timeframe === "1w"
          ? sliceAroundTrade(bars, input.trade.openedAt, endAnchor, 100, 50)
          : bars;

      return {
        id,
        label,
        timeframe: request.timeframe,
        bars: visibleBars,
        overlays: overlaysForTimeframe(bars, request.timeframe),
        markers: markersForFills(input.trade.fills, request.timeframe),
      };
    }),
  );

  return { charts, error: null };
}

function rangeRequest(input: {
  symbol: string;
  timeframe: MarketDataTimeframe;
  from: string;
  to: string;
}): MarketDataRequest {
  return {
    symbol: input.symbol,
    timeframe: input.timeframe,
    from: datePart(input.from),
    to: datePart(input.to),
    adjusted: false,
  };
}

function overlaysForTimeframe(
  bars: OhlcvBar[],
  timeframe: MarketDataTimeframe,
): TradeChartOverlay[] {
  const points = bars.map((bar) => ({
    time: chartTime(bar, timeframe),
    close: bar.close,
  }));

  if (timeframe === "1d" || timeframe === "1w") {
    return [
      { id: "sma10", label: "10 MA", color: "#d946ef", points: sma(points, 10) },
      { id: "sma20", label: "20 MA", color: "#facc15", points: sma(points, 20) },
      { id: "sma50", label: "50 MA", color: "#ef4444", points: sma(points, 50) },
      { id: "sma200", label: "200 MA", color: "#3b82f6", points: sma(points, 200) },
    ];
  }

  return [
    { id: "ema10", label: "10 EMA", color: "#d946ef", points: ema(points, 10) },
    { id: "ema20", label: "20 EMA", color: "#facc15", points: ema(points, 20) },
    { id: "ema65", label: "65 EMA", color: "#ffffff", points: ema(points, 65) },
  ];
}

function markersForFills(
  fills: TradeDetailFill[],
  timeframe: MarketDataTimeframe,
): TradeChartMarker[] {
  return fills.map((fill) => ({
    time: fillTime(fill.executedAt, timeframe),
    price: fill.allocationPrice ?? fill.price ?? 0,
    quantity: fill.allocatedQuantity,
    side: fill.side,
    role: fill.allocationRole,
    text: `${fill.allocationRole} ${formatQuantity(fill.allocatedQuantity)} @ ${formatPrice(fill.allocationPrice ?? fill.price)}`,
  }));
}

function sliceAroundTrade(
  bars: OhlcvBar[],
  openedAt: string,
  closedAt: string,
  before: number,
  after: number,
) {
  if (bars.length === 0) {
    return [];
  }

  const openTime = Date.parse(openedAt);
  const closeTime = Date.parse(closedAt);
  const openIndex = Math.max(
    0,
    bars.findIndex((bar) => Date.parse(bar.barStartAt) >= openTime),
  );
  const closeIndex = Math.max(
    openIndex,
    bars.findIndex((bar) => Date.parse(bar.barStartAt) >= closeTime),
  );
  const start = Math.max(0, openIndex - before);
  const end = Math.min(bars.length, (closeIndex === -1 ? bars.length - 1 : closeIndex) + after + 1);

  return bars.slice(start, end);
}

function firstFillDate(fills: TradeDetailFill[], role: string) {
  return fills.find((fill) => fill.allocationRole === role)?.executedAt ?? null;
}

function chartTime(bar: OhlcvBar, timeframe: MarketDataTimeframe) {
  return timeframe === "1d" || timeframe === "1w"
    ? datePart(bar.barStartAt)
    : bar.barStartAt;
}

function fillTime(value: string, timeframe: MarketDataTimeframe) {
  return timeframe === "1d" || timeframe === "1w" ? datePart(value) : value;
}

function datePart(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function formatPrice(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(value);
}
