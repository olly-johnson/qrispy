import type {
  CanonicalFill,
  ReconstructedTrade,
  TradeDirection,
  TradeFillAllocation,
} from "./types";

type WorkingTrade = Omit<
  ReconstructedTrade,
  "avgEntryPrice" | "avgExitPrice" | "status" | "realizedPnl"
> & {
  netQuantity: number;
  entryNotional: number;
  exitNotional: number;
  exitQuantity: number;
  realizedPnlValue: number;
};

const RECONSTRUCTION_VERSION = 1;

export function reconstructTrades(fills: CanonicalFill[]): ReconstructedTrade[] {
  const sorted = [...fills].sort(compareFills);
  const trades: ReconstructedTrade[] = [];
  let current: WorkingTrade | null = null;

  for (const fill of sorted) {
    let remainingSignedQuantity = signedQuantity(fill);

    while (remainingSignedQuantity !== 0) {
      if (!current) {
        current = startTrade(fill, remainingSignedQuantity);
      }

      if (sameDirection(current.netQuantity, remainingSignedQuantity)) {
        const quantity = Math.abs(remainingSignedQuantity);
        addEntry(current, fill, quantity);
        remainingSignedQuantity = 0;
        continue;
      }

      const closingQuantity = Math.min(
        Math.abs(current.netQuantity),
        Math.abs(remainingSignedQuantity),
      );
      addExit(current, fill, closingQuantity);
      remainingSignedQuantity -= Math.sign(remainingSignedQuantity) * closingQuantity;

      if (current.netQuantity === 0) {
        trades.push(finalizeTrade(current, fill.executedAt));
        current = null;
      }
    }
  }

  if (current) {
    trades.push(finalizeTrade(current, null));
  }

  return trades;
}

function compareFills(left: CanonicalFill, right: CanonicalFill) {
  return (
    left.accountId.localeCompare(right.accountId) ||
    left.symbol.localeCompare(right.symbol) ||
    Date.parse(left.executedAt) - Date.parse(right.executedAt) ||
    left.id.localeCompare(right.id)
  );
}

function signedQuantity(fill: CanonicalFill) {
  return fill.side === "BUY" ? fill.quantity : -fill.quantity;
}

function sameDirection(currentNetQuantity: number, signedFillQuantity: number) {
  return (
    currentNetQuantity === 0 ||
    Math.sign(currentNetQuantity) === Math.sign(signedFillQuantity)
  );
}

function startTrade(fill: CanonicalFill, signedFillQuantity: number): WorkingTrade {
  const direction: TradeDirection = signedFillQuantity > 0 ? "LONG" : "SHORT";

  return {
    id: `${fill.accountId}:${fill.symbol}:${fill.id}`,
    userId: fill.userId,
    accountId: fill.accountId,
    symbol: fill.symbol,
    assetClass: fill.assetClass,
    direction,
    openedAt: fill.executedAt,
    closedAt: null,
    entryQuantity: 0,
    maxAbsQuantity: 0,
    totalFees: 0,
    reconstructionVersion: RECONSTRUCTION_VERSION,
    allocations: [],
    netQuantity: 0,
    entryNotional: 0,
    exitNotional: 0,
    exitQuantity: 0,
    realizedPnlValue: 0,
  };
}

function addEntry(trade: WorkingTrade, fill: CanonicalFill, quantity: number) {
  trade.entryQuantity += quantity;
  trade.entryNotional += quantity * fill.price;
  trade.netQuantity += trade.direction === "LONG" ? quantity : -quantity;
  trade.maxAbsQuantity = Math.max(trade.maxAbsQuantity, Math.abs(trade.netQuantity));
  trade.totalFees += proratedFees(fill, quantity);
  trade.allocations.push(allocation(fill, quantity, "ENTRY"));
}

function addExit(trade: WorkingTrade, fill: CanonicalFill, quantity: number) {
  const averageEntry = trade.entryNotional / trade.entryQuantity;
  const grossPnl =
    trade.direction === "LONG"
      ? (fill.price - averageEntry) * quantity
      : (averageEntry - fill.price) * quantity;

  trade.realizedPnlValue += grossPnl - proratedFees(fill, quantity);
  trade.exitQuantity += quantity;
  trade.exitNotional += quantity * fill.price;
  trade.netQuantity += trade.direction === "LONG" ? -quantity : quantity;
  trade.totalFees += proratedFees(fill, quantity);
  trade.allocations.push(allocation(fill, quantity, "EXIT"));
}

function allocation(
  fill: CanonicalFill,
  quantity: number,
  allocationRole: TradeFillAllocation["allocationRole"],
): TradeFillAllocation {
  return {
    fillId: fill.id,
    allocatedQuantity: quantity,
    allocationRole,
    allocationPrice: fill.price,
  };
}

function proratedFees(fill: CanonicalFill, quantity: number) {
  const totalFees = fill.commission + fill.fees;
  return totalFees * (quantity / fill.quantity);
}

function finalizeTrade(
  trade: WorkingTrade,
  closedAt: string | null,
): ReconstructedTrade {
  return {
    id: trade.id,
    userId: trade.userId,
    accountId: trade.accountId,
    symbol: trade.symbol,
    assetClass: trade.assetClass,
    direction: trade.direction,
    openedAt: trade.openedAt,
    closedAt,
    status: closedAt ? "CLOSED" : "OPEN",
    entryQuantity: trade.entryQuantity,
    maxAbsQuantity: trade.maxAbsQuantity,
    avgEntryPrice: roundMoney(trade.entryNotional / trade.entryQuantity),
    avgExitPrice:
      trade.exitQuantity > 0 ? roundMoney(trade.exitNotional / trade.exitQuantity) : null,
    realizedPnl:
      trade.exitQuantity > 0 ? roundMoney(trade.realizedPnlValue) : null,
    totalFees: roundMoney(trade.totalFees),
    reconstructionVersion: trade.reconstructionVersion,
    allocations: trade.allocations,
  };
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}
