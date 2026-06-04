export function tradeHeadlinePnlValue(trade: {
  status: string;
  realizedPnl: number | null;
  stopGroups: Array<{ stopUnrealizedPnl: number | null }>;
}) {
  if (trade.status !== "OPEN") {
    return trade.realizedPnl;
  }

  const stopValues = trade.stopGroups
    .map((group) => group.stopUnrealizedPnl)
    .filter((value): value is number => value != null);

  if (stopValues.length === 0) {
    return null;
  }

  return roundMoney(stopValues.reduce((total, value) => total + value, 0));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
