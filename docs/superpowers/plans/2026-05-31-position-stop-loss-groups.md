# Position Stop Loss Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add editable stop losses and stop-based unrealised P&L for each open entry group on the positions page.

**Architecture:** Extend the dashboard data mapper so positions include matching open trade stop groups. Add a small Server Action that updates one trade stop after authenticating the user, then render one form per stop group beneath the position summary row.

**Tech Stack:** Next.js App Router Server Components, React Server Actions, Supabase, Vitest.

---

### Task 1: Position Stop Groups Data

**Files:**
- Modify: `src/lib/app-data.ts`
- Test: `src/lib/app-data.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test showing one position with two open trade stop groups: a long group and a short group with computed stop P&L.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/app-data.test.ts`
Expected: FAIL because `DashboardPosition.stopGroups` does not exist.

- [ ] **Step 3: Implement data mapping**

Add `PositionStopGroup`, map open trades to positions by account and symbol, infer current price from the broker position, and compute stop P&L with long and short formulas.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/app-data.test.ts`
Expected: PASS.

### Task 2: Stop Update Action

**Files:**
- Modify: `src/app/actions.ts`
- Test: `src/app/actions.test.ts`

- [ ] **Step 1: Write the failing test**

Add a test for `updateTradeStopLoss(tradeId, formData)` that authenticates the current user, parses `stopLoss`, updates only that user's trade, recalculates risk values, and revalidates `/positions` and `/dashboard`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/actions.test.ts`
Expected: FAIL because `updateTradeStopLoss` does not exist.

- [ ] **Step 3: Implement action**

Use `createSupabaseServerClient`, `requireUser`, numeric validation, a trade lookup scoped by `user_id` and `id`, and an update scoped the same way.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/actions.test.ts`
Expected: PASS.

### Task 3: Positions Page UI

**Files:**
- Modify: `src/app/positions/page.tsx`

- [ ] **Step 1: Render stop group rows**

For each position, render the existing summary row and a detail row containing a compact nested table of stop groups.

- [ ] **Step 2: Add editable stop forms**

Each stop group gets a numeric input named `stopLoss` and a submit button bound to `updateTradeStopLoss.bind(null, group.tradeId)`.

- [ ] **Step 3: Run verification**

Run: `npm test`, `npm run lint`, and `npm run build`.
Expected: all pass.
