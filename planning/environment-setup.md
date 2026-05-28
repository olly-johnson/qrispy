# Environment Setup

This doc captures what needs to exist before implementation starts.

## Services

Create:

- Vercel project for `qrispy`.
- Supabase project.
- Inngest account/app.
- TradeZero Developer API credentials.

Later:

- Polygon/Massive API key.
- LLM provider API key.

## Environment Variables

Browser-safe:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Server-only:

```text
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DATABASE_URL=
QRISPY_OWNER_USER_ID=

TRADEZERO_API_KEY_ID=
TRADEZERO_API_SECRET_KEY=
TRADEZERO_API_BASE_URL=

INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

Locked MVP config:

- TradeZero backfill starts at `2026-01-01`.
- MVP assumes USD account currency.
- TradeZero credentials are stored as Vercel server-only env vars.
- Supabase Auth uses email/password.

Later:

```text
POLYGON_API_KEY=
LLM_PROVIDER=
LLM_API_KEY=
```

## Local Development

Recommended:

- local Next.js dev server,
- remote Supabase dev project initially for speed,
- later optional local Supabase CLI stack if migrations/RLS testing needs it,
- Inngest dev server for local function testing.

## Deployment Environments

Minimum:

- `local`,
- `production`.

Better:

- `local`,
- `preview`,
- `production`.

Preview can use the same Supabase project early, but production should eventually have separate preview/prod Supabase projects if schema changes become risky.

## Decisions Needed

- Project region for Supabase.
- Vercel team/personal account to deploy under.
- Whether to use one Supabase project initially or separate dev/prod projects.
- Whether TradeZero sandbox/paper endpoints are available and should be used before live credentials.
