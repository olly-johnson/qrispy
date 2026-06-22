# Trade Review Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Let users collapse two or more closed trades for the same ticker into a persistent, review-only campaign with combined P&L, a campaign chart, and an individual-trade timeline.

**Architecture:** Persist group metadata separately from broker-reconstructed trades, using the stable reconstruction_key as membership identity. Make the history loader return normal trade rows and calculated group rows, then build the group page from the current resolved trades and their fills. Reuse TradeChartPanel with Daily and hourly campaign data plus labelled markers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/Postgres with RLS, Vitest, lightweight-charts, Tailwind CSS.

---

## File map

- Create: supabase/migrations/20260622100000_add_trade_review_groups.sql — group tables, constraints, grants, RLS.
- Create: src/lib/trade-review-groups.ts — pure validation, labels, summaries, selection state.
- Create: src/lib/trade-review-groups.test.ts — pure-model tests.
- Modify: src/lib/supabase/schema.test.ts — migration contract test.
- Modify: src/lib/app-data.ts and src/lib/app-data.test.ts — group-aware history and group details.
- Modify: src/app/actions.ts and src/app/actions.test.ts — authenticated group mutations.
- Modify: src/lib/market-data/trade-charts.ts and its test — combined Daily/hourly data.
- Modify: src/components/trade-chart-panel.tsx and its test — optional marker labels and chart title.
- Create: src/components/trade-history-table.tsx — selectable history UI.
- Create: src/components/trade-history-table.test.tsx — initial grouped and individual row rendering.
- Create: src/components/trade-review-group-detail.tsx — group controls and timeline.
- Modify: src/app/trades/page.tsx; create: src/app/trades/groups/[id]/page.tsx — route wiring.
- No CI change: .github/workflows/ci.yml already runs npm test, npm run lint, and npm run build for pull requests.

### Task 1: Add the review-group database contract

**Files:**

- Create: supabase/migrations/20260622100000_add_trade_review_groups.sql
- Modify: src/lib/supabase/schema.test.ts

- [ ] **Step 1: Write the failing migration-contract test**

Add a Trade review groups migration test beside the stop-group migration test. Read the new migration and assert both tables, the unique membership rule, cascade deletion, RLS, and policies:

~~~ts
expect(sql).toContain("create table public.trade_review_groups");
expect(sql).toContain("create table public.trade_review_group_members");
expect(sql).toContain("unique (user_id, reconstruction_key)");
expect(sql).toContain("references public.trade_review_groups(id) on delete cascade");
expect(sql).toContain("alter table public.trade_review_groups enable row level security");
expect(sql).toContain("owner can insert trade review groups");
expect(sql).toContain("owner can delete trade review group members");
~~~

- [ ] **Step 2: Run the focused test to verify it fails**

Run: npm test -- src/lib/supabase/schema.test.ts

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the migration**

Create trade_review_groups with id, user_id, nullable custom_name, symbol, created_at, and updated_at. Do not add a direction column.

Create trade_review_group_members with group_id referencing trade_review_groups(id) on delete cascade, user_id, reconstruction_key, and created_at. Add primary key (group_id, reconstruction_key), unique (user_id, reconstruction_key), an index on group_id, and an index on (user_id, reconstruction_key).

Enable RLS, grant select/insert/update/delete to authenticated and service_role, and add owner select/insert/update/delete policies to both tables. Use the established pattern:

~~~sql
create policy "owner can insert trade review groups"
on public.trade_review_groups for insert to authenticated
with check ((select auth.uid()) = user_id);
~~~

- [ ] **Step 4: Re-run the focused test**

Run: npm test -- src/lib/supabase/schema.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add supabase/migrations/20260622100000_add_trade_review_groups.sql src/lib/supabase/schema.test.ts
git commit -m "feat: add trade review group schema"
~~~

### Task 2: Build and test the pure review-group model

**Files:**

- Create: src/lib/trade-review-groups.ts
- Create: src/lib/trade-review-groups.test.ts

- [ ] **Step 1: Write failing eligibility and collapse tests**

Create fixtures for two closed CAR trades with opposite directions, a closed AMD trade, and an open CAR trade. Prove mixed directions are allowed, but symbols and statuses are enforced:

