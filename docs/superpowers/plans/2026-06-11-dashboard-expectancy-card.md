# Dashboard Expectancy Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard card plotting all-trades and last-30 trade expectancy against the break-even reward:risk curve.

**Architecture:** Keep the calculation in a pure portfolio helper and render the chart as a server-rendered SVG in the dashboard page. Load closed trade history separately from the existing recent-trades table so the all-trades and last-30 metrics are not limited by the dashboard preview.

**Tech Stack:** Next.js 16 App Router, React Server Components, TypeScript, Vitest, Tailwind CSS.

---

## File Structure

- Create `src/lib/portfolio/expectancy.ts`: pure helpers for filtering eligible trades, computing batting average, average gain, average loss, and gain/loss ratio for all trades and last 30.
- Create `src/lib/portfolio/expectancy.test.ts`: TDD coverage for filtering, metric math, ordering, and empty/no-loss handling.
- Modify `src/lib/app-data.ts`: load closed trades for expectancy and attach snapshots to dashboard data.
- Modify `src/app/dashboard/page.tsx`: render the new card and inline SVG curve using the computed snapshots.
- Keep `.github/workflows/*` unchanged because CI already runs `npm test`, `npm run lint`, and `npm run build`.

---

### Task 1: Expectancy Metrics

**Files:**
- Create: `src/lib/portfolio/expectancy.ts`
- Test: `src/lib/portfolio/expectancy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/portfolio/expectancy.test.ts` with tests that call:

```ts
buildTradeExpectancySnapshots([
  trade({ id: "older-win", openedAt: "2026-01-01T10:00:00.000Z", closedAt: "2026-01-01T16:00:00.000Z", realizedPnl: 100 }),
  trade({ id: "loss", openedAt: "2026-01-02T10:00:00.000Z", closedAt: "2026-01-02T16:00:00.000Z", realizedPnl: -50 }),
  trade({ id: "open", status: "OPEN", openedAt: "2026-01-03T10:00:00.000Z", closedAt: null, realizedPnl: 999 }),
  trade({ id: "null-pnl", openedAt: "2026-01-04T10:00:00.000Z", closedAt: "2026-01-04T16:00:00.000Z", realizedPnl: null }),
])
```

Expected all-trades snapshot:

```ts
{
  label: "All trades",
  tradeCount: 2,
  winCount: 1,
  battingAverage: 0.5,
  averageGain: 100,
  averageLoss: 50,
  gainLossRatio: 2,
}
```

Also test 31 eligible closed trades where the newest 30 exclude the oldest winner, and test a no-loss snapshot returns `averageLoss: null` and `gainLossRatio: null`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/portfolio/expectancy.test.ts`

Expected: FAIL because `src/lib/portfolio/expectancy.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/portfolio/expectancy.ts` exporting:

```ts
export type ExpectancyTradeInput = {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  realizedPnl: number | null;
};

export type TradeExpectancySnapshot = {
  label: "All trades" | "Last 30";
  tradeCount: number;
  winCount: number;
  battingAverage: number | null;
  averageGain: number | null;
  averageLoss: number | null;
  gainLossRatio: number | null;
};

export function buildTradeExpectancySnapshots(trades: ExpectancyTradeInput[]) {
  const eligible = eligibleClosedTrades(trades);

  return {
    all: buildSnapshot("All trades", eligible),
    last30: buildSnapshot("Last 30", eligible.slice(0, 30)),
  };
}
```

Implement helpers with finite-number checks, descending close/open date ordering, average positive P&L, absolute average negative P&L, and null ratio when there are no losses.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/portfolio/expectancy.test.ts`

Expected: PASS.

---

### Task 2: Dashboard Data Loader

**Files:**
- Modify: `src/lib/app-data.ts`
- Test: `src/lib/app-data.test.ts`

- [ ] **Step 1: Write the failing test**

Add a `getDashboardData` test that mocks the sixth Supabase query for closed trades and expects `data.expectancy.all.tradeCount` and `data.expectancy.last30.tradeCount` to be computed from those rows.

Use a mocked query chain for:

```ts
supabase
  .from("trades")
  .select("*")
  .eq("user_id", userId)
  .eq("status", "CLOSED")
  .order("closed_at", { ascending: false })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/app-data.test.ts`

Expected: FAIL because `getDashboardData` does not return `expectancy`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/app-data.ts`, import `buildTradeExpectancySnapshots`, add the closed-trades query to the `Promise.all`, map rows through the existing `mapTrade`, and return:

```ts
expectancy: buildTradeExpectancySnapshots(expectancyTrades),
```

Also add the same empty snapshots in `emptyDashboardData()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/app-data.test.ts`

Expected: PASS.

---

### Task 3: Dashboard Card UI

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add the card with server-rendered SVG**

Add `DashboardExpectancyCard` below the second metric-card row and before `DashboardBreadthCard`. The component accepts:

```ts
expectancy: Awaited<ReturnType<typeof getDashboardData>>["expectancy"];
```

Render:

- Header: `Reward:Risk vs Batting Average`
- Subtitle: `Closed reconstructed trades`
- SVG curve for x 20%-70%, y 0-4.
- Two markers for `expectancy.all` and `expectancy.last30`.
- Compact stat rows with batting average, average gain, average loss, and gain/loss ratio.

- [ ] **Step 2: Run focused tests and lint**

Run: `npm test -- src/lib/portfolio/expectancy.test.ts src/lib/app-data.test.ts`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

---

### Task 4: Full Verification and PR Prep

**Files:**
- No new source files unless verification exposes a bug.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Browser visual verification**

Run the dev server with `npm run dev`, open `/dashboard` in the browser, and capture a screenshot showing the new card. If auth redirects to login, capture the login-safe state and note that authenticated visual verification needs a signed-in browser session.

- [ ] **Step 3: Commit implementation**

Stage only the plan and implementation files, then commit:

```bash
git add docs/superpowers/plans/2026-06-11-dashboard-expectancy-card.md src/lib/portfolio/expectancy.ts src/lib/portfolio/expectancy.test.ts src/lib/app-data.ts src/lib/app-data.test.ts src/app/dashboard/page.tsx
git commit -m "Add dashboard expectancy chart"
```

- [ ] **Step 4: Push and open PR**

Push `codex/dashboard-expectancy-card` and open a PR against `main` with a summary, test results, and screenshot path or note.
