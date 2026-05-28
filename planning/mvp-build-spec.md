# MVP Build Spec

Sprint 1 goal: connect to TradeZero, pull account/trade data, store it in Supabase Postgres, reconstruct trades, and display a professional portfolio/trade tracking dashboard.

The LLM evaluator, Qullamaggie coaching, KB compile, market-data enrichment, and chat are deferred to sprint 2+.

## MVP Scope

Included:

- Vercel-hosted Next.js app.
- Supabase Auth.
- Supabase Postgres schema for user, broker connection metadata, accounts, balances, positions, fills, reconstructed trades, and job history.
- TradeZero API connection using server-side credentials.
- Manual "Sync TradeZero now" button.
- Scheduled sync through Inngest.
- Account summary dashboard:
  - equity,
  - cash,
  - buying power if available,
  - gross exposure,
  - long exposure,
  - short exposure,
  - percent invested,
  - open positions,
  - realized P&L from reconstructed closed trades where possible.
- Trades page:
  - reconstructed zero-to-zero trades,
  - open/closed status,
  - direction,
  - fills,
  - realized P&L,
  - fees.
- Positions page:
  - current TradeZero positions from API,
  - quantity,
  - average price if available,
  - market value if available,
  - unrealized P&L if available.
- Job status page or dashboard panel.

Excluded:

- LLM classification/coaching.
- Qullamaggie rules engine.
- Polygon/Massive market data.
- KB compile.
- Chat.
- CSV import unless needed as fallback during API validation.
- Multi-user product features beyond single-owner auth/RLS.

## Recommended Stack

- Next.js App Router.
- TypeScript.
- Vercel.
- Supabase Auth/Postgres/Storage.
- Inngest for background jobs and scheduling.
- shadcn/ui or equivalent Radix-based component foundation.
- Tailwind CSS.
- Framer Motion or Motion for React for restrained motion.
- Recharts, Tremor, or lightweight custom chart components for portfolio/trade visuals.

## Locked MVP Decisions

- Auth method: Supabase email/password.
- TradeZero credentials: Vercel server environment variables for MVP.
- Backfill start date: `2026-01-01`.
- Currency: USD only.
- Dashboard priority: portfolio state first.
- UI density: roomier fintech dashboard, not compact terminal.
- Theme: dark-only.
- CSV fallback: deferred unless TradeZero API backfill is incomplete.
- Test fixtures: sanitized TradeZero API response fixtures may be stored in the repo.
- Public signup: disabled; only the owner account can access the app.
- Positions and trades: separate pages.
- Equity history chart: included from MVP, even with sparse snapshots.
- Test runner: Vitest.
- Playwright: add once dashboard is functional, not before.
- Dashboard number provenance: broker-reported values are authoritative; computed fallbacks are allowed for derived/missing metrics and must be tagged internally.
- Manual sync: refresh accounts, account snapshots, positions, orders/fills, and reconstructed trades.
- Positions-only quick refresh: defer until full sync proves too slow.
- Provenance UI: show a subtle info icon/tooltip only for computed values.

## First User Flow

1. User visits Qrispy URL.
2. User signs in.
3. Dashboard shows empty state and prompts to configure TradeZero.
4. TradeZero API credentials are already configured in Vercel server environment variables.
5. User clicks "Sync TradeZero".
6. App sends an Inngest event.
7. Inngest function:
   - pulls TradeZero accounts,
   - pulls account P&L/equity,
   - pulls current positions,
   - pulls historical/paginated orders,
   - upserts normalized fills,
   - reconstructs trades.
8. Dashboard updates with portfolio summary, positions, and trades.

## MVP Pages

`/login`

- Supabase Auth sign-in.

`/`

- Redirects to dashboard if authenticated.

`/dashboard`

- Portfolio summary.
- Sync status.
- Equity/cash/exposure cards.
- Open positions snapshot.
- Recent trades.
- Lightweight animated elements tied to data changes and sync progress.

`/trades`

- Table of reconstructed trades.
- Filters: date range, symbol, status, direction.

`/trades/[id]`

- Trade summary.
- Fill allocations.
- P&L and fees.
- Notes placeholder for future evaluation sprint.

`/positions`

- Current positions from latest sync.

`/jobs`

- Recent sync runs, step status, errors.

`/settings`

- Connection status.
- Last sync.
- Sync button.
- Later: provider/API config UI.

## MVP Data Pipeline

```text
manual sync / scheduled sync
  -> inngest event tradezero/sync.requested
  -> sync accounts
  -> sync balances/account snapshot
  -> sync current positions
  -> sync historical orders/fills
  -> normalize fills
  -> reconstruct trades
  -> write job summary
  -> dashboard reads latest snapshots/trades
```

## Acceptance Criteria

- App deploys on Vercel.
- Only authenticated owner can access pages.
- TradeZero credentials are never exposed to the browser.
- Manual sync imports account, balance, position, and fill/order data.
- Re-running sync does not duplicate fills or trades.
- Direct flip reconstruction works.
- Dashboard shows latest equity, cash, percent invested, open positions, and recent trades.
- Job history shows success/failure and useful errors.
- LLM/evaluator UI is visibly out of scope or marked "coming later," not half-built.

## Remaining Sprint 1 Decisions

- None currently blocking implementation.

## Dashboard Metric Provenance

Use TradeZero fields as authoritative when available. Compute fallbacks for derived metrics or missing fields only.

Suggested provenance labels:

- `broker_reported`
- `computed_from_positions`
- `computed_from_fills`
- `missing`

Metric handling:

- Equity, cash, buying power: prefer TradeZero values only.
- Percent invested: compute as `gross_exposure / equity` if not reported.
- Gross exposure: compute from absolute position market values if not reported.
- Long exposure: compute from long position market values if not reported.
- Short exposure: compute from absolute short position market values if not reported.
- Net exposure: compute long exposure minus short exposure if not reported.
- Realized P&L: prefer TradeZero for account/day; compute per-trade realized P&L from fills for reconstructed trades.
- Unrealized P&L: prefer TradeZero positions; compute later from market data only once reliable prices are available.

UI handling:

- Broker-reported values need no visible badge by default.
- Computed values should show a subtle info icon/tooltip explaining their source.
- Missing values should show a neutral placeholder and avoid fake zeroes.
