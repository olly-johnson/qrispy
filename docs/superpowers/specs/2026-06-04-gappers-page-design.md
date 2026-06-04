# Gappers Page Design

## Goal

Add an authenticated `/gappers` page that shows listed US common stocks and ETFs gapping up with meaningful liquidity. The page should use Massive.com server-side data as freshly as practical, support manual refresh, auto-refresh every 15 minutes, and let the user adjust the screener thresholds without immediately refetching market data.

## Universe

Include active US-listed securities from Massive reference data where:

- `market` is `stocks`, not `otc`.
- `type` is common stock or ETF.
- Non-ETF funds are excluded.

The UI defaults to showing both common stocks and ETFs, with independent toggles so the latest loaded dataset can be filtered client-side.

## Market Session Modes

The screener has two modes.

### Extended-Hours Mode

Use this from 4:00 AM ET until the regular market opens at 9:30 AM ET.

- Volume window: yesterday 4:00 PM-8:00 PM ET plus today 4:00 AM-9:30 AM ET.
- Price: current extended-hours or premarket price when available.
- Gap percent: current extended-hours price versus yesterday's regular-session close.
- Dollar volume: use Massive's direct extended-hours dollar-volume field if one is available; otherwise calculate `extended-hours volume * current extended-hours price`.
- Sort default: extended-hours dollar volume descending.

### Regular-Session Mode

Use this from 9:30 AM ET until the next premarket starts at 4:00 AM ET.

- Volume: current regular-session volume.
- Price: current regular-session or latest snapshot price.
- Gap percent: current price versus yesterday's regular-session close.
- Dollar volume: use Massive's direct regular-session dollar-volume field if one is available; otherwise calculate `regular-session volume * current price`.
- Sort default: regular-session dollar volume descending.

After-hours trading after 4:00 PM ET does not switch the page into a separate after-hours mode. The page keeps showing regular-session results until the next premarket period.

## Data Flow

1. The server fetches active reference ticker data from Massive to identify common stocks and ETFs.
2. The server fetches Massive snapshot data for current price, previous close, current status, and regular-session volume candidates.
3. In extended-hours mode, the server fetches one-minute aggregate bars only for symbols that are plausible candidates after snapshot/reference filtering, then sums the yesterday after-hours and today premarket windows.
4. The server normalizes rows into a dataset containing symbol, name, security type, price, previous close, gap percent, active volume, active dollar volume, mode, and source timestamps.
5. The client receives the latest dataset and applies the adjustable visible filters locally until a refresh occurs.

Massive API keys remain server-only through the existing environment configuration.

## Default Filters

The page defaults to:

- Minimum price: `$0.50`
- Minimum gap: `6%`
- Minimum active dollar volume: `$100,000`
- Security types: common stocks and ETFs
- Sort: active dollar volume descending

Changing these controls updates the displayed table immediately from the currently loaded dataset. The page refetches only when the user presses Refresh, navigates/reloads the page, or the 15-minute timer fires.

## UI

Add a `Gappers` nav item to the existing `AppShell`.

The `/gappers` page should use the existing dark operational style and avoid a marketing layout. The page includes:

- Header with title, current mode label, last updated timestamp, and Refresh button.
- Compact filter bar for minimum price, gap percent, dollar volume, and security type toggles.
- Summary counts for loaded rows and currently visible rows.
- Responsive table with Symbol, Name, Type, Price, Gap %, Volume, Dollar Volume, Previous Close, and Last Updated.
- Empty state when no rows match the current filters.
- Error state when Massive is not configured or a provider call fails.

The Refresh button should disable while a refresh is in progress. Auto-refresh runs every 15 minutes while the page is mounted.

## Error Handling

- Missing `MASSIVE_API_KEY`: show a clear server-side configuration message.
- Massive request failure: show the failed data-source message and keep the UI usable.
- Missing price or previous close: exclude the row because gap percent cannot be calculated reliably.
- Missing volume: treat as zero for filtering and display.

## Testing

Use TDD for implementation.

Core tests:

- Massive provider builds reference, snapshot, and aggregate requests correctly.
- Extended-hours volume sums yesterday 4:00 PM-8:00 PM ET and today 4:00 AM-9:30 AM ET.
- Extended-hours gap percent uses current extended-hours price versus yesterday close.
- Regular-session mode uses regular volume/dollar volume and persists after the close until the next premarket.
- Screener filters price, gap percent, dollar volume, security type, OTC, and fund rows correctly.
- Rows sort by the active dollar-volume field descending.
- Client filters update visible rows without requiring a new fetch.

CI already runs `npm test`, `npm run lint`, and `npm run build`, so the new tests will be included by the existing workflow.
