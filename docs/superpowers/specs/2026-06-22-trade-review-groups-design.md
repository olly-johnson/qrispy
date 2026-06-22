# Trade Review Groups Design

**Date:** 2026-06-22  
**Status:** Proposed and approved for planning

## Purpose

Allow a user to manually combine several reconstructed, closed trades into one
review-only campaign. For example, several CAR short trades over two weeks can
appear as one campaign in the Trades list, with their total loss and a combined
chart, while the original trades and broker fills remain unchanged.

Trade review groups are not accounting records. They must not change TradeZero
sync, trade reconstruction, positions, dashboard expectancy, batting average,
or any other dashboard metric.

## Scope and rules

- A group contains two or more closed trades.
- All selected trades must have the same symbol and direction.
- Trades from more than one account are allowed when those rules hold.
- A trade can belong to at most one review group at a time.
- A default label is derived from the symbol, direction, and date range, such
  as `CAR SHORT - 2-16 Jun 2026`.
- The user can rename a group.
- Removing a trade from a group returns it immediately to an individual row in
  the Trades list.
- Deleting a group returns every member to individual rows in the Trades list.
- A group with no remaining members is deleted automatically.

## User experience

### Trades list

The Trades page adds selection checkboxes to individual closed-trade rows and
a `Group selected` action. The action is enabled only when at least two
eligible rows are selected. Server-side validation remains authoritative, so a
stale or manipulated request cannot create an invalid group.

Grouped trades are suppressed from the default list. In their place, the list
shows one group row with:

- group label;
- symbol and direction;
- first-open to final-close date range;
- member trade count;
- sum of realised P&L;
- sum of fees; and
- a link to the group review page.

Existing ungrouped rows and their individual analysis links retain their
current behaviour.

### Group review page

The group page is a campaign-review view with no edit path into broker-derived
trades or fills.

Its header shows the editable label, symbol, direction, date range, member
count, total realised P&L, and total fees.

The page contains a combined symbol chart spanning the whole campaign. It
offers Daily and 1-hour intervals. Every member trade's fill allocation is
shown as a labelled entry or exit marker, so the chart reveals both the overall
price action and the timing of every attempt.

Below the chart, a chronological timeline has one card per original trade.
Each card shows open and close time, duration, size, realised P&L, and concise
entry/exit information. The card links to the existing individual trade-detail
page, which continues to provide its full fill path and trade chart.

The group page provides controls to rename the group, remove a member, and
delete the entire group. These controls only change review-group metadata.

## Data model

Add `trade_review_groups`:

- `id uuid primary key`;
- `user_id uuid not null`;
- `custom_name text null`;
- `symbol text not null`;
- `direction text not null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`.

Add `trade_review_group_members`:

- `group_id uuid not null` referencing `trade_review_groups` with cascade
  deletion;
- `user_id uuid not null`;
- `reconstruction_key text not null`;
- `created_at timestamptz not null`;
- primary key `(group_id, reconstruction_key)`;
- unique constraint `(user_id, reconstruction_key)`.

Both tables receive owner-only RLS select/insert/update/delete policies and
authenticated/service-role grants consistent with the existing Supabase schema.

Membership stores `reconstruction_key`, not just a `trades.id` foreign key.
The TradeZero rebuild upserts reconstructed trades by `(user_id,
reconstruction_key)`. This makes memberships survive ordinary syncs while
avoiding a brittle dependency on a rebuilt row ID. At read time, the loader
resolves each membership key against the current `trades` row.

## Server behaviour

### Read models

`getTradeHistory` becomes a review-aware loader. It loads trades plus review
groups/memberships, resolves memberships to current trades, returns a
discriminated list of individual trade rows and calculated group rows, and
suppresses member rows from the normal list.

A new group-detail loader resolves the owned group, its current member trades,
their fills, and its aggregated totals. It returns a not-found result when the
group does not exist or is not owned by the current user.

### Mutations

Server actions create, rename, remove members from, and delete review groups.
Each action requires the authenticated owner and revalidates `/trades` plus the
affected group page.

Group creation re-queries the selected trades by user and validates that all
are closed, have one symbol, have one direction, and are not already members
of another group. The initial label is implicit unless a later rename stores a
`custom_name`.

Removing the final member deletes the group. Deleting a group cascades only to
its membership rows; the original reconstructed trades and their fills are
never updated or deleted by group actions.

### Charts

Refactor the market-data chart builder to accept a group chart input: one
symbol, campaign opening/closing bounds, and merged member fill allocations.
It requests cached Daily and 1-hour bars, uses the campaign bounds for the
visible range, and emits entry/exit markers labelled with the individual trade
sequence. The existing chart panel is reused with stop-loss controls disabled
for this closed-trade review context.

## Error handling

- Reject requests with fewer than two selected trades.
- Reject open, missing, cross-symbol, cross-direction, or already-grouped
  trades.
- Treat stale memberships whose reconstructed trades no longer exist as absent
  from the view; do not expose another user's data.
- Preserve a useful chart-unavailable message when market data is missing or
  unavailable, while leaving the timeline and totals usable.
- Return the original individual list entries when a group is removed or
  deleted.

## Testing

- Migration/schema tests cover the group tables, constraints, grants, and RLS.
- Loader tests cover group-row totals, date ranges, suppression of members,
  restoration after removal/deletion, and stale membership behaviour.
- Server-action tests cover ownership and all group eligibility validation.
- Chart tests cover merged fills, campaign date bounds, and labelled markers.
- Component tests cover selection enablement and timeline/group-row rendering.
- Existing dashboard tests confirm review groups are not read by dashboard
  metric queries.

## Non-goals

- Combining broker trades or fills in the source data.
- Altering realised P&L, fees, positions, or dashboard performance metrics.
- Automatically grouping trades by date, symbol, or strategy.
- Supporting mixed-symbol, mixed-direction, or open-trade groups.
