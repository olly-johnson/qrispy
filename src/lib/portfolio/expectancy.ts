export type ExpectancyTradeInput = {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  realizedPnl: number | null;
};

export type TradeExpectancySnapshot = {
  label: "All trades" | "Last 30";
  tradeCount: number;
  winCount: number;
  battingAverage: number | null;
  averageGain: number | null;
  averageLoss: number | null;
  gainLossRatio: number | null;
};

export type TradeExpectancySnapshots = {
  all: TradeExpectancySnapshot;
  last30: TradeExpectancySnapshot;
};

type EligibleTrade = ExpectancyTradeInput & {
  realizedPnl: number;
};

export function buildTradeExpectancySnapshots(
  trades: ExpectancyTradeInput[],
): TradeExpectancySnapshots {
  const eligible = eligibleClosedTrades(trades);

  return {
    all: buildSnapshot("All trades", eligible),
    last30: buildSnapshot("Last 30", eligible.slice(0, 30)),
  };
}

function eligibleClosedTrades(trades: ExpectancyTradeInput[]) {
  return trades
    .filter((trade): trade is EligibleTrade =>
      trade.status === "CLOSED" &&
      typeof trade.realizedPnl === "number" &&
      Number.isFinite(trade.realizedPnl),
    )
    .sort((left, right) => sortTime(right) - sortTime(left));
}

function buildSnapshot(
  label: TradeExpectancySnapshot["label"],
  trades: EligibleTrade[],
): TradeExpectancySnapshot {
  const tradeCount = trades.length;

  if (tradeCount === 0) {
    return {
      label,
      tradeCount: 0,
      winCount: 0,
      battingAverage: null,
      averageGain: null,
      averageLoss: null,
      gainLossRatio: null,
    };
  }

  const gains = trades
    .map((trade) => trade.realizedPnl)
    .filter((realizedPnl) => realizedPnl > 0);
  const losses = trades
    .map((trade) => trade.realizedPnl)
    .filter((realizedPnl) => realizedPnl < 0);
  const averageGain = average(gains);
  const averageLoss = losses.length > 0 ? Math.abs(average(losses) ?? 0) : null;

  return {
    label,
    tradeCount,
    winCount: gains.length,
    battingAverage: gains.length / tradeCount,
    averageGain,
    averageLoss,
    gainLossRatio:
      averageGain != null && averageLoss != null ? averageGain / averageLoss : null,
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function sortTime(trade: ExpectancyTradeInput) {
  const value = Date.parse(trade.closedAt ?? trade.openedAt);

  return Number.isFinite(value) ? value : 0;
}
