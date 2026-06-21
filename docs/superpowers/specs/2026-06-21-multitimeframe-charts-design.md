# Multi-Timeframe Charts Design

## Goal

Add an authenticated `/charts` research page where a trader selects a ticker and inclusive date range, then compares a daily chart with a tabbed intraday chart for the same selection.

## Layout and interaction

- Add `Charts` to the application navigation.
- The page contains a URL-backed form with ticker, start date, and end date fields.
- Results render as two independent charts visible together on desktop: a daily chart and an intraday chart. On narrow screens, they stack while remaining independently pannable and scrollable.
- The intraday chart has `1 hour`, `5 minute`, and `1 minute` tabs. Switching a tab changes only the intraday chart.
- Charts use Lightweight Charts with a crosshair and horizontal pan/scroll. They initially position at the selected range's start, so the user can scroll forward through the requested data.

## Date windows

- The selected start and end dates are inclusive and apply to every request.
- Daily requests pad a short selected range with enough daily bars before and after it to provide a 50-trading-session initial context. Padding is daily-only; it is never used for intraday requests.
- Intraday requests are limited to the selected range and filter bars to regular US equity-market hours: 09:30 through 16:00 America/New_York, Monday through Friday. Holidays simply produce no bars.
- Initial visible windows, anchored at the selected range start, are 50 daily sessions, 10 trading days for 1 hour, 2 trading days for 5 minute, and 1 trading day for 1 minute. If fewer bars exist, show all returned bars.

## Data and indicators

- Reuse the Massive aggregate-bar provider and the existing cache path. Extend its supported timeframes to include one-minute aggregates.
- Build a focused chart-data module that validates and normalizes the URL filters, requests daily and intraday data, applies regular-hours filtering, and calculates overlays.
- Every chart displays candlesticks and volume.
- Daily overlays: 10 SMA purple, 20 SMA yellow, 50 SMA red, 100 SMA green, and 200 SMA blue.
- Intraday overlays: 10 EMA purple, 20 EMA yellow, 65 EMA white, and session-reset VWAP orange.

## States and errors

- Reject blank or invalid tickers, missing dates, and a start date later than its end date before making data requests.
- Show a clear page-level state when the Massive API key is unavailable, and per-chart empty states when an otherwise valid request returns no bars.
- Preserve entered filters in the URL so refreshed, shared, and bookmarked links reproduce the same analysis.

## Testing

- Unit-test filter parsing and validation, requested ranges, regular-hours filtering, daily padding, overlay selection and colors, VWAP calculations, and visible-window configuration.
- Add component tests for the form and tab contract where the existing Vitest/jsdom setup can exercise them.
- Cover the new code through the existing `npm test` script, which is already used by the project test workflow.