~~~ts
expect(validateTradeReviewGroup([carLong, carShort])).toEqual({ symbol: "CAR" });
expect(() => validateTradeReviewGroup([carLong, amdTrade])).toThrow(
  "Selected trades must use the same symbol.",
);
expect(() => validateTradeReviewGroup([carLong, openCarTrade])).toThrow(
  "Only closed trades can be grouped.",
);
~~~

Add a buildTradeHistoryItems test: two CAR membership keys must become one group with the earliest opening date, latest closing date, summed P&L and fees, while the member rows disappear and AMD remains. Add a stale key test: an unmatched membership produces no empty group and hides no current trade.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: npm test -- src/lib/trade-review-groups.test.ts

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement types and helpers**

Export these types:

~~~ts
export type TradeReviewGroupSource = {
  id: string;
  customName: string | null;
  symbol: string;
  createdAt: string;
  updatedAt: string;
};

export type ReviewableTrade = DashboardTrade & {
  reconstructionKey: string;
};

export type TradeHistoryItem =
  | { kind: "trade"; trade: ReviewableTrade }
  | {
      kind: "group";
      group: TradeReviewGroupSource & {
        label: string;
        openedAt: string;
        closedAt: string;
        tradeCount: number;
        realizedPnl: number | null;
        totalFees: number | null;
      };
    };
~~~

Implement validateTradeReviewGroup(trades) to require at least two unique reconstructed keys, every trade CLOSED, and exactly one non-empty symbol. It must not inspect direction.

Implement formatTradeReviewGroupLabel so a non-empty custom name wins; otherwise it returns a compact symbol/date-range label such as CAR · 2–16 Jun 2026.

Implement buildTradeHistoryItems({ trades, groups, members }) to resolve members by reconstruction key, ignore stale memberships, create summary rows, suppress resolved child rows, and sort all rows by openedAt descending. A nullable numeric total is null only if every contributing value is null.

Implement getTradeReviewSelection(trades, selectedTradeIds), returning selected IDs plus null error only when two or more closed, same-symbol individual rows are selected.

- [ ] **Step 4: Re-run the focused test**

Run: npm test -- src/lib/trade-review-groups.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/lib/trade-review-groups.ts src/lib/trade-review-groups.test.ts
git commit -m "feat: add trade review group model"
~~~

### Task 3: Load groups without affecting dashboard metrics

**Files:**

- Modify: src/lib/app-data.ts
- Modify: src/lib/app-data.test.ts

- [ ] **Step 1: Write failing loader tests**

Extend the mock client so trades, trade_review_groups, and trade_review_group_members can be queried. Assert getTradeHistory returns one group CAR row and one ungrouped trade row from a three-trade fixture; verify a stale member key does not hide a trade.

Add a getTradeReviewGroupDetail test with an owned group, two current members, and allocated fills. Assert that the returned timeline is ascending by openedAt, preserves each trade direction, sums P&L/fees, and sends both trades to the combined chart builder.

Add a dashboard regression assertion that getDashboardData never calls from("trade_review_groups") or from("trade_review_group_members").

- [ ] **Step 2: Run the focused loader test to verify it fails**

Run: npm test -- src/lib/app-data.test.ts

Expected: FAIL because getTradeHistory returns DashboardTrade[] and getTradeReviewGroupDetail is undefined.

- [ ] **Step 3: Implement the read model**

Extend only the narrow internal Supabase client interfaces needed for group and membership selects.

Map history rows with:

~~~ts
function mapReviewableTrade(row: Record<string, unknown>): ReviewableTrade {
  return {
    ...mapTrade(row),
    reconstructionKey: String(row.reconstruction_key ?? ""),
  };
}
~~~

Change getTradeHistory to fetch normal history, owned group rows, and owned membership rows in Promise.all. Keep the existing history-window filtering before passing rows to buildTradeHistoryItems.

Extract the fill-loading part of getTradeDetail into a row-based helper. Add getTradeReviewGroupDetail(userId, groupId, options), which verifies group ownership, resolves member reconstruction keys to current trades, loads their fills without individual charts, returns null for an absent/foreign/all-stale group, orders the timeline, and requests one combined chart after the complete timeline is available.

Do not change getDashboardData or its query list.

- [ ] **Step 4: Re-run focused tests**

Run: npm test -- src/lib/app-data.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/lib/app-data.ts src/lib/app-data.test.ts
git commit -m "feat: load trade review groups"
~~~

### Task 4: Add authenticated group mutations

**Files:**

