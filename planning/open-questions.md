# Open Questions

## Product Direction

- Is this still intended to be single-user only for the foreseeable future, or should the schema/UI be built with future multi-user accounts in mind from day one?
- Should the app eventually become a paid/private product, or only your personal hosted tool?

## Hosting And Cost

- Are you happy to use Vercel + Supabase free tiers initially, accepting possible upgrades as storage/jobs grow?
- Which Vercel plan do you expect to use? Hobby is enough for early work but has cron and function constraints.
- Which Supabase plan do you expect to use? Free is likely enough for an MVP, but backups/storage may push toward Pro.

## TradeZero

- What exact fields does your TradeZero Developer API historical order response return?
- Does your live account receive fill-level history from the paginated one-year endpoint?
- Are locate fees, borrow costs, and short-sale locate inventory available through the API?
- Are account equity/balance values from `/pnl` reliable after close, or do they settle later?

## CSV

- Are all TradeZero Trading History CSV exports in the same schema as the examples sampled from `E:\Trades`?
- CSV fallback is deferred unless TradeZero API backfill is incomplete. If needed later, should upload be drag-and-drop or a storage-folder import?
- Can one CSV contain multiple accounts or currencies?
- Do CSV exports ever include corrections/cancellations/busts?

## MVP Dashboard

- No blocking MVP dashboard questions. Manual sync refreshes everything; positions-only refresh is deferred unless full sync is too slow. Computed dashboard values should show subtle provenance tooltips.

## Evaluation Inputs

- Will you record intended setup and initial stop manually, or should the app infer them first and let you correct later?
- Should the evaluator judge all trades against Qullamaggie, or only trades tagged as method trades?
- What account equity value should be used for intraday trades: prior close, start of day, or post-close value?

## Market Data

- Which Polygon/Massive plan will you use for the first build?
- Should the app use adjusted or unadjusted daily bars for ADR and historical setup analysis? Planning recommends unadjusted for trade-date execution matching.
- Do you want sector context via ETF mapping in v1, or only SPY/QQQ/IWM?

## Qullamaggie Rules

- Is "partials in 3-5R" a rule you already have from transcripts? Current local sources strongly support 3-5 days and trimming explosive moves, but not yet a hard 3-5R rule.
- Should liquidity scores adapt to your current account size automatically?
- Should moving-average trailing use EMA or SMA by default?
- Should the app evaluate intraday trades against the swing-trading method, or mark them as outside the core method unless manually tagged?

## Knowledge Base

- Should markdown be primarily Git-backed, Supabase Storage-backed, or both?
- How often should the wiki compile step run: manually, nightly, or whenever raw files change?
- Should generated wiki pages include short quotes, or only paraphrases with source links?
- Should the Method Wiki and Personal Trading Wiki be physically separate folders from day one, or logical layers in Postgres/storage first?
- Should personal wiki updates require explicit approval every time, or can low-risk summaries be auto-approved after review thresholds are met?
- What personal evidence should be allowed into the Personal Trading Wiki: only evaluations/meta reports, or also journal reflections and chat-approved notes?

## LLM

- Which external provider should the hosted app use first?
- Is sending selected trade facts and KB excerpts to an external LLM acceptable?
- Should local LLM support remain a later optional feature?
- Confirm LLM/evaluator is sprint 2, not MVP.

## Reports

- Do you want reports stored only in Postgres, or also exported as markdown files?
- Should reports include generated charts from cached bars?
- Should narrative evaluations be editable, or should user commentary be stored as separate notes?
