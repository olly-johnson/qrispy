# Market Context Brief Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add a shared, sourced market-context brief to Dashboard and Gappers, refreshed after 7:00 AM ET on US trading days and on demand.

**Architecture:** A domain service calculates the current US-equity briefing date, persists one Supabase row per date, and obtains fresh content through a two-stage OpenAI web-search/extraction flow. An authenticated route forces a replacement; one client card shows the compact Dashboard and complete Gappers variants.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Supabase Postgres/RLS, OpenAI Responses API, Tailwind CSS.

---

## File Structure

- supabase/migrations/*_add_market_daily_briefs.sql — CLI-generated table, RLS, grants, and read policy.
- src/lib/market-data/market-context.ts — date window, typed data, store, retrieval provider, and refresh orchestration.
- src/lib/market-data/market-context.test.ts — unit tests for time, persistence, provider, and failure cases.
- src/app/api/market-context/refresh/route.ts — authenticated forced-refresh endpoint.
- src/components/market-context-card.tsx — reusable card and browser refresh control.
- src/app/dashboard/page.tsx / src/app/gappers/page.tsx — shared loader result and placement.
- src/lib/supabase/schema.test.ts — migration assertion.

### Task 1: Create the shared Brief table

**Files:**
- Create: supabase/migrations/*_add_market_daily_briefs.sql (generate only through the CLI)
- Modify: src/lib/supabase/schema.test.ts
- Test: src/lib/supabase/schema.test.ts

- [ ] **Step 1: Write the failing schema test**

Add a suite that discovers the generated migration and asserts:

~~~ts
const name = readdirSync(join(process.cwd(), "supabase", "migrations"))
  .find((entry) => entry.endsWith("_add_market_daily_briefs.sql"));
expect(name).toBeDefined();
const sql = readFileSync(join(process.cwd(), "supabase", "migrations", name!), "utf8");

expect(sql).toContain("create table public.market_daily_briefs");
expect(sql).toContain("market_date date primary key");
expect(sql).toContain("notable_news jsonb not null");
expect(sql).toContain("events jsonb not null");
expect(sql).toContain("sources jsonb not null");
expect(sql).toContain("alter table public.market_daily_briefs enable row level security");
expect(sql).toContain("grant select on table public.market_daily_briefs to authenticated");
expect(sql).toContain("grant select, insert, update, delete on table public.market_daily_briefs to service_role");
expect(sql).toContain("authenticated can select market daily briefs");
~~~

- [ ] **Step 2: Verify the test fails**

Run: npm test -- src/lib/supabase/schema.test.ts

Expected: FAIL because no migration matches the filename suffix.

- [ ] **Step 3: Generate the migration and add the minimum secure schema**

Run: npx supabase migration new add_market_daily_briefs

Use the exact emitted path and replace its body with:

~~~sql
create table public.market_daily_briefs (
  market_date date primary key,
  headline text not null,
  notable_news jsonb not null,
  events jsonb not null,
  sources jsonb not null,
  generated_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.market_daily_briefs enable row level security;

grant select on table public.market_daily_briefs to authenticated;
grant select, insert, update, delete on table public.market_daily_briefs to service_role;

create policy "authenticated can select market daily briefs"
on public.market_daily_briefs for select to authenticated
using (true);
~~~

- [ ] **Step 4: Verify and commit**

Run: npm test -- src/lib/supabase/schema.test.ts
Expected: PASS.

~~~bash
git add supabase/migrations src/lib/supabase/schema.test.ts
git commit -m "feat: persist daily market context briefs"
~~~

### Task 2: Implement the market-context service with a 7 AM ET contract

**Files:**
- Create: src/lib/market-data/market-context.ts
- Create: src/lib/market-data/market-context.test.ts
- Modify: src/lib/env.ts
- Modify: src/lib/env.test.ts

- [ ] **Step 1: Write the failing domain tests**

Use fixed UTC instants that prove the ET boundary and market calendar:

~~~ts
expect(marketContextWindow(new Date("2026-06-23T10:59:59.000Z"))).toMatchObject({
  canRefresh: true, shouldGenerateToday: false, tradingDate: "2026-06-23",
});
expect(marketContextWindow(new Date("2026-06-23T11:00:00.000Z"))).toMatchObject({
  canRefresh: true, shouldGenerateToday: true, tradingDate: "2026-06-23",
});
expect(marketContextWindow(new Date("2026-06-20T14:00:00.000Z"))).toMatchObject({
  canRefresh: false, shouldGenerateToday: false, tradingDate: "2026-06-19",
});
~~~

Add fake Supabase client/provider cases proving: pre-7 AM reads the latest stored row, an absent post-7 AM row is generated then upserted, a generation error preserves the prior row as stale, and manual refresh is rejected on a non-trading day. Add an env test that getMarketContextConfig() returns the existing OpenAI key and default gpt-4o-mini.

- [ ] **Step 2: Verify they fail**

Run: npm test -- src/lib/market-data/market-context.test.ts src/lib/env.test.ts

Expected: FAIL because the module and config function do not exist.

- [ ] **Step 3: Implement the service contract**

Add these exported types and the matching marketContextWindow, loadMarketContextBrief, and refreshMarketContextBrief functions:

~~~ts
export type MarketContextItem = {
  category: string;
  kind: "developing" | "scheduled";
  sourceIds: string[];
  summary: string;
  timeEt: string | null;
};
export type MarketContextSource = {
  id: string; publisher: string | null; title: string; url: string;
};
export type MarketContextBrief = {
  events: MarketContextItem[];
  generatedAt: string;
  headline: string;
  marketDate: string;
  notableNews: MarketContextItem[];
  sources: MarketContextSource[];
};
export type MarketContextLoadResult = {
  brief: MarketContextBrief | null;
  canRefresh: boolean;
  error: string | null;
  isStale: boolean;
};
export type MarketContextProvider = {
  generate(input: { marketDate: string }): Promise<Omit<MarketContextBrief, "generatedAt" | "marketDate">>;
};
~~~

Use Intl.DateTimeFormat with America/New_York and the existing isUsEquityTradingDay helper. Read the latest record at or before the eligible date, map JSON columns to these types, and upsert only after successful generation. Extend env.ts with:

~~~ts
export function getMarketContextConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return { apiKey, model: process.env.NEWS_SUMMARY_LLM_MODEL ?? "gpt-4o-mini" };
}
~~~

- [ ] **Step 4: Verify and commit**

Run: npm test -- src/lib/market-data/market-context.test.ts src/lib/env.test.ts
Expected: PASS.

~~~bash
git add src/lib/env.ts src/lib/env.test.ts src/lib/market-data/market-context.ts src/lib/market-data/market-context.test.ts
git commit -m "feat: add market context cache service"
~~~

### Task 3: Add sourced and bounded OpenAI retrieval

**Files:**
- Modify: src/lib/market-data/market-context.ts
- Modify: src/lib/market-data/market-context.test.ts

- [ ] **Step 1: Write the failing provider tests**

Mock fetch twice. Verify request one uses { type: "web_search" } and asks for material market/world news plus macro, Fed, inflation, election, index, and options-expiry context for 2026-06-23. Return two annotations. Verify request two receives normalised ids web:0 and web:1, uses strict JSON, and rejects an item that names a missing source id. Verify arrays larger than five are truncated and missing event time stays null.

- [ ] **Step 2: Verify they fail**

Run: npm test -- src/lib/market-data/market-context.test.ts

Expected: FAIL because no OpenAI provider exists.

- [ ] **Step 3: Implement the two-stage provider**

Add:

~~~ts
export function createOpenAiMarketContextProvider(input: {
  apiKey: string;
  fetcher?: typeof fetch;
  model: string;
}): MarketContextProvider
~~~

First call Responses with web search and a date-specific discovery prompt. Normalize only title-plus-absolute-HTTP(S)-URL annotations as sequential web source IDs. Second call Responses with strict JSON schema and the normalized source records, requiring every news/event item to contain non-empty sourceIds. It returns headline, notableNews, and events; discard unreferenced sources, clamp each item list to five, and throw if there is no source-backed content. Keep absent times null and do not invent facts from search snippets.

- [ ] **Step 4: Verify and commit**

Run: npm test -- src/lib/market-data/market-context.test.ts
Expected: PASS.

~~~bash
git add src/lib/market-data/market-context.ts src/lib/market-data/market-context.test.ts
git commit -m "feat: generate sourced market context briefs"
~~~

### Task 4: Add the authenticated refresh endpoint

**Files:**
- Create: src/app/api/market-context/refresh/route.ts
- Create: src/app/api/market-context/refresh/route.test.ts
- Modify: src/lib/market-data/market-context.ts
- Modify: src/lib/market-data/market-context.test.ts

- [ ] **Step 1: Write failing route tests**

Mock getCurrentUser, getMarketContextConfig, createSupabaseAdminClient, and refreshMarketContextBrief, asserting:

~~~ts
await expect(response.json()).resolves.toEqual({
  error: "Sign in to refresh market context.",
}); // status 401
await expect(response.json()).resolves.toEqual({
  error: "Market context refresh is available on US trading days only.",
}); // status 409
await expect(response.json()).resolves.toEqual({
  brief: expect.objectContaining({ marketDate: "2026-06-23" }),
}); // status 200
~~~

Also cover missing OpenAI config (400), missing admin client (503), and retrieval failure (502) with no partial brief.

- [ ] **Step 2: Verify they fail**

Run: npm test -- src/app/api/market-context/refresh/route.test.ts
Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the POST route**

Authenticate before any OpenAI or database work. Instantiate only the existing createSupabaseAdminClient() and getMarketContextConfig() values, call createOpenAiMarketContextProvider(config), then call refreshMarketContextBrief with client, current date, and provider. Return the tested 401/400/503/409 statuses; on provider failure return 502 with the source error after a short fixed prefix. Do not reveal credentials or service-role details.

- [ ] **Step 4: Verify and commit**

Run: npm test -- src/app/api/market-context/refresh/route.test.ts
Expected: PASS.

~~~bash
git add src/app/api/market-context/refresh/route.ts src/app/api/market-context/refresh/route.test.ts src/lib/market-data/market-context.ts src/lib/market-data/market-context.test.ts
git commit -m "feat: add market context refresh API"
~~~

### Task 5: Render the Dashboard and Gappers cards

**Files:**
- Create: src/components/market-context-card.tsx
- Create: src/components/market-context-card.test.ts
- Modify: src/app/dashboard/page.tsx
- Modify: src/app/gappers/page.tsx
- Create: src/app/dashboard/page.test.ts
- Create: src/app/gappers/page.test.ts

- [ ] **Step 1: Write failing card and loader tests**

Export a pure display selector and test the intended scope:

~~~ts
expect(marketContextCardSections(result, "dashboard")).toEqual({
  events: result.brief!.events,
  headline: result.brief!.headline,
  notableNews: [],
});
expect(marketContextCardSections(result, "gappers")).toEqual({
  events: result.brief!.events,
  headline: result.brief!.headline,
  notableNews: result.brief!.notableNews,
});
~~~

Test sourcesForItem() returns only source IDs declared by the item and no source for an unavailable result. Mock page loaders to assert both pages pass loadMarketContextBrief() output into MarketContextCard, never a direct provider request.

- [ ] **Step 2: Verify they fail**

Run: npm test -- src/components/market-context-card.test.ts src/app/dashboard/page.test.ts src/app/gappers/page.test.ts

Expected: FAIL because the card and page tests do not exist.

- [ ] **Step 3: Implement shared presentation and wiring**

Make MarketContextCard a client component accepting result and variant dashboard/gappers. It renders a labelled section, headline, timestamp/stale state, accessible external source links, and a real Refresh button. The Dashboard variant renders events only; the Gappers variant adds notable-news bullets. The button POSTs the refresh route, renders returned errors inline, calls router.refresh() on success, displays Refreshing… while pending, and disables on non-trading days.

In Dashboard, load the result in the existing Promise.all and insert the compact card below the Portfolio header before metrics. In Gappers, load it beside buildGappersSnapshot and place the complete card before GappersTable. Both use the same service result and existing Supabase admin client.

- [ ] **Step 4: Verify and capture the review screenshot**

Run: npm test -- src/components/market-context-card.test.ts src/app/dashboard/page.test.ts src/app/gappers/page.test.ts
Expected: PASS.

Start npm run dev, sign in locally, visit /dashboard and /gappers with the in-app browser, and capture a screenshot showing the cards. Confirm Dashboard omits notable news and Gappers contains it.

- [ ] **Step 5: Commit**

~~~bash
git add src/components/market-context-card.tsx src/components/market-context-card.test.ts src/app/dashboard/page.tsx src/app/gappers/page.tsx src/app/dashboard/page.test.ts src/app/gappers/page.test.ts
git commit -m "feat: show daily market context on dashboard and gappers"
~~~

### Task 6: Verify, push, and open the review PR

**Files:**
- Verify only: .github/workflows/ci.yml, vitest.config.ts

- [ ] **Step 1: Confirm CI collects the new tests**

Run: rg -n 'src/\*\*/\*.test|npm test' vitest.config.ts .github/workflows/ci.yml

Expected: the configured source glob includes the new tests and pull-request CI runs npm test; no CI configuration change is required.

- [ ] **Step 2: Run full verification**

Run: npm test && npm run lint && npm run build

Expected: exit code 0 for all three.

- [ ] **Step 3: Review the final scope**

Run: git status --short && git diff main...HEAD --check && git log --oneline main..HEAD

Expected: only the planned migration, service, API, UI, tests, and docs; no whitespace errors.

- [ ] **Step 4: Push and open the pull request with the captured screenshot**

~~~bash
git push -u origin codex/market-context-brief
gh pr create --draft --base main --head codex/market-context-brief --title "Add daily market context brief"
~~~

Attach the Task 5 screenshot and list npm test, npm run lint, and npm run build in the PR verification notes. Then run gh pr checks --watch; every required check must pass before requesting review.

