# Multi-Timeframe Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authenticated, URL-backed `/charts` page that compares daily and tabbed intraday candlestick charts for a selected ticker and date range.

**Architecture:** Server code parses query parameters, fetches and prepares serializable chart datasets, then passes them to a Lightweight Charts client renderer. The daily chart remains visible while a local intraday tab swaps between 1h, 5m, and 1m datasets.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Lightweight Charts 5, Massive aggregate API, Supabase cache.

---

### Task 1: Add one-minute market-data support

**Files:**
- Modify: `src/lib/market-data/types.ts`
- Modify: `src/lib/market-data/massive.ts`
- Modify: `src/lib/market-data/massive.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
await provider.getAggregateBars({
  symbol: "ACME", timeframe: "1m", from: "2026-01-02", to: "2026-01-02", adjusted: false,
});
expect(new URL(fetcher.mock.calls[0][0]).pathname).toBe(
  "/v2/aggs/ticker/ACME/range/1/minute/2026-01-02/2026-01-02",
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/market-data/massive.test.ts`

Expected: the `1m` timeframe is unsupported.

- [ ] **Step 3: Write minimal implementation**

```ts
export type MarketDataTimeframe = "1d" | "1w" | "1h" | "5m" | "1m";

"1m": { multiplier: 1, timespan: "minute" },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/market-data/massive.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/market-data/types.ts src/lib/market-data/massive.ts src/lib/market-data/massive.test.ts
git commit -m "feat: support one-minute market data"
```

### Task 2: Prepare validated chart datasets and indicators

**Files:**
- Create: `src/lib/market-data/chart-explorer.ts`
- Create: `src/lib/market-data/chart-explorer.test.ts`
- Modify: `src/lib/market-data/indicators.ts`
- Modify: `src/lib/market-data/indicators.test.ts`

- [ ] **Step 1: Write failing tests for filters, session bars, padding, overlays, VWAP, and visible range**

```ts
expect(parseChartExplorerSearchParams({ symbol: "acme", from: "2026-01-05", to: "2026-01-09" }))
  .toEqual({ symbol: "ACME", from: "2026-01-05", to: "2026-01-09" });
expect(filterRegularSessionBars(bars)).toHaveLength(2);
expect(vwap([{ time: "2026-01-05T14:30:00.000Z", high: 12, low: 8, close: 10, volume: 100 }]))
  .toEqual([{ time: "2026-01-05T14:30:00.000Z", value: 10 }]);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/market-data/chart-explorer.test.ts src/lib/market-data/indicators.test.ts`

Expected: missing module and `vwap` export failures.

- [ ] **Step 3: Write minimal implementation**

Implement `parseChartExplorerSearchParams`, `serializeChartExplorerSearchParams`, `getChartExplorerDatasets`, `filterRegularSessionBars`, `initialVisibleBars`, and VWAP. Daily requests expand before and after short ranges; 1h/5m/1m requests use only selected dates; filter the latter to 09:30-16:00 America/New_York Monday-Friday. Build daily 10/20/50/100/200 SMA overlays and intraday 10/20/65 EMA plus session-reset VWAP.

```ts
export const INITIAL_VISIBLE_BARS = { "1d": 50, "1h": 70, "5m": 156, "1m": 390 } as const;

const dailyOverlays = ["sma10", "sma20", "sma50", "sma100", "sma200"] as const;
const intradayOverlays = ["ema10", "ema20", "ema65", "vwap"] as const;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/market-data/chart-explorer.test.ts src/lib/market-data/indicators.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/market-data/chart-explorer.ts src/lib/market-data/chart-explorer.test.ts src/lib/market-data/indicators.ts src/lib/market-data/indicators.test.ts
git commit -m "feat: prepare multi-timeframe chart datasets"
```

### Task 3: Render daily and tabbed intraday charts

**Files:**
- Create: `src/components/chart-explorer.tsx`
- Create: `src/components/chart-explorer.test.ts`

- [ ] **Step 1: Write failing renderer-configuration tests**

```ts
expect(INTRADAY_TABS).toEqual([
  { id: "1h", label: "1 hour" },
  { id: "5m", label: "5 minute" },
  { id: "1m", label: "1 minute" },
]);
expect(initialLogicalRange({ startIndex: 12, visibleBars: 50 })).toEqual({ from: 12, to: 62 });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/chart-explorer.test.ts`

Expected: missing component module failure.

- [ ] **Step 3: Write minimal implementation**

Use a `"use client"` component to render a daily `ChartCard` and tabbed intraday `ChartCard` side by side (stacked on narrow screens). Each card creates candlestick, volume histogram, and overlay line series; applies `setVisibleLogicalRange`; and cleans up its `IChartApi`. Render legends from overlays and a no-data message for empty datasets.

```tsx
<section className="grid gap-4 xl:grid-cols-2">
  <ChartCard dataset={daily} title="Daily" />
  <div><TimeframeTabs active={activeTimeframe} onChange={setActiveTimeframe} /><ChartCard dataset={intraday[activeTimeframe]} title="Intraday" /></div>
</section>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/components/chart-explorer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/chart-explorer.tsx src/components/chart-explorer.test.ts
git commit -m "feat: render multi-timeframe charts"
```

### Task 4: Add the page, form, and navigation

**Files:**
- Create: `src/app/charts/page.tsx`
- Create: `src/components/chart-explorer-form.tsx`
- Create: `src/components/chart-explorer-form.test.ts`
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Write the failing form URL test**

```ts
expect(chartExplorerHref({ symbol: "acme", from: "2026-01-05", to: "2026-01-09" }))
  .toBe("/charts?symbol=ACME&from=2026-01-05&to=2026-01-09");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/chart-explorer-form.test.ts`

Expected: missing form module failure.

- [ ] **Step 3: Write minimal implementation**

Make `/charts` dynamic; use `requireUser`, promised `searchParams`, the shared parser, `createSupabaseAdminClient`, and `createMassiveMarketDataProvider`. Add a GET form for ticker/start/end and a `Charts` nav entry. Show validation or provider errors before chart rendering.

```tsx
export const dynamic = "force-dynamic";

return <AppShell user={user}><ChartExplorerForm initialFilters={filters} /><ChartExplorer result={result} /></AppShell>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- src/components/chart-explorer-form.test.ts src/lib/market-data/chart-explorer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/charts/page.tsx src/components/chart-explorer-form.tsx src/components/chart-explorer-form.test.ts src/components/app-shell.tsx
git commit -m "feat: add chart explorer page"
```

### Task 5: Verify full flow and CI coverage

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: all implementation files

- [ ] **Step 1: Confirm CI picks up all new tests**

Run: `Get-Content .github/workflows/ci.yml`

Expected: PR CI runs `npm test`, `npm run lint`, and `npm run build`; Vitest already includes `src/**/*.test.ts`.

- [ ] **Step 2: Run full local verification**

Run: `npm test; npm run lint; npm run build`

Expected: all tests pass, lint has no errors, and build exits 0.

- [ ] **Step 3: Visually verify and create review evidence**

Run: `npm run dev`

Expected: `/charts` shows the date form, both charts together, correct indicator legends/colors, switching intraday tabs, and horizontal panning. Capture a screenshot, push `codex/multitimeframe-charts`, and create a PR against `main` with the image and verification output.

