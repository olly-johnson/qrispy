# Sector Breadth Design

## Goal

Add a separate authenticated page that shows how common stocks are performing today by sector, then by industry, then by stock. The page should help identify where market strength and weakness are concentrated during the session.

The classification will be GICS-style, but not official GICS. Official GICS company mappings are proprietary. To avoid paid data, Qrispy will use a free SIC-derived classification map that assigns common stocks into familiar sector buckets and uses the SIC description, or a normalized equivalent, as the industry label.

## Current State

Qrispy already has:

- server-rendered authenticated pages using `AppShell`;
- a Massive.com provider with full-market snapshots, active ticker reference data, and aggregate bars;
- a `/gappers` page that fetches Massive data server-side;
- existing Stockbee market breadth history on `/market-breadth`;
- Vitest, lint, and build checks in CI.

There is no current sector or industry classification table. Planning notes mention sector ETF data as future work once symbol-sector mapping exists.

## Scope

Create a new `/sector-breadth` page for US common stocks only. ETFs, funds, OTC symbols, and unclassified symbols should not be included in sector/industry breadth totals.

The page will show:

- a top live breadth card with updated T2108, up 4% vs down 4%, up 13% vs down 13%, 5-day ratio, and 10-day ratio;
- sector-first performance rows/cards;
- a sector drilldown that reveals industries;
- an industry drilldown that reveals stocks with today percentages;
- data coverage notes for missing classification or missing historical bars.

## Data Sources

### Massive Market Data

Massive remains the source for live and historical market data:

- full-market snapshot for current price, previous close, current session volume, and last updated time;
- active reference tickers for common-stock universe filtering;
- daily aggregate bars for 40-day moving average, 34-session change, and historical up/down 4% counts.

Massive API keys stay server-side. Browser code must never call Massive directly.

The sector breadth page should reuse the existing Massive provider methods used by the gappers page. Implementation should extract shared helpers for active common-stock universe filtering and full-market snapshot normalization where useful, so gappers and sector breadth do not duplicate provider-shape parsing. The sector breadth page must still load independently; it should not depend on the gappers page being visited first. Existing in-process reference ticker caching can be reused as an optimization.

### Free SIC-Derived Classification

Add a classification import/cache independent of live market data. Classification lookup should not fetch one ticker overview per symbol during page render. The page should read a local cache that can be refreshed by a separate import step.

The app should store rows such as:

- `ticker`
- `name`
- `sector`
- `industry`
- `source`
- `source_updated_at`

For production, the first free source should be Massive ticker details where available, because it can provide industry classification fields from the same provider already configured. SEC SIC code/description data can be used to normalize those descriptions into sector buckets.

The implementation should not hard-code classifications into React components. Classification rows should live in a `stock_classifications` Supabase table, with tests using in-memory fixtures. The source can then be replaced later without changing the page calculations.

## Classification Rules

The sector labels should follow familiar GICS-style names:

- Communication Services
- Consumer Discretionary
- Consumer Staples
- Energy
- Financials
- Health Care
- Industrials
- Information Technology
- Materials
- Real Estate
- Utilities

Because this is SIC-derived, not official GICS, the UI should label the source clearly as `SIC-derived classification`.

Rows without a classification are excluded from sector and industry totals. The page should show a small coverage note with mapped, unmapped, and total common-stock counts.

## Calculations

For each mapped common stock with valid Massive snapshot data:

- today percent equals `(current price - previous close) / previous close * 100`;
- green count includes stocks with today percent greater than 0;
- red count includes stocks with today percent less than 0;
- flat count includes stocks with a raw today percent equal to 0;
- sector and industry performance should include average today percent and median today percent.

For the live breadth card:

- up 4% count includes mapped common stocks with today percent greater than or equal to 4;
- down 4% count includes mapped common stocks with today percent less than or equal to -4;
- T2108 is the percentage of covered common stocks trading above their 40-day moving average;
- up 13% in 34 days compares latest/current close with the close 34 trading sessions ago;
- down 13% in 34 days uses the same comparison with a -13% threshold;
- 5-day ratio and 10-day ratio use Stockbee-style breadth ratio logic over recent up-4/down-4 counts, with today's live counts included when the market day is in progress.

If a ticker has live snapshot data but not enough historical bars, it remains in today's sector/industry performance but is excluded from the specific historical metric that needs missing bars. Coverage counts should be shown for historical metrics.

## UI

The primary interaction is:

```text
Sector -> Industry -> Stocks
```

The first view shows sectors. Each sector should display:

- sector name;
- average and median today percent;
- up, down, and flat counts;
- net breadth tone;
- small green/red previews, such as strongest and weakest ticker percentages.

Clicking a sector expands or navigates to industry rows for that sector. Each industry row should display:

- industry name;
- average and median today percent;
- up, down, and flat counts;
- strongest green stock;
- weakest red stock.

Clicking an industry reveals stocks:

- ticker;
- company name;
- today percent;
- current price;
- active volume when available;
- last updated time when available.

The main green/red lists should not be global flat lists. They should be organized through sector and industry drilldown. A compact market leaders/laggards strip can be added later, but it is not part of the initial scope.

## Error Handling

- Missing Massive API key: show a clear configuration message and no fake data.
- Massive snapshot failure: show the provider error while keeping the page shell usable.
- Missing classification data: show a setup message explaining that SIC-derived classifications must be imported or seeded.
- Partial classification coverage: show mapped/unmapped counts and exclude unmapped rows from sector totals.
- Partial historical coverage: calculate available metrics and show coverage counts beside affected breadth values.

## Testing

Use TDD for implementation. Tests should cover:

- common-stock universe filtering excludes ETFs, funds, inactive rows, and OTC rows;
- SIC-derived classification rows group into sector, industry, and stock levels;
- today percentage, average, median, up/down/flat counts, and green/red ordering;
- up 4% vs down 4% counts from live snapshots;
- T2108 from 40-day moving averages;
- up/down 13% in 34 days from historical bars;
- 5-day and 10-day ratios from recent daily up/down 4% counts plus today's live counts;
- missing classification and missing history coverage behavior;
- page loader behavior for missing Massive config and provider errors.

Existing CI already runs `npm test`, `npm run lint`, and `npm run build`, so the new tests will be included automatically.

## Future Work

- Replace SIC-derived mapping with licensed GICS data if a paid source becomes available.
- Persist daily derived sector breadth snapshots for historical sector analysis.
- Add trend charts per sector and industry.
- Add chat retrieval functions for sector breadth summaries.
