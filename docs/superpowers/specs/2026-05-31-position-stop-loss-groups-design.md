# Position Stop Loss Groups Design

## Goal

Open positions should expose editable stop losses per entry-day group and show the unrealised result if each group is stopped out.

## Behaviour

- A stop group is one open trade row. The current trade reconstructor already keeps same-symbol entries in one open trade until the position is closed; same-day adds remain represented by that trade, while a later re-entry after closure creates another trade row.
- The positions page shows each current broker position as a summary row and then one row per matching open trade for that account and symbol.
- Each stop row shows entry date, direction, quantity, average entry, editable stop loss, and stop-based unrealised P&L.
- Long stop P&L is `quantity * (stop - current price)`.
- Short stop P&L is `quantity * (current price - stop)`.
- Current price is inferred from the latest broker position snapshot: `abs(market_value) / abs(quantity)`.
- Editing a stop updates only the selected open trade row.

## Persistence

Stops are stored in the existing `trades.initial_stop_price` column. The update action also refreshes `initial_risk_per_share` and `initial_risk_amount` from `avg_entry_price`, `direction`, and `max_abs_quantity`.

## UI

The positions page keeps the existing table shape, with an expanded stop detail row under each position. Forms use Next.js Server Actions, authenticate the current user, and revalidate `/positions` and `/dashboard`.

## Testing

Tests cover mapping open trades into position stop groups, stop P&L calculations for longs and shorts, and the server-side stop update query.
