# Trade Review Member Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lazily loaded original-trade charts to collapsed review timeline cards and compact campaign marker labels.

**Architecture:** A server action verifies group ownership and membership before loading one member's existing chart data. The client timeline caches each loaded response. Campaign markers remain arrows but use compact E/X text.

**Tech Stack:** Next.js Server Actions, React, TypeScript, Vitest, lightweight-charts.

---

### Task 1: Secure lazy member-chart action

**Files:**
- Modify: `src/app/actions.ts`, `src/app/actions.test.ts`, `src/lib/app-data.ts`, `src/lib/app-data.test.ts`

- [ ] Write failing tests for `loadTradeReviewMemberCharts(groupId, reconstructionKey)`: authenticated owner/member returns the existing trade's `charts`; foreign, missing, or non-member request throws; no chart is requested before the action runs.
- [ ] Run `npm test -- src/app/actions.test.ts src/lib/app-data.test.ts` and confirm failure.
- [ ] Implement the action: scope group/member lookup to `user_id`, resolve its current trade by reconstruction key, call the shared trade-detail chart loader, and return `TradeCharts` or the existing chart-unavailable result.
- [ ] Re-run the focused tests; commit `feat: load review member charts`.

### Task 2: Render cached collapsible member charts and tidy labels

**Files:**
- Modify: `src/components/trade-review-group-detail.tsx`, `src/components/trade-review-group-detail.test.tsx`, `src/lib/market-data/trade-charts.ts`, `src/lib/market-data/trade-charts.test.ts`, `src/components/trade-chart-panel.tsx`, `src/components/trade-chart-panel.test.ts`

- [ ] Write failing component/chart tests: a timeline card initially renders `View chart`; click loads once, renders `TradeChartPanel`, and caches its response; campaign marker labels equal `T1 E` and `T1 X`.
- [ ] Run `npm test -- src/components/trade-review-group-detail.test.tsx src/lib/market-data/trade-charts.test.ts src/components/trade-chart-panel.test.ts` and confirm failure.
- [ ] Add per-member loading/error/cache state to the client component. Call the new action only on first expansion, render the original chart panel beneath that card, and use a `Hide chart` control after load. Change campaign marker labels to `T{index} E` / `T{index} X`; reduce chart font size from 14 to 12.
- [ ] Re-run focused tests; commit `feat: show review member charts`.

### Task 3: Verify

- [ ] Run `npm test`, `npm run lint`, and `npm run build`.
- [ ] Open `/trades/groups/[id]`, expand a timeline chart, confirm the original chart appears once and the Daily campaign annotations are compact.
