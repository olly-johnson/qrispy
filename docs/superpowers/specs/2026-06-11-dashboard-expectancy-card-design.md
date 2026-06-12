# Dashboard Expectancy Card Design

## Goal

Add a dashboard card that shows the break-even reward:risk curve against batting average, using the user's own closed trade history instead of static example labels.

## Data Scope

The card will calculate two personal snapshots from reconstructed trades:

- All closed trades with a finite realized P&L.
- The 30 most recent closed trades with a finite realized P&L, ordered by `closedAt` when available and falling back to `openedAt`.

Open trades and trades with null realized P&L are excluded from both calculations.

## Metrics

For each snapshot:

- Batting average is winning trades divided by total included trades.
- Average gain is the mean positive realized P&L.
- Average loss is the absolute mean negative realized P&L.
- Average gain / average loss is average gain divided by average loss.

If a snapshot has no losses, the reward:risk value is unavailable rather than infinite. If a snapshot has no completed trades, the card renders an empty state for that snapshot.

## Chart

The chart will render the reference break-even curve:

`required reward:risk = (1 - winRate) / winRate`

The visible x-axis will cover 20% to 70% batting average. The y-axis will cover 0 to 4 reward:risk. The chart will use an inline SVG so the dashboard stays server-rendered and avoids adding client-side chart JavaScript.

The card will plot two markers:

- All trades
- Last 30

Each marker uses its batting average for x and actual average gain / average loss for y. Markers above the curve indicate profitable expectancy for that window, and markers below the curve indicate losing expectancy. Values outside the visible chart range will be clamped to the nearest edge for display while preserving the numeric stat text.

## UI Placement

The card will appear on the dashboard below the existing portfolio metric cards and near the market breadth card. It will follow the existing dashboard card style: dark background, subtle border, compact labels, mono numeric values, and restrained accent colors.

The card will include:

- Title: `Reward:Risk vs Batting Average`
- Subtitle describing that the chart uses closed reconstructed trades.
- The SVG curve with markers and a subtle above/below curve background.
- A compact stat row for each snapshot with batting average, average gain, average loss, and gain/loss ratio.

## Implementation Shape

Add pure portfolio metric helpers for computing the two snapshots from `DashboardTrade`-like trade records. The dashboard data loader will provide enough closed trades to calculate the all-time and last-30 windows without relying on the existing recent-trades display limit.

Keep the chart rendering in a small dashboard component. Prefer existing formatting helpers where they fit.

## Testing

Add Vitest coverage for:

- Excluding open trades and null realized P&L trades.
- Computing batting average, average gain, average loss, and gain/loss ratio.
- Selecting the 30 most recent eligible closed trades.
- Handling no-loss or no-trade windows without crashing.

Existing dashboard and app tests must continue to pass.
