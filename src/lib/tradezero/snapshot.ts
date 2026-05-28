type JsonObject = Record<string, unknown>;

export type TradeZeroPositionSnapshot = {
  symbol: string;
  quantity: number;
  averagePrice: number | null;
  lastPrice: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
};

export function buildTradeZeroPortfolioSnapshot(input: {
  pnl: JsonObject;
  positionSnapshots: Array<Pick<TradeZeroPositionSnapshot, "quantity" | "marketValue">>;
}) {
  const equity = numberFrom(input.pnl, ["equity", "accountValue"]);
  const grossExposure = numberFrom(input.pnl, ["grossExposure", "gross_exposure", "exposure"]);
  const exposure = exposureFromPositions(input.positionSnapshots);

  return {
    cash: numberFrom(input.pnl, ["cash", "cashBalance", "availableCash"]),
    dayPnl: numberFrom(input.pnl, ["dayPnl", "day_pnl"]),
    equity,
    grossExposure,
    longMarketValue: exposure.longMarketValue,
    netExposure: exposure.netExposure,
    percentInvested: equity && grossExposure != null ? grossExposure / equity : null,
    realizedPnl: numberFrom(input.pnl, ["realizedPnl", "realized_pnl", "dayRealized"]),
    shortMarketValue: exposure.shortMarketValue,
    unrealizedPnl: numberFrom(input.pnl, [
      "unrealizedPnl",
      "unrealized_pnl",
      "totalUnrealized",
      "dayUnrealized",
    ]),
  };
}

export function buildTradeZeroPositionSnapshot(input: {
  pnl: JsonObject;
  position: JsonObject;
}): TradeZeroPositionSnapshot {
  const positionPnl = findPositionPnl(input.pnl, input.position);
  const quantity = numberFrom(input.position, ["quantity", "qty", "shares"], 0) ?? 0;
  const marketValue = numberFrom(positionPnl, [
    "marketValue",
    "market_value",
    "exposure",
  ]);

  return {
    symbol: stringFrom(input.position, ["symbol"]).toUpperCase(),
    quantity,
    averagePrice: numberFrom(input.position, ["averagePrice", "avgPrice", "priceAvg"]),
    lastPrice:
      numberFrom(input.position, ["lastPrice", "price"]) ??
      priceFromMarketValue(marketValue, quantity),
    marketValue,
    unrealizedPnl: numberFrom(positionPnl, [
      "unrealizedPnl",
      "unrealized_pnl",
      "unrealizedPnL",
    ]),
  };
}

function findPositionPnl(pnl: JsonObject, position: JsonObject) {
  const rows = Array.isArray(pnl.pnl) ? pnl.pnl : [];
  const positionId = stringFrom(position, ["positionId"], "");
  const symbol = stringFrom(position, ["symbol"], "").toUpperCase();

  return (
    rows.find((row) => {
      if (!row || typeof row !== "object") {
        return false;
      }
      const candidate = row as JsonObject;
      return (
        stringFrom(candidate, ["positionId"], "") === positionId ||
        stringFrom(candidate, ["symbol"], "").toUpperCase() === symbol
      );
    }) as JsonObject | undefined
  ) ?? {};
}

function exposureFromPositions(
  positions: Array<Pick<TradeZeroPositionSnapshot, "quantity" | "marketValue">>,
) {
  return positions.reduce(
    (totals, position) => {
      if (position.marketValue == null) {
        return totals;
      }

      if (position.quantity >= 0) {
        totals.longMarketValue += Math.abs(position.marketValue);
      } else {
        totals.shortMarketValue += Math.abs(position.marketValue);
      }

      totals.netExposure = totals.longMarketValue - totals.shortMarketValue;
      return totals;
    },
    {
      longMarketValue: 0,
      netExposure: 0,
      shortMarketValue: 0,
    },
  );
}

function priceFromMarketValue(marketValue: number | null, quantity: number) {
  if (marketValue == null || quantity === 0) {
    return null;
  }

  return Math.abs(marketValue / quantity);
}

function stringFrom(payload: JsonObject, keys: string[], fallback?: string) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  if (fallback != null) {
    return fallback;
  }

  throw new Error(`Missing field: ${keys.join(" or ")}`);
}

function numberFrom(payload: JsonObject | undefined, keys: string[], fallback?: number) {
  if (!payload) {
    return fallback ?? null;
  }

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replaceAll(",", ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback ?? null;
}
