export type TradeDirection = "LONG" | "SHORT";
export type TradeStatus = "OPEN" | "CLOSED";
export type FillSide = "BUY" | "SELL";
export type AllocationRole = "ENTRY" | "EXIT";

export const TRADE_SETUP_TYPES = [
  "breakout",
  "episodic_pivot",
  "parabolic_short",
  "mean_reversion",
  "backside",
  "other",
] as const;
export type TradeSetupType = (typeof TRADE_SETUP_TYPES)[number];

export const TRADE_GRADES = ["A", "B", "C", "D", "F"] as const;
export type TradeGrade = (typeof TRADE_GRADES)[number];

export type TradeReview = {
  id: string;
  userId: string;
  tradeId: string | null;
  groupId: string | null;
  setupType: TradeSetupType | null;
  grade: TradeGrade | null;
  summary: string | null;
  whatWentWell: string | null;
  whatWentWrong: string | null;
  lessonsLearned: string | null;
  createdAt: string;
  updatedAt: string;
};

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
