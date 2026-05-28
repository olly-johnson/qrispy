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
