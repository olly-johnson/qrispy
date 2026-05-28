export type TradeDirection = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";
export type FillSide = "BUY" | "SELL";
export type AllocationRole = "ENTRY" | "EXIT";

export type CanonicalFill = {
  id: string;
  userId: string;
  accountId: string;
  broker: string;
  sourceType?: "api" | "csv";
  sourceFillId?: string;
  idempotencyKey: string;
  symbol: string;
  assetClass: string;
  side: FillSide;
  quantity: number;
  price: number;
  executedAt: string;
  executedTz?: string;
  tradeDate: string;
  currency: string;
  commission: number;
  fees: number;
  grossProceeds?: number;
  netProceeds?: number;
  rawPayload?: unknown;
};

export type TradeFillAllocation = {
  fillId: string;
  allocatedQuantity: number;
  allocationRole: AllocationRole;
  allocationPrice: number;
};

export type ReconstructedTrade = {
  id: string;
  userId: string;
  accountId: string;
  symbol: string;
  assetClass: string;
  direction: TradeDirection;
  openedAt: string;
  closedAt: string | null;
  status: TradeStatus;
  entryQuantity: number;
  maxAbsQuantity: number;
  avgEntryPrice: number;
  avgExitPrice: number | null;
  realizedPnl: number | null;
  totalFees: number;
  reconstructionVersion: number;
  allocations: TradeFillAllocation[];
};
