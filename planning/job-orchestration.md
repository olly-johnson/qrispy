# Job Orchestration

Use Inngest for MVP background jobs and scheduled syncs.

Why Inngest:

- first-class Next.js/Vercel support,
- durable step execution,
- retries and observability,
- idempotency controls,
- concurrency controls,
- free Hobby tier is enough for MVP-scale syncs.

Official docs checked:

- Next.js serving functions: <https://www.inngest.com/docs/learn/serving-inngest-functions>
- Idempotency: <https://www.inngest.com/docs/guides/handling-idempotency>
- Concurrency: <https://www.inngest.com/docs/functions/concurrency>
- Pricing: <https://www.inngest.com/pricing>

## MVP Events

```text
tradezero/sync.requested
tradezero/sync.completed
tradezero/sync.failed
tradezero/backfill.requested
positions/refresh.requested
```

Each event should include:

- `user_id`,
- `requested_by`: `manual` or `schedule`,
- `sync_scope`: `daily`, `backfill`, `positions_only`,
- `from_date`,
- `to_date`,
- `idempotency_key`.

## MVP Functions

`tradezero-sync`

Trigger:

- `tradezero/sync.requested`

Steps:

1. Create or resume `job_runs`.
2. Sync accounts.
3. Sync account snapshot/equity/cash.
4. Sync current positions.
5. Sync orders/fills.
6. Reconstruct affected trades.
7. Mark job complete.

`tradezero-backfill`

Trigger:

- `tradezero/backfill.requested`

Steps:

1. Split date range into chunks.
2. Send chunk events or loop through chunks with durable steps.
3. Reuse fill normalization and reconstruction.

## Idempotency

Use both Inngest and Postgres idempotency.

Inngest:

- event ids for manual/scheduled sync requests,
- function-level idempotency for unique user/date/scope combinations.

Postgres:

- `job_runs.unique(user_id, job_type, idempotency_key)`,
- `fills.unique(user_id, idempotency_key)`,
- `broker_position_snapshots.unique(account_id, snapshot_at, symbol)` or equivalent,
- `account_portfolio_snapshots.unique(account_id, snapshot_at, source)`.

## Concurrency

MVP should limit TradeZero sync to one active sync per user.

Concurrency key:

```text
event.data.user_id + "-tradezero-sync"
```

This prevents manual sync and scheduled sync from racing.

## Scheduling

Use Inngest scheduled functions if available for the project, or Vercel Cron to send the Inngest event. The function itself should be identical either way.

Suggested schedule:

- weekdays after US market close, e.g. 17:30 US/Eastern,
- optional manual sync any time from UI.

Because the user is UK-based, display local UI times in Europe/London but store market/trade times in US/Eastern and UTC.

## Error Handling

Every failed step should record:

- provider,
- endpoint/action,
- request scope,
- error message,
- retryable/non-retryable classification,
- attempt count,
- timestamp.

The UI should show "last successful sync" separately from "latest attempted sync."

## Future Jobs

Sprint 2+ can add:

- Polygon/Massive enrichment,
- LLM trade evaluation,
- KB compile,
- personal wiki compile,
- chat memory proposal jobs.
