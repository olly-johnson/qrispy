create index if not exists ohlcv_bars_breadth_metrics_idx
  on public.ohlcv_bars (
    provider,
    timeframe,
    adjusted,
    symbol,
    bar_start_at desc
  )
  include (close);
