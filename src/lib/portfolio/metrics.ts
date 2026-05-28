export type MetricProvenance =
  | "broker_reported"
  | "computed_from_positions"
  | "computed_from_fills"
  | "missing";

export type ProvenancedMetric = {
  value: number | null;
  provenance: MetricProvenance;
};

export type PortfolioSnapshotInput = {
  equity: number | null;
  cash: number | null;
  buyingPower: number | null;
  grossExposure: number | null;
  longMarketValue: number | null;
  shortMarketValue: number | null;
  netExposure: number | null;
  percentInvested: number | null;
  realizedPnl: number | null;
};

export type PositionInput = {
  symbol: string;
  quantity: number;
  marketValue: number | null;
};

export type PortfolioSummary = {
  metrics: {
    equity: ProvenancedMetric;
    cash: ProvenancedMetric;
    buyingPower: ProvenancedMetric;
    grossExposure: ProvenancedMetric;
    longExposure: ProvenancedMetric;
    shortExposure: ProvenancedMetric;
    netExposure: ProvenancedMetric;
    percentInvested: ProvenancedMetric;
    realizedPnl: ProvenancedMetric;
  };
  openPositionsCount: number;
  openTradesCount: number;
};

export function buildPortfolioSummary(input: {
  snapshot: PortfolioSnapshotInput | null;
  positions: PositionInput[];
  openTradesCount: number;
}): PortfolioSummary {
  const snapshot = input.snapshot;
  const exposure = exposureFromPositions(input.positions);
  const equity = brokerMetric(snapshot?.equity ?? null);
  const grossExposure = brokerOrComputed(
    snapshot?.grossExposure ?? null,
    exposure.grossExposure,
  );
  const percentInvested =
    snapshot?.percentInvested != null
      ? brokerMetric(snapshot.percentInvested)
      : computedMetric(
          equity.value && grossExposure.value != null
            ? grossExposure.value / equity.value
            : null,
        );

  return {
    metrics: {
      equity,
      cash: brokerMetric(snapshot?.cash ?? null),
      buyingPower: brokerMetric(snapshot?.buyingPower ?? null),
      grossExposure,
      longExposure: brokerOrComputed(
        snapshot?.longMarketValue ?? null,
        exposure.longExposure,
      ),
      shortExposure: brokerOrComputed(
        snapshot?.shortMarketValue ?? null,
        exposure.shortExposure,
      ),
      netExposure: brokerOrComputed(snapshot?.netExposure ?? null, exposure.netExposure),
      percentInvested,
      realizedPnl: brokerMetric(snapshot?.realizedPnl ?? null),
    },
    openPositionsCount: input.positions.filter((position) => position.quantity !== 0)
      .length,
    openTradesCount: input.openTradesCount,
  };
}

function exposureFromPositions(positions: PositionInput[]) {
  return positions.reduce(
    (totals, position) => {
      const marketValue = position.marketValue;

      if (marketValue == null) {
        return totals;
      }

      if (position.quantity >= 0) {
        totals.longExposure += Math.abs(marketValue);
      } else {
        totals.shortExposure += Math.abs(marketValue);
      }

      totals.grossExposure = totals.longExposure + totals.shortExposure;
      totals.netExposure = totals.longExposure - totals.shortExposure;
      return totals;
    },
    {
      grossExposure: 0,
      longExposure: 0,
      shortExposure: 0,
      netExposure: 0,
    },
  );
}

function brokerMetric(value: number | null): ProvenancedMetric {
  return {
    value,
    provenance: value == null ? "missing" : "broker_reported",
  };
}

function brokerOrComputed(
  brokerValue: number | null,
  computedValue: number | null,
): ProvenancedMetric {
  if (brokerValue != null) {
    return brokerMetric(brokerValue);
  }

  return computedMetric(computedValue);
}

function computedMetric(value: number | null): ProvenancedMetric {
  return {
    value,
    provenance: value == null ? "missing" : "computed_from_positions",
  };
}
