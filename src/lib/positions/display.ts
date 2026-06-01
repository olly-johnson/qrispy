export function dashboardPositionUnrealizedValue(position: {
  stopUnrealizedPnl: number | null;
  marketValue?: number | null;
}) {
  return position.stopUnrealizedPnl;
}

export function dashboardPositionTradeHref(position: {
  stopGroups: Array<{ tradeId: string | null | undefined }>;
}) {
  const tradeId = position.stopGroups.find((group) => group.tradeId)?.tradeId;

  return tradeId ? `/trades/${tradeId}` : null;
}
