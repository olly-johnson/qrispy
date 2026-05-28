# Qrispy

Qrispy is a dark-only TradeZero portfolio and trade tracking dashboard built with Next.js, Supabase, Inngest, and Vitest.

Milestone 1 includes:

- Supabase Auth gated owner access.
- Supabase migrations for accounts, snapshots, positions, fills, reconstructed trades, and job history.
- Manual TradeZero sync event dispatch through Inngest.
- TradeZero server-side sync plumbing with normalized fills and zero-to-zero trade reconstruction.
- Dashboard, trades, positions, jobs, settings, and login routes.

## Setup

Copy `.env.example` to `.env.local` and fill the Supabase, owner, Inngest, and TradeZero values. TradeZero credentials must stay server-only and must not use a `NEXT_PUBLIC_` prefix.

Apply `supabase/migrations/20260528101000_milestone_1_core.sql` to the Supabase project before using the app.

## TradeZero Safety

Qrispy is a read-only TradeZero integration. The code allowlists only `GET` endpoints used for accounts, P&L, positions, and historical orders/fills. Any non-GET TradeZero request or non-allowlisted endpoint throws before `fetch` runs.

Before enabling live sync, use a read-only TradeZero API key if the broker portal offers key scopes, and enable broker account 2FA. Then set:

```text
TRADEZERO_READ_ONLY_CONFIRMED=true
TRADEZERO_BROKER_2FA_CONFIRMED=true
```

If either confirmation is missing, Qrispy blocks TradeZero sync.

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Verification

```bash
npm test
npm run lint
npm run build
```
