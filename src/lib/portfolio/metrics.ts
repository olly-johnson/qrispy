export type MetricProvenance =
  | "broker_reported"
  | "computed_from_positions"
  | "computed_from_fills"
  | "computed_from_stops"
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
  accountId?: string;
  symbol: string;
  quantity: number;
  marketValue: number | null;
};

export type OpenTradeStopInput = {
  accountId: string;
  symbol: string;
  direction: string;
  quantity: number | null;
  stopLossPrice: number | null;
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
  openTrades?: OpenTradeStopInput[];
  openTradesCount: number;
}): PortfolioSummary {
  const snapshot = input.snapshot;
  const exposure = exposureFromPositions(input.positions);
  const equity = stopOutEquityMetric(
    snapshot?.equity ?? null,
    input.positions,
    input.openTrades ?? [],
  );
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

function stopOutEquityMetric(
  brokerEquity: number | null,
  positions: PositionInput[],
  openTrades: OpenTradeStopInput[],
): ProvenancedMetric {
  if (brokerEquity == null) {
    return brokerMetric(null);
  }

  const adjustment = openTrades.reduce((total, trade) => {
    if (trade.stopLossPrice == null) {
      return total;
    }

    const position = positions.find((candidate) =>
      candidate.symbol === trade.symbol &&
      (candidate.accountId == null || candidate.accountId === trade.accountId) &&
      Math.abs(candidate.quantity) > 0 &&
      candidate.marketValue != null
    );

    if (!position || position.marketValue == null) {
      return total;
    }

    const absQuantity = Math.abs(position.quantity);
    const currentMarketValue = Math.abs(position.marketValue);
    const stopQuantity =
      trade.quantity == null || trade.quantity <= 0
        ? absQuantity
        : Math.min(trade.quantity, absQuantity);
    const currentTradeValue = (currentMarketValue / absQuantity) * stopQuantity;
    const stoppedTradeValue = stopQuantity * trade.stopLossPrice;

    if (trade.direction === "SHORT") {
      return total + currentTradeValue - stoppedTradeValue;
    }

    return total + stoppedTradeValue - currentTradeValue;
  }, 0);

  if (adjustment === 0) {
    return brokerMetric(brokerEquity);
  }

  return {
    value: roundMoney(brokerEquity + adjustment),
    provenance: "computed_from_stops",
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
