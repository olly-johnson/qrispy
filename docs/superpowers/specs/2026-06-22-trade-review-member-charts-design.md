# Trade Review Member Charts Design

## Purpose

Give each timeline trade in a review group its own on-demand original-trade
chart, without making the campaign page fetch chart data for every member at
initial load.

## Behaviour

- Every timeline card has a collapsed `View chart` control.
- Opening it requests chart data only for that card.
- The server action authenticates the user and verifies that the requested
  reconstruction key is still a member of the named review group before
  returning data.
- The expanded card uses the existing trade chart panel and its normal chart
  intervals, fill markers, loading state, and market-data error state.
- Closing the card hides the panel but retains its loaded chart data for the
  remainder of the review session.

## Campaign chart readability

- Campaign chart markers use compact text: `T1 E` for entry and `T1 X` for
  exit, instead of the longer direction/role labels.
- The shared chart typography is reduced slightly so marker annotations no
  longer dominate the Daily chart.
- Marker arrows and colours remain the visual entry/exit cue; timeline cards
  retain the full long/short label.

## Boundaries and testing

- No chart data is loaded until a user expands a timeline card.
- The action rejects missing, foreign, stale, or non-member trade requests.
- Tests cover authorization/membership validation, lazy chart response,
  expanded-card loading/error states, and compact campaign marker text.
