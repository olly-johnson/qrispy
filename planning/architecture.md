# Architecture

The app is now web-first: a Vercel-hosted application with Supabase Postgres as the system of record. This replaces the earlier local-first SQLite design.

Primary stack:

- Next.js app on Vercel for UI, API routes, and server actions.
- Supabase Postgres for trades, evaluations, market-data cache, jobs, chat, and KB metadata.
- Supabase Auth for single-user access now, multi-user/team support later.
- Supabase Storage or Git-backed markdown for raw/wiki files.
- Inngest for scheduled and event-driven background jobs.
- External APIs: TradeZero, Polygon/Massive, LLM provider.

## Design Principles

- Web-first, not local-only.
- Auth is required because the app will contain private trading data online.
- Postgres is the canonical datastore.
- Markdown remains the source format for the Qullamaggie KB, but the web app indexes metadata in Postgres.
- Long-running work is split into idempotent job steps, not one giant serverless request.
- All imports and evaluations must be replayable.
- RLS is enabled on user-owned tables even while this is single-user.

## Module Breakdown

- `web_ui`: dashboard, trades, evaluations, reports, KB browser, chat, settings.
- `auth`: Supabase Auth, user profile, admin/single-user guard.
- `api_layer`: Vercel server routes/server actions for app operations.
- `job_orchestrator`: Inngest functions for sync, backfill, retries, and status.
- `tradezero_api_ingestor`: pulls TradeZero fills/order history.
- `tradezero_csv_importer`: browser upload or storage-backed CSV import.
- `fill_normalizer`: maps all source rows to canonical fills.
- `position_reconstructor`: rebuilds trades from fills.
- `portfolio_tracker`: stores account snapshots, positions, exposure, cash/equity metrics.
- `market_data_client`: fetches Polygon/Massive bars in sprint 2+.
- `market_data_cache`: stores OHLCV bars in Postgres in sprint 2+.
- `kb_manager`: tracks raw/wiki markdown files and compile runs.
- `classifier`: LLM-assisted setup/context classification.
- `quant_evaluator`: deterministic scoring.
- `coach`: LLM coaching narrative.
- `meta_evaluator`: recurring-pattern reports.
- `chat_agent`: grounded app chat.

## Data Flow

```text
 Browser / Vercel UI
        |
        v
 Supabase Auth ----- RLS policies
        |
        v
 Vercel API routes / server actions
        |
        +--------------------+
        |                    |
        v                    v
 TradeZero API         CSV upload/import
        |                    |
        +----- fill_normalizer
                    |
                    v
             Supabase Postgres
              fills / trades
                    |
                    v
        position_reconstructor
                    |
          +---------+---------+
          |                   |
          v                   v
 Polygon/Massive       KB raw/wiki markdown
 OHLCV cache           compile/index metadata
          |                   |
          +---------+---------+
                    |
                    v
 classifier -> quant_evaluator -> coach
                    |
                    v
 evaluations / reports / chat context
```

## What Runs Where

Vercel:

- Next.js UI.
- API routes for imports, job start, chat, evaluation reads, settings.
- Inngest serve endpoint.
- Short job steps that fit Vercel Function limits.

Supabase:

- Postgres tables.
- RLS policies.
- Storage buckets for CSV uploads, generated reports, and optionally raw/wiki markdown.
- Storage buckets for uploads and later KB assets.

External services:

- TradeZero API for fills and account snapshots.
- Inngest for durable background execution.
- Polygon/Massive for OHLCV bars in sprint 2+.
- LLM provider for classification/coaching/chat in sprint 2+.

## Nightly Job Orchestration

Preferred design:

1. A manual UI action or schedule sends `tradezero/sync.requested` to Inngest.
2. Inngest runs durable steps:
   - sync TradeZero accounts,
   - sync equity/cash/account snapshot,
   - sync current positions,
   - sync historical orders/fills,
   - reconstruct affected trades,
   - record job summary.
3. Each step records status and can be retried.
4. The UI displays job progress and errors.

Inngest is the preferred orchestrator for MVP because it supports Next.js/Vercel, durable steps, retries, idempotency, concurrency, and observability without running a separate worker.

## Background Job Strategy

Serverless functions should not do the whole pipeline in one plain HTTP request. The safer design is durable Inngest steps:

- one event starts or resumes a job,
- each step performs a bounded unit of work,
- retries happen at the step level,
- all external fetches are idempotent,
- TradeZero sync concurrency is limited per user.

If the workload grows, add a dedicated worker later:

- Supabase Edge Function worker,
- Vercel Workflow,
- Fly.io/Render background worker,
- GitHub Actions nightly worker,
- or a small Python worker service.

## Security

Because the app is online:

- Supabase Auth is required.
- RLS must be enabled for all exposed user tables.
- The service role key must never reach the browser.
- TradeZero, Polygon, and LLM keys live in Vercel/Supabase server secrets.
- Single-user mode is implemented as "only allow the configured owner user id", not as "no auth."

## Sources Checked

- Supabase scheduled Edge Functions: <https://supabase.com/docs/guides/functions/schedule-functions>
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Vercel limits: <https://vercel.com/docs/limits>
- Vercel function limits: <https://vercel.com/docs/functions/limitations>
- Vercel cron behavior: <https://vercel.com/docs/cron-jobs/manage-cron-jobs>
- Inngest Next.js serving functions: <https://www.inngest.com/docs/learn/serving-inngest-functions>
- Inngest idempotency: <https://www.inngest.com/docs/guides/handling-idempotency>
- Inngest concurrency: <https://www.inngest.com/docs/functions/concurrency>

## Links

- [data-model.md](data-model.md)
- [ingestion.md](ingestion.md)
- [market-data.md](market-data.md)
- [knowledge-base.md](knowledge-base.md)
- [evaluator.md](evaluator.md)
- [chat.md](chat.md)
- [milestones.md](milestones.md)
- [mvp-build-spec.md](mvp-build-spec.md)
- [job-orchestration.md](job-orchestration.md)
