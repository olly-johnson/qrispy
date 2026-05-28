# UI / UX Direction

Qrispy should feel sharp, sleek, and professional: a private trading command center, not a marketing landing page.

Reference direction: the Puzzle fintech design reference uses a near-black base, graphite surfaces, bright green accent, high-contrast typography, and premium motion/visual polish. Qrispy should take inspiration from that mood without copying the layout.

Source reference:

- Dribbble shot: <https://dribbble.com/shots/25652036-Puzzle-Fintech-UI-UX-design-User-Interface-experience>
- Notable palette surfaced on the page: `#030206`, `#424551`, `#1EFD68`, `#8C9487`, `#DFDFEC`, `#2DB554`.

## Locked MVP Direction

- Dashboard emphasizes portfolio state first.
- Roomier fintech dashboard spacing, not compact trading-terminal density.
- Dark-only theme for MVP.
- Motion should be polished but restrained.
- Positions and trades are separate pages.
- Equity history chart is included in MVP, even if initially sparse.

## Product Feel

- Dark professional interface.
- Dense but clean dashboard.
- Financial terminal clarity with modern SaaS polish.
- Motion tied to state changes, not decorative noise.
- Data-first: equity, cash, exposure, positions, trades, sync health.

## Visual System

Palette:

- Background: near-black, e.g. `#030206`.
- Panels: charcoal/graphite, e.g. `#111217`, `#191B22`.
- Text: soft white, e.g. `#F4F4F8`.
- Muted text: cool grey, e.g. `#8C9487`.
- Accent: electric green, e.g. `#1EFD68`.
- Positive: green.
- Negative: controlled red, e.g. `#FF4D4D`.
- Warning: amber.

Typography:

- Clean sans for UI.
- Tabular numbers for money, quantity, P&L, and percentages.
- Tight hierarchy: large account equity, smaller dense metrics.

Layout:

- Left sidebar navigation on desktop.
- Top status strip with account, last sync, and environment.
- Responsive mobile/tablet layout, but desktop-first for trading review.
- No landing page in MVP; authenticated users land directly on dashboard.

## Motion

Use motion deliberately:

- animated sync progress,
- subtle count-up on equity/cash/exposure when data refreshes,
- table row entrance only after sync/import,
- line chart draw-in on first load,
- hover micro-interactions for actionable controls,
- skeleton loading states with soft shimmer.

Avoid:

- decorative blobs/orbs,
- excessive parallax,
- motion that distracts from numbers,
- full-page hero animations.

## MVP Dashboard

Top band:

- total equity,
- cash,
- buying power,
- percent invested,
- gross exposure,
- last sync status.

Main panels:

- equity history chart,
- open positions table,
- exposure split,
- recent closed trades,
- sync/job activity.

Trade page:

- high-density table,
- sticky filter row,
- symbol/date/status/direction filters,
- P&L and fees visible without opening detail.

Trade detail:

- summary strip,
- fill timeline,
- reconstruction explanation,
- notes area,
- future evaluation placeholder.

## Component Choices

Recommended:

- Tailwind CSS.
- shadcn/ui or Radix-based components.
- lucide icons for navigation/actions.
- Framer Motion/Motion for React.
- Recharts or custom SVG/canvas charts for simple MVP charts.

## UX Decisions Needed

- Do you want Qrispy branding to feel serious-minimal or slightly playful because of the name?
