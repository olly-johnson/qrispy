export function dashboardPositionUnrealizedValue(position: {
  stopUnrealizedPnl: number | null;
  marketValue?: number | null;
}) {
  return position.stopUnrealizedPnl;
}
