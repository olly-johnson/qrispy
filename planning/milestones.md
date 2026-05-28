# Milestones

## 1. TradeZero Portfolio Tracker MVP

Goal: connect to TradeZero, pull account/trade data, store it in Supabase, and display a polished tracking dashboard.

Scope:

- Next.js app on Vercel.
- Supabase project connected.
- Supabase Auth enabled.
- Single configured owner user.
- TradeZero API credentials configured server-side.
- Inngest sync job.
- Accounts, account snapshots, positions, fills, reconstructed trades, and job history.
- Dashboard showing equity, cash, buying power, percent invested, exposure, positions, and recent trades.
- Trades and trade detail pages.
- Initial Postgres migrations and RLS policies.

Acceptance criteria:

- App is reachable on Vercel.
- Unauthenticated users cannot access app pages.
- Logged-in owner can see dashboard.
- RLS blocks access to another user id in policy tests.
- Manual TradeZero sync imports account, position, snapshot, and fill data.
- Re-running sync does not duplicate fills/trades.
- Dashboard displays latest equity, cash, percent invested, and positions.
- Trades are reconstructed using the zero-to-zero boundary rule.
- Job status and errors are visible.

## 2. CSV Fallback And Backfill Hardening

Goal: make historical backfill reliable when API history is incomplete.

Scope:

- upload one TradeZero Trading History CSV,
- store it in private Supabase Storage,
- normalize fills into Postgres,
- reconstruct closed trades,
- reconcile likely API/CSV duplicates.

Acceptance criteria:

- Re-uploading the same CSV creates no duplicate fills.
- A direct zero-to-zero trade reconstructs correctly.
- A direct flip is split correctly.
- API/CSV duplicate candidates are flagged.

## 3. Trade Detail And Review UI

Scope:

- trades table,
- trade detail page,
- fill allocations,
- metrics panel,
- narrative evaluation panel,
- user notes and setup tag.

Acceptance criteria:

- User can inspect how fills became a trade.
- User can add initial stop/intended setup notes.
- Notes do not overwrite evaluator output.

## 4. Market Data Cache And Quant Metrics

Scope:

- Polygon/Massive cache,
- daily/intraday bar fetching,
- SPY/QQQ/IWM context,
- deterministic metric library.

Acceptance criteria:

- Same bar key is never fetched twice.
- Metrics are versioned.
- Missing data is surfaced as missing.
- ADR, ATR, ORH/ORL, moving averages, and relative volume are available.

## 5. Qullamaggie Evaluation Sprint

Scope:

- LLM classification,
- quantitative evaluation,
- nuanced coaching,
- versioned prompts,
- report generation.

Acceptance criteria:

- Every newly closed trade gets classification, quantitative scores, and narrative.
- Coaching references specific metrics and wiki files.
- Outputs avoid pass/fail dogma and discuss justified deviations.
- Re-running with a new prompt version preserves or explicitly supersedes old outputs.

## 6. KB Compile And Index

Scope:

- create method and personal compile instructions,
- compile raw files into method wiki,
- load wiki metadata into Postgres,
- expose wiki pages in UI.

Acceptance criteria:

- Method wiki can be regenerated.
- Wiki pages cite raw source files.
- Contradictions are preserved.
- Evaluator can retrieve relevant Method Wiki files by setup type.
- Personal Trading Wiki compile can propose recurring-pattern updates from evaluations/meta reports.

## 7. Chat

Scope:

- hosted chat UI,
- read-only access to KB/trades/evaluations,
- citations,
- stored chat sessions.

Acceptance criteria:

- User can ask about a trade, setup, or recurring mistake.
- Answer cites wiki files and trade ids.
- Provider/model is visible.
- No write actions happen without confirmation.

## 8. Meta-Pattern Reports

Scope:

- periodic pass across N evaluations,
- recurring mistake detection,
- report generation.

Acceptance criteria:

- Report identifies frequency and examples.
- Report separates one-off mistakes from patterns.
- Report names missing journal data that would improve confidence.
- User can choose N and filters.

## 9. Product Expansion Foundation

Scope:

- feature flags,
- settings page,
- role model for future users,
- export tools,
- audit log.

Acceptance criteria:

- New feature modules can be added without changing core trade schema.
- Sensitive operations are auditable.
- Data export works for trades, evaluations, and reports.
