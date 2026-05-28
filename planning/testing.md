# Testing Strategy

Sprint 1 tests should focus on money/data correctness, idempotency, and access control.

## Unit Tests

Runner:

- Use Vitest for MVP unit/integration-style tests.

Trade reconstruction:

- single buy/sell round trip,
- multi-fill entry,
- partial exits,
- short trade,
- direct flip long 20 -> sell 40 -> short 20,
- open trade remains open.

Normalization:

- TradeZero order/fill payload to canonical fill.
- CSV fallback payload to canonical fill if included.
- fee/proceeds parsing.
- US/Eastern timestamp handling.

Portfolio math:

- cash/equity fields stored from TradeZero snapshot.
- percent invested calculation.
- gross/long/short exposure.
- realized P&L from fills where data supports it.

## Integration Tests

Supabase:

- migrations apply cleanly,
- RLS blocks cross-user access,
- owner can read/write own data,
- service-role job can write scoped records.

Inngest:

- manual sync event creates one job run,
- duplicate event does not duplicate fills,
- failed step can retry,
- one active TradeZero sync per user.

TradeZero:

- use recorded fixtures for API responses,
- do not hit live API in normal test suite,
- live smoke test can be manually run.

## UI Tests

Use Playwright once the dashboard is functional. Do not block the first data pipeline on Playwright setup.

MVP flows:

- unauthenticated user redirected to login,
- owner sees dashboard,
- manual sync button starts job,
- dashboard shows job status,
- trades table renders reconstructed trades,
- trade detail shows fills.

Responsive checks:

- desktop dashboard,
- laptop width,
- mobile basic usability.

Visual checks:

- dark theme contrast,
- table numbers fit,
- no overlapping dashboard elements,
- loading/sync motion does not shift layout.

## Test Data

Fixtures:

- TradeZero account list response.
- TradeZero P&L/account response.
- TradeZero positions response.
- TradeZero historical orders/fills response.
- direct flip fill sequence.
- empty account/no positions.

Decision:

- Sanitized TradeZero API response fixtures may be stored in the repo.
- Fixtures must remove or replace account ids, personal identifiers, API keys, and any sensitive balances/trades you do not want committed.

## Decisions Needed

- Which sanitized TradeZero fixture cases should be created first beyond the direct flip example?
