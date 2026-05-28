# Market Data

Polygon is now publicly presented as Massive in current docs, but the Polygon-style REST endpoints remain documented. The app should call this provider through a `market_data_provider` abstraction and store the provider name with every cached bar.

Official docs referenced:

- Stocks overview: <https://massive.com/docs/rest/stocks/overview>
- Custom aggregate bars: `GET /v2/aggs/ticker/{stocksTicker}/range/{multiplier}/{timespan}/{from}/{to}`
- Grouped daily bars: `GET /v2/aggs/grouped/locale/us/market/stocks/{date}`
- Previous day bar: `GET /v2/aggs/ticker/{stocksTicker}/prev`
- EMA indicator: `GET /v1/indicators/ema/{stockTicker}`

## Web-First Provider Access

Polygon/Massive API keys are server-only:

- Store in Vercel environment variables or Supabase Vault.
- Fetch bars from Vercel server routes, Supabase Edge Functions, or a worker.
- Never call Polygon/Massive directly from the browser.

## Bars Needed

Daily bars:

- 20 sessions for ADR%.
- 50-250 sessions for prior move, trend, consolidation, and moving averages.
- SPY/QQQ/IWM daily bars for market regime.
- Optional sector ETF daily bars once a sector mapping exists.

Intraday bars:

- 1-minute bars from 04:00-20:00 ET for EP gap/open analysis and premarket volume.
- 1-minute regular-session bars for ORH/ORL, entry extension, R path, and partial timing.
- 5-minute and opening 60-minute windows can be derived from cached 1-minute bars.

The app remains end-of-day; no streaming market data is required.

## Postgres Cache Policy

Cache key:

```text
provider|symbol|timeframe|session|bar_start|adjusted
```

Rules:

- Never re-fetch a cached bar with the same key.
- Store bars in `ohlcv_bars`.
- Store request attempts in `market_data_requests`.
- Use `adjusted=false` for execution/trade-date analysis so broker fills and bars align around splits.
- Keep cached bars indefinitely.
- Corrections require an explicit rebuild job.

## Endpoint Plan

For each newly closed trade:

1. Fetch symbol daily bars from at least 250 trading days before entry through 20 trading days after exit, unless cached.
2. Fetch symbol 1-minute bars for entry date and exit dates.
3. Fetch SPY, QQQ, IWM daily bars around entry date.
4. Later: fetch sector ETF bars if symbol-sector mapping is available.

Batching:

- Group by unique symbol/date.
- Use range requests where possible.
- Split large minute-bar requests into small enough chunks to avoid aggregate endpoint limits.
- Run as idempotent job steps so a failed provider call can be retried.

## Metrics Derived

- ADR% using Qullamaggie's 20-session `H/L` formula.
- ATR.
- 10/20/50-day moving averages.
- Prior move over 1/3/6 months.
- Consolidation range and tightness.
- Entry extension above pivot/ORH in ATR/ADR units.
- Premarket and opening volume versus average daily volume.
- ORH/ORL on 1-minute, 5-minute, and 60-minute windows.
- R-multiple path after entry.

## Cost Estimate

Current public pricing information found during planning:

- Basic: free, 5 API calls/minute, 2 years historical data, EOD/reference/corporate actions/technical indicators/minute aggregates.
- Starter: about $29/month, unlimited calls, 5 years historical data, 15-minute delayed data, minute aggregates, snapshots, websockets, flat files.
- Developer: about $79/month, unlimited calls, 10 years historical data, adds trades.
- Advanced: about $199/month, 20+ years history, real-time data, quotes, financials/ratios.

Recommendation:

- Basic is fine for a proof of concept.
- Starter is the practical app baseline because a hosted nightly job should not be constrained by 5 calls/minute.
- Developer is only needed if tick-level trades become necessary.
- Advanced is unnecessary for end-of-day coaching unless real-time/quotes/financials become part of the product.

## Vercel/Supabase Runtime Notes

- Market data fetches should be chunked.
- Do not put a large multi-symbol historical backfill inside one Vercel Function.
- Use Postgres uniqueness to prevent duplicate bars when two job invocations race.
- Provider errors should mark only the relevant `job_steps` row as failed.
