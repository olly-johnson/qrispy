# Gapper Web-Source Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent stale and undated web-search citations from being used as a gapper's current-session news context.

**Architecture:** The web-search provider will request structured, source-dated findings and locally validate each timestamp against the row's `previousCloseAt`. Only valid post-close findings enter the existing Massive -> web -> X cascade. The browser cache schema version advances to prevent previous citation-only results being replayed.

**Tech Stack:** Next.js route handler, OpenAI Responses API web search, TypeScript, Vitest.

---

## File structure

- Modify: `src/lib/market-data/gapper-news-sources.ts` — request structured dated web findings, validate and normalize them.
- Modify: `src/lib/market-data/gapper-news-sources.test.ts` — cover retained fresh finding, rejected stale/undated findings, and X fallback.
- Modify: `src/lib/market-data/gappers-client.ts` — advance the cache-key version.
- Modify: `src/lib/market-data/gappers-client.test.ts` — prove the cache contract no longer reads v2 results.

### Task 1: Specify and test fresh web findings

**Files:**
- Modify: `src/lib/market-data/gapper-news-sources.test.ts`

- [ ] **Step 1: Write the failing provider test for dated results**

Add a mocked Responses payload whose `output_text` contains one source published at `2026-06-16T12:30:00.000Z`, one source at `2026-06-15T19:59:59.000Z`, and one source with `publishedUtc: "not-a-date"`. Call the real provider with a cutoff of `2026-06-15T20:00:00.000Z`; expect only the first source, including its preserved publication timestamp.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/lib/market-data/gapper-news-sources.test.ts`

Expected: FAIL because the current provider consumes citation annotations and normalizes every web source with `publishedUtc: null`.

- [ ] **Step 3: Write the failing stale-web-to-X fallback test**

Use the real web provider with a mocked response containing only a pre-cutoff source and an X provider returning `source("x")`. Pass both through `collectGapperNewsSources` and expect the X layer.

- [ ] **Step 4: Run the focused test to verify it fails**

Run: `npm test -- src/lib/market-data/gapper-news-sources.test.ts`

Expected: FAIL because the stale web citation currently prevents the X fallback.

### Task 2: Enforce the date contract

**Files:**
- Modify: `src/lib/market-data/gapper-news-sources.ts`
- Test: `src/lib/market-data/gapper-news-sources.test.ts`

- [ ] **Step 1: Request structured dated web sources**

Send the Responses request with a strict JSON schema named `gapper_web_news_sources`, containing an array of `publishedUtc`, `summary`, `title`, and `url` strings. The prompt must require source-stated UTC timestamps on or after `previousCloseAt`, exclude undated entries, earnings calendars, quote pages, and company background pages, and return an empty array if none qualify.

- [ ] **Step 2: Validate the response locally**

Parse `output_text` as the structured source list. Retain an entry only where both `new Date(source.publishedUtc).getTime()` and `new Date(previousCloseAt).getTime()` are finite and the former is greater than or equal to the latter. Normalize retained entries as web sources while preserving their timestamp. Let JSON parse failures surface as descriptive request errors.

- [ ] **Step 3: Run focused source tests**

Run: `npm test -- src/lib/market-data/gapper-news-sources.test.ts`

Expected: PASS, including fresh-source retention and X fallback after stale web entries are removed.

- [ ] **Step 4: Commit the source-contract change**

Run:
```bash
git add src/lib/market-data/gapper-news-sources.ts src/lib/market-data/gapper-news-sources.test.ts
git commit -m "fix: filter stale gapper web sources"
```

### Task 3: Invalidate old browser summaries

**Files:**
- Modify: `src/lib/market-data/gappers-client.ts`
- Modify: `src/lib/market-data/gappers-client.test.ts`

- [ ] **Step 1: Write the failing v2-cache regression test**

Seed storage with a fresh result under `qrispy:gapper-news-summary:v2:openai:gpt-4o-mini:ACME:2026-06-15T20:00:00.000Z`. Call `getCachedGappersSummaryResults` for that request and expect it in `missingRequests`, not `cachedResults`.

- [ ] **Step 2: Run the focused cache test to verify it fails**

Run: `npm test -- src/lib/market-data/gappers-client.test.ts`

Expected: FAIL because the current cache prefix is v2.

- [ ] **Step 3: Advance the cache prefix**

Change only the prefix from `v2` to `v3`. Keep the namespace unchanged so the existing clear control removes both old and new records.

- [ ] **Step 4: Run focused cache tests**

Run: `npm test -- src/lib/market-data/gappers-client.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the cache migration**

Run:
```bash
git add src/lib/market-data/gappers-client.ts src/lib/market-data/gappers-client.test.ts
git commit -m "fix: refresh cached gapper news sources"
```

### Task 4: Full verification and PR evidence

**Files:**
- Verify: `src/lib/market-data/gapper-news-sources.test.ts`
- Verify: `src/lib/market-data/gappers-client.test.ts`

- [ ] **Step 1: Run full verification**

Run:
```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Capture visual evidence**

Clear cached news and summarise a selected gapper in an authenticated browser session. Capture a screenshot that shows the compact summary after the fresh-source contract. If authentication prevents browser verification, record focused-test and direct-provider evidence in the PR.

- [ ] **Step 3: Create a draft pull request**

Push `codex/gapper-news-date-filter`, open a draft PR against `main`, include verification and visual evidence (or the authenticated-browser limitation), then wait for CI.