- Modify: src/app/actions.ts
- Modify: src/app/actions.test.ts

- [ ] **Step 1: Write failing server-action tests**

Using the existing requireUser/createSupabaseServerClient/revalidatePath mocks, cover create, rename, remove, and delete.

~~~ts
await createTradeReviewGroup(formDataWith(["trade-1", "trade-2"]));
expect(revalidatePath).toHaveBeenCalledWith("/trades");

await expect(createTradeReviewGroup(formDataWith(["trade-1"]))).rejects.toThrow(
  "Select at least two trades.",
);
await expect(createTradeReviewGroup(formDataWith(["car-1", "amd-1"]))).rejects.toThrow(
  "Selected trades must use the same symbol.",
);
~~~

Assert mixed CAR long/short succeeds. Assert rename stores trimmed text or null. Assert removing the final member deletes the group. Assert every mutating query includes user_id and group paths are revalidated.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: npm test -- src/app/actions.test.ts

Expected: FAIL because the actions do not exist.

- [ ] **Step 3: Implement server actions**

Export:

~~~ts
export async function createTradeReviewGroup(formData: FormData): Promise<void>
export async function renameTradeReviewGroup(groupId: string, formData: FormData): Promise<void>
export async function removeTradeReviewGroupMember(
  groupId: string,
  reconstructionKey: string,
): Promise<void>
export async function deleteTradeReviewGroup(groupId: string): Promise<void>
~~~

Create parses repeated tradeId form values, re-queries the requested trade rows for the authenticated user, validates with validateTradeReviewGroup, rejects pre-existing memberships, inserts the group, then inserts all member rows. If member insertion fails, delete the just-created owned group before rethrowing.

Rename scopes the update by user_id and id. Remove scopes group and member deletes by user_id, then deletes the group only if no owned member rows remain. Delete scopes by user_id and id; the database cascade deletes memberships. Every successful mutation revalidates /trades; rename/remove/delete also revalidate the corresponding group URL.

- [ ] **Step 4: Re-run the focused test**

Run: npm test -- src/app/actions.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/app/actions.ts src/app/actions.test.ts
git commit -m "feat: manage trade review groups"
~~~

### Task 5: Generate campaign charts with per-trade labels

**Files:**

- Modify: src/lib/market-data/trade-charts.ts
- Modify: src/lib/market-data/trade-charts.test.ts
- Modify: src/components/trade-chart-panel.tsx
- Modify: src/components/trade-chart-panel.test.ts

- [ ] **Step 1: Write failing combined-chart tests**

Create a two-week CAR fixture containing a long and a short trade. Assert Daily and hourly datasets, merged markers, and visible direction labels:

~~~ts
expect(result.charts.map((chart) => chart.id)).toEqual(["daily", "hourly"]);
expect(result.charts[0].markers).toEqual(expect.arrayContaining([
  expect.objectContaining({ label: "T1 LONG ENTRY" }),
  expect.objectContaining({ label: "T2 SHORT EXIT" }),
]));
~~~

Add a prepareChartData test proving a marker label is rendered as marker text and a regular marker without label still renders its numeric quantity.

- [ ] **Step 2: Run focused chart tests to verify they fail**

Run: npm test -- src/lib/market-data/trade-charts.test.ts src/components/trade-chart-panel.test.ts

Expected: FAIL because campaign chart construction and marker labels do not exist.

- [ ] **Step 3: Implement chart data and panel reuse**

Extend TradeChartMarker with optional label. Preserve the existing individual marker display:

~~~ts
text: marker.label ?? formatMarkerQuantity(marker.quantity),
~~~

Add getTradeReviewGroupCharts accepting symbol, openedAt, closedAt, member trades with direction/fills, client, and provider. Return a configuration-error result for a missing provider.

For available market data, fetch cached Daily bars from 500 days before the first open through 120 days after the final close to compute moving averages; display 30 days before through 10 days after the campaign. Fetch hourly bars from two calendar days before the first open through two days after final close and display that entire window. Flatten fills in timeline order and label them T1 LONG ENTRY, T1 LONG EXIT, T2 SHORT ENTRY, and so on.

Add optional title prop to TradeChartPanel and use it in normal, no-data, and error headings. The group page passes Campaign chart and no stop groups.

- [ ] **Step 4: Re-run focused chart tests**

