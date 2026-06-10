# Stockbee Breadth History Design

## Goal

Persist every valid raw row from the Stockbee Market Monitor CSV so Qrispy can show a full historical breadth table by year and later retrieve those rows during chat.

This feature stores only the Stockbee CSV rows. It does not store NYMO/NASI images, external StockCharts data, derived regime labels, or LLM summaries.

## Current State

The Market Breadth page currently fetches the Stockbee CSV at render time, parses it, and displays the latest slice of rows. If the live CSV is unavailable, no historical Stockbee rows are available from Qrispy.

The app already has Supabase migrations, authenticated pages, server-side market data helpers, and Vitest coverage for Stockbee CSV parsing and breadth display helpers.

## Architecture

Add a persisted `stockbee_breadth_rows` Supabase table. The `date` column is the natural key because the CSV has one row per trading date.

The existing server-side Stockbee fetch remains the source of new data. On each Market Breadth page load:

1. Fetch the live Stockbee CSV.
2. Parse every valid CSV row.
3. Upsert parsed rows into `stockbee_breadth_rows` by `date`.
4. Read persisted rows back from Supabase.
5. Render the historical viewer from persisted rows.

The first page load after deployment backfills every row currently available in the CSV. Later page loads continue updating newly published or corrected rows.

## Data Model

The table stores one column for each CSV field already represented by `StockbeeBreadthRow`:

- `date`
- `up_4_percent`
- `down_4_percent`
- `ratio_5_day`
- `ratio_10_day`
- `up_25_quarter`
- `down_25_quarter`
- `up_25_month`
- `down_25_month`
- `up_50_month`
- `down_50_month`
- `up_13_in_34_days`
- `down_13_in_34_days`
- `universe_count`
- `t2108`
- `sp500`

Metadata columns:

- `source_url`
- `source_fetched_at`
- `created_at`
- `updated_at`

No derived values are stored. Future chat retrieval should query these rows by date range, year, or exact date and cite the row dates.

## Components

Keep CSV parsing and snapshot helpers in `src/lib/market-data/breadth.ts`.

Add a focused persistence helper at `src/lib/market-data/stockbee-breadth-store.ts` for:

- converting `StockbeeBreadthRow` values to Supabase row payloads;
- upserting rows by `date`;
- reading rows in descending date order;
- grouping rows into newest-first year buckets.

Update `src/app/market-breadth/page.tsx` to become the historical viewer. The page should sync on load, then render persisted rows grouped by year.

## UI

The Market Breadth page should keep the existing breadth charts and table style, but the raw row table becomes a historical browser:

- year tabs at the top of the table section;
- newest year selected by default;
- selected year encoded in the query string, for example `/market-breadth?year=2025`;
- one scrollable table showing every persisted row for that year;
- newest rows first within each year.

The table should preserve the existing Stockbee CSV columns and formatting.

## Error Handling

If the live Stockbee fetch or upsert fails, the page should still read and display the last persisted Supabase rows. It should show a small warning explaining that the live sync failed.

If Supabase read fails, the page can fall back to the live parsed rows for the current request and show a warning that persisted history is unavailable.

If both live fetch and persisted read fail, the page should show the existing empty/error state.

## Security

Enable RLS on `stockbee_breadth_rows`.

Authenticated users can read rows. Inserts and updates should be server-side only. Browser code must not receive write access, and no service-role secret can be exposed through `NEXT_PUBLIC_` variables.

Because this is market-wide breadth data rather than user-owned private data, rows do not need a `user_id`.

## Testing

Use TDD for implementation. Tests should cover:

- parsed Stockbee rows convert to Supabase upsert payloads without changing raw values;
- duplicate dates are upserted instead of duplicated;
- rows group into newest-first year buckets;
- data loading can fall back to persisted rows when live sync fails;
- the selected year defaults to the newest available year and respects the `year` query parameter.

Existing CI already runs `npm test`, `npm run lint`, and `npm run build`, so new Vitest tests will be included automatically.

## Future Chat Retrieval

When chat is implemented, this table should be exposed through a read-only retrieval function such as `get_stockbee_breadth_rows({ from, to })` or `get_stockbee_breadth_year(year)`.

The LLM should receive only the requested rows or a bounded date range, not the full table by default.
