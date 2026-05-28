# Ingestion

TradeZero API and CSV imports both converge into the same Supabase Postgres `fills` table. The ingestion layer must be idempotent because web cron jobs and retries can run more than once.

## TradeZero API Plan

API keys are now available, so the MVP should validate this integration directly against TradeZero.

Official docs referenced:

- TradeZero Developer Portal: <https://developer.tradezero.com/>
- Authentication headers: `TZ-API-KEY-ID`, `TZ-API-SECRET-KEY`
- Account list: `GET /v1/api/accounts`
- Account details: `GET /v1/api/account/:accountId`
- Account P&L/equity values: `GET /v1/api/accounts/:accountId/pnl`
- Today's orders: `GET /v1/api/accounts/:accountId/orders`
- Historical orders: `GET /v1/api/accounts/:accountId/orders/start-date/:startDate`
- Historical paginated orders: `GET /v1/api/accounts/:accountId/orders-with-pagination/start-date/:startDate`
- Positions: `GET /v1/api/accounts/:accountId/positions`

The TradeZero docs/recipes indicate that historical orders can be returned at fill level with fields such as `tradeId`, `qty`, `price`, `commission`, `totalFees`, and `netProceeds`. Validate this against your live account once developer access is granted.

## Secret Handling

TradeZero credentials are server-only:

- Store in Vercel environment variables or Supabase Vault.
- Never send credentials to the browser.
- API ingestion runs through a server route, Edge Function, or background worker using service-role access to write normalized fills.

## API Sync Strategy

MVP sync:

1. User clicks "Sync TradeZero" or a schedule sends an Inngest event.
2. Create or resume a `job_runs` row for the sync scope.
2. Pull accounts with `GET /v1/api/accounts`.
3. Upsert account metadata.
4. Pull account P&L/equity and create `account_portfolio_snapshots`.
5. Pull current positions and create `broker_position_snapshots`.
6. Pull historical paginated orders from last successful sync date minus overlap.
7. Normalize filled executions into `fills`.
8. Reconstruct affected account/symbol trades.
9. Update `sync_cursors`.

Overlap:

- Re-query at least the last 7 calendar days.
- For initial API backfill, use paginated history in chunks.
- CSV remains the fallback for older history or API gaps, but it is not required for the first MVP unless API validation fails.

Rate limits:

- Public docs found during planning did not expose numeric rate limits.
- Use conservative request pacing, bounded concurrency, exponential backoff on `429`/`5xx`, and job-step retry.

## CSV Importer Spec

CSV import is deferred to sprint 1.5 unless TradeZero API history proves insufficient for MVP tracking.

Target format: TradeZero client portal Trading History CSV only.

Observed columns:

```text
Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note
```

Web-first upload flow:

1. User uploads CSV in the browser.
2. File is stored in a private Supabase Storage bucket, e.g. `trade-imports`.
3. `import_batches` row stores file metadata and hash.
4. Server-side parser reads the file and inserts normalized fills.
5. UI shows imported row count, duplicates, and errors.

Mapping:

| CSV column | Normalized field |
| --- | --- |
| `Account` | `accounts.broker_account_id` |
| `T/D` | `fills.trade_date` |
| `S/D` | `fills.settlement_date` |
| `Currency` | `fills.currency` |
| `Side` | `fills.side` |
| `Symbol` | `fills.symbol` |
| `Qty` | `fills.quantity` |
| `Price` | `fills.price` |
| `Exec Time` | combine with `T/D` into `fills.executed_at` |
| `Comm` | `fills.commission` |
| `SEC` | `fills.sec_fee` |
| `TAF` | `fills.taf_fee` |
| `NSCC` | `fills.nscc_fee` |
| `Nasdaq` | `fills.nasdaq_fee` |
| `ECN Remove` | `fills.ecn_remove_fee` |
| `ECN Add` | `fills.ecn_add_rebate` |
| `Gross Proceeds` | `fills.gross_proceeds` |
| `Net Proceeds` | `fills.net_proceeds` |
| `Clr Broker` | `fills.clearing_broker` |
| `Liq` | `fills.liquidity_flag` |
| `Note` | `fills.note` |

Timezone:

- Treat CSV `T/D + Exec Time` as US/Eastern.
- Store `executed_at` as `timestamptz`.
- Store `executed_tz = America/New_York`.

Side normalization:

- `B` maps to `BUY`.
- `S` maps to `SELL`.
- Do not infer `open_close` from CSV alone; reconstruction determines opening/closing by net position.

## Idempotency

API fills:

- Prefer broker-provided execution id or `tradeId`.
- Fallback key: broker, account, symbol, side, quantity, price, executed_at, net proceeds, commission.

CSV fills:

- Compute a file hash.
- Compute row keys from normalized row values:
  `tradezero_csv|account|trade_date|exec_time|symbol|side|qty|price|gross|net|commission|row_index_within_same_timestamp_group`.
- Enforce `unique (user_id, idempotency_key)` in Postgres.

Scheduler idempotency:

- `job_runs` has a unique job idempotency key.
- each step should check whether target records already exist before inserting.
- failed steps can be retried safely.

Collision handling:

- If an incoming row has the same key but materially different raw payload, flag for review.
- If API and CSV likely describe the same fill but lack a common broker id, mark possible duplicate instead of auto-deleting.

## Account Equity Automation

Primary:

- Pull `GET /v1/api/accounts/:accountId/pnl` after close.
- Store portfolio snapshots with equity, buying power, cash, exposure, percent invested, and raw payload where available.
- If TradeZero does not provide exposure/percent invested directly, compute from current positions and latest account equity.

Fallback:

- Manual snapshot form in the web UI.
- Later: broker statement upload/import.

## MVP Web App Acceptance

- Manual TradeZero sync works from the web UI.
- Latest account snapshot and positions are visible.
- Historical fills/orders persist in Supabase.
- Re-running sync is idempotent.
- A user cannot read another user's brokerage data.
- TradeZero credentials are never visible in browser logs or client bundles.

## Later CSV Acceptance

- CSV upload works from any device.
- Import results are visible immediately.
- Re-uploading the same file creates no duplicate fills.