Run: npm test -- src/lib/market-data/trade-charts.test.ts src/components/trade-chart-panel.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add src/lib/market-data/trade-charts.ts src/lib/market-data/trade-charts.test.ts src/components/trade-chart-panel.tsx src/components/trade-chart-panel.test.ts
git commit -m "feat: chart trade review campaigns"
~~~

### Task 6: Render the grouped list and review route

**Files:**

- Create: src/components/trade-history-table.tsx
- Create: src/components/trade-history-table.test.tsx
- Create: src/components/trade-review-group-detail.tsx
- Modify: src/app/trades/page.tsx
- Create: src/app/trades/groups/[id]/page.tsx
- Modify: src/lib/trade-review-groups.test.ts

- [ ] **Step 1: Write the failing list-render test**

Create src/components/trade-history-table.test.tsx using renderToStaticMarkup from react-dom/server. Mock the create action and pass one individual item plus one group item. Assert the initial markup exposes a closed-trade checkbox, a disabled Group selected (0) button, the calculated group label, and its /trades/groups/group-1 link:

~~~ts
const html = renderToStaticMarkup(<TradeHistoryTable items={items} />);
expect(html).toContain('aria-label="Select CAR trade-1"');
expect(html).toContain("Group selected (0)");
expect(html).toContain("CAR · 2–16 Jun 2026");
expect(html).toContain('href="/trades/groups/group-1"');
~~~

- [ ] **Step 2: Run the focused test to verify it fails**

Run: npm test -- src/components/trade-history-table.test.tsx

Expected: FAIL because TradeHistoryTable does not exist.

- [ ] **Step 3: Implement list, detail, and route**

Create the client TradeHistoryTable. It stores selected individual IDs in a Set, uses getTradeReviewSelection every render, and renders checkboxes only for ungrouped CLOSED rows. Its Group selected (n) button is disabled unless selection is valid. In startTransition, append one tradeId field per selected row to FormData, call createTradeReviewGroup, and clear the selection after success.

Render group rows with label, date range, trade count, P&L, fees, and a link to the route formed from its group ID, for example /trades/groups/group-1. Preserve the existing ungrouped Open link and column styles. Replace the table markup in src/app/trades/page.tsx with this component.

Create the protected group route. Await params, require the user, call getTradeReviewGroupDetail, call notFound on null, and render the existing AppShell, TradeChartPanel title Campaign chart, and TradeReviewGroupDetail.

TradeReviewGroupDetail renders rename and delete forms plus a chronological card for every original trade. Every card includes direction, open/close dates, duration, size, P&L, average entry/exit, remove-member action bound to group ID and reconstruction key, and link to the original trade route. Delete must return the user to /trades exactly once, using either a client router replace after a successful action or a redirecting server action.


- [ ] **Step 4: Re-run component test and compile the route**

Run: npm test -- src/components/trade-history-table.test.tsx

Expected: PASS.

Run: npm run build

Expected: PASS, including the App Router group route and server-action bindings.

- [ ] **Step 5: Commit**

~~~powershell
git add src/components/trade-history-table.tsx src/components/trade-history-table.test.tsx src/components/trade-review-group-detail.tsx src/app/trades/page.tsx src/app/trades/groups/[id]/page.tsx
git commit -m "feat: review grouped trades"
~~~

### Task 7: Verify, capture evidence, and publish

**Files:**

- Modify only files corrected by verification. Do not change .github/workflows/ci.yml unless it is found not to run npm test, lint, and build.

- [ ] **Step 1: Run the full suite**

Run: npm test

Expected: PASS. Existing CI runs this command, so every new Vitest test is included.

- [ ] **Step 2: Run quality and production checks**

Run: npm run lint

Expected: PASS with no new warnings or errors.

Run: npm run build

Expected: PASS with /trades/groups/[id] compiled.

- [ ] **Step 3: Verify the authenticated visual flow**

Start the app and use browser automation to select two same-ticker closed trades, create the group, confirm the list has one collapsed group row, open it, confirm total P&L plus Daily/hourly chart and timeline, remove one member and confirm it returns to the list, then delete the group and confirm all original rows return. Capture a screenshot of the grouped list and group page.

- [ ] **Step 4: Commit corrections and open the PR**

~~~powershell
git push -u origin codex/trade-review-groups
~~~

Open a pull request to main, attach screenshots, confirm GitHub Actions passes, and provide its URL.
