export type MarketDataTimeframe = "1d" | "1w" | "1m" | "5m" | "1h";

export type OhlcvBar = {
  provider: string;
  symbol: string;
  timeframe: MarketDataTimeframe;
  barStartAt: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjusted: boolean;
  rawPayload: unknown;
};

export type MarketDataRequest = {
  symbol: string;
  timeframe: MarketDataTimeframe;
  from: string;
  to: string;
  adjusted: boolean;
};

export type MarketDataProvider = {
  name: string;
  getAggregateBars(request: MarketDataRequest): Promise<OhlcvBar[]>;
};

export type IndicatorPoint = {
  time: string;
  value: number;
};
