# Security And Secrets

The MVP is private but hosted online, so auth, RLS, and secret boundaries matter from day one.

## Locked MVP Decisions

- Auth method: Supabase email/password.
- TradeZero credentials: Vercel server environment variables.
- Owner-only app for MVP.
- Public signup disabled.

## Auth

Use Supabase Auth.

MVP uses email/password for simple predictable local/dev testing.

Single-user mode:

- store owner user id in app config/env,
- block non-owner access at application level,
- keep RLS policies owner-scoped.
- disable or gate public signup so random users cannot create usable accounts.

## Secrets

Server-only:

- Supabase service role key,
- TradeZero API key id,
- TradeZero API secret,
- Inngest signing key,
- Inngest event key,
- Polygon/Massive API key later,
- LLM API key later.

Browser-safe:

- Supabase project URL,
- Supabase anon key, protected by RLS.

## TradeZero Credentials

MVP approach:

- store TradeZero API keys as Vercel environment variables,
- do not store keys in Postgres,
- use one owner account.

Future multi-user path:

- encrypted broker credential records,
- Supabase Vault or external secret store,
- per-user credential management UI,
- audit trail for credential updates.

## RLS

Enable RLS on every user-owned table:

- profiles,
- accounts,
- account snapshots,
- positions,
- fills,
- trades,
- jobs,
- reports,
- chat,
- KB metadata.

Server jobs may use service-role access, but every query must scope by `user_id`.

## Data Sent To External Services

Sprint 1:

- TradeZero receives API requests from server.
- Inngest receives event metadata. Do not send raw TradeZero credentials or unnecessary full trade payloads in events.

Sprint 2 LLM:

- send only selected trade facts and retrieved KB excerpts,
- never send API credentials,
- show provider/model in UI.

## Audit And Recovery

MVP should record:

- sync job runs,
- sync errors,
- import/backfill ranges,
- account snapshot timestamps.

Future:

- audit log for settings changes,
- data export,
- account deletion/purge workflow.

## Decisions Needed

- Whether to log raw TradeZero payloads fully or redact sensitive fields.
