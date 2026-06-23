# Market Context Brief Design

## Goal

Give Qrispy users one trustworthy, compact explanation of the forces moving the US stock market today. The brief covers material market and world news plus scheduled or unexpected events such as FOMC decisions, inflation releases, elections, index inclusions, and options-expiry mechanics. It appears at the top of both the dashboard and `/gappers`, with the dashboard intentionally showing less detail.

## Chosen Approach

Use the app's existing OpenAI Responses/web-search capability to retrieve current, sourced market context and extract it into a strict JSON result. This avoids adding a paid market-calendar or newswire provider while still covering macroeconomic, geopolitical, index, and broad corporate catalysts.

The result is stored durably in Supabase so a manual refresh on one page is immediately the value served to the other page, including across server instances. It is separate from ticker-level gappers news: ticker summaries retain their Massive -> web -> X cascade, while the market brief uses broad web/news retrieval directly.

## Data Model And Access

Add a `public.market_daily_briefs` table with one row per US-equity trading date:

- `market_date date primary key` -- the date in America/New_York.
- `headline text not null` -- the single most important market takeaway.
- `notable_news jsonb not null` -- zero to five sourced market-moving news items.
- `events jsonb not null` -- zero to five event items, each marked `scheduled` or `developing`.
- `sources jsonb not null` -- compact title, publisher, URL, and source id records referenced by the items.
- `generated_at timestamptz not null` and `updated_at timestamptz not null`.

Enable RLS. Authenticated users can select the shared brief; only the server-side Supabase admin client can insert or update it. The refresh endpoint authenticates the requesting user before it performs that privileged write, so browser code never receives the service-role key and no user can directly overwrite the global record.

## Brief Contract

The market-context service returns a structured `MarketContextBrief`:

- `marketDate`, `headline`, `notableNews`, `events`, `sources`, and `generatedAt`.
- Each news/event item has a concise summary, a category, and one or more `sourceIds`.
- Scheduled events include an Eastern-time label when a credible source supplies one; otherwise no time is invented.
- Events distinguish `scheduled` (for example CPI or an FOMC decision) from `developing` (for example a geopolitical escalation or an index-inclusion announcement).

The OpenAI prompt must retrieve only material, current market context for the requested US trading date. It must prioritize primary/authoritative reporting for economic releases and official index or government announcements, express uncertainty instead of guessing, omit items that are not plausibly market-moving, and keep the output bounded to five news items and five events. UI claims must link only to source ids returned in the same response.

## Freshness And Refreshing

All market-date calculations use America/New_York and the existing US-equity trading-day calendar.

- On an actual trading day at or after 7:00 AM ET, the default read is that day's row. If it has not yet been generated, the first server page load generates and stores it.
- Before 7:00 AM ET, and on weekends or market holidays, pages show the most recently available trading-day brief and label it with its generated time/date. They do not silently present it as current-day news.
- The cache becomes eligible for replacement at 7:00 AM ET on the next actual US trading day; it is not reset merely because a calendar day changed.
- The manual refresh control is available on actual US trading days. It bypasses the stored row, performs one fresh retrieval for the current Eastern date, atomically upserts the result, and refreshes the current route so both pages subsequently read the same stored brief.
- On a non-trading day, the control is disabled with a clear label rather than spending money producing a misleading "today" market brief.

## Page Presentation

Create one reusable `MarketContextCard` with a client-side refresh control and two explicit variants.

### Dashboard

Place the compact variant directly below the portfolio header and above the account metric cards. It renders:

- the single most important headline;
- the day's event list only; and
- generated timestamp, source links, and the manual Refresh button.

It does not show the broader notable-news list, preserving the dashboard's terse portfolio focus.

### Gappers

Place the full variant at the top of the page, before `GappersTable`. It renders:

- the same headline;
- up to five notable market/world-news bullets;
- up to five event bullets; and
- a muted source footer plus the same Refresh button.

Both variants use the exact stored brief. The pages must not independently call the retrieval service or synthesize differing summaries.

## Failure Behavior

If retrieval fails but a prior stored brief exists, keep showing that last successful result with its timestamp and a non-alarming stale indicator. If no brief exists, show a compact unavailable state with a retryable Refresh control on trading days. Do not fabricate a headline, events, timestamps, or source links. A failed refresh never replaces a valid stored brief.

## Testing

Implement test-first coverage for:

- Eastern-time 7:00 AM eligibility, prior-trading-day fallback, weekend/holiday behavior, and manual-refresh trading-day rules.
- OpenAI request construction and parsing into a bounded, sourced structured brief, including absent event times and source validation.
- Supabase read/upsert behavior, RLS/grant text in the migration schema test, and preserving the prior row after a failed refresh.
- Refresh API authentication, successful forced refresh, non-trading-day rejection, and response error states.
- Both card variants: dashboard renders headline and events but no notable-news section; gappers renders the complete brief; both render accessible source links, timestamp/state, and refresh feedback.
- Dashboard and gappers loaders use the shared service result rather than direct OpenAI calls.

## Non-Goals

This feature does not predict market direction, replace ticker-level catalyst summaries, add a premium calendar/news subscription, or alter dashboard trade and portfolio metrics.
