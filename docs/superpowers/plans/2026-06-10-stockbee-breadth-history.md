# Stockbee Breadth History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist raw Stockbee Market Monitor CSV rows and show every persisted row in year tabs on the Market Breadth page.

**Architecture:** Add a Supabase `stockbee_breadth_rows` table keyed by `date`, then add a focused `stockbee-breadth-store.ts` module for upsert, read, grouping, selected-year, and live-sync fallback behavior. Update the server-rendered Market Breadth page to sync on load, fall back to persisted rows on live failures, and render a query-string-driven year tab table.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components, Supabase Postgres/RLS, TypeScript, Vitest, Tailwind CSS.

---

## File Structure

- Modify `src/lib/supabase/schema.test.ts`: add migration coverage for `stockbee_breadth_rows`, its unique date key, indexes, grants, and RLS policies.
- Create a Supabase migration with `npx supabase migration new add_stockbee_breadth_rows`: define the persisted raw CSV table.
- Create `src/lib/market-data/stockbee-breadth-store.test.ts`: TDD coverage for row payload conversion, upsert, read mapping, year grouping, selected year, and sync fallback.
- Create `src/lib/market-data/stockbee-breadth-store.ts`: all persistence and history loading logic.
- Modify `src/app/market-breadth/page.tsx`: use persisted history, read `searchParams` as a `Promise`, render year tabs and a full-year scroll table.
- Leave `.github/workflows/ci.yml` unchanged because it already runs `npm test`, `npm run lint`, and `npm run build`.

Before editing implementation files, re-read these local Next.js 16 docs:

```bash
Select-String -Path node_modules\next\dist\docs\01-app\01-getting-started\03-layouts-and-pages.md -Pattern "searchParams" -Context 2,6
Select-String -Path node_modules\next\dist\docs\01-app\01-getting-started\06-fetching-data.md -Pattern "Server Components|database" -Context 2,6
```

Key points already checked: `searchParams` is a `Promise` in page props, and Server Components can safely query databases because credentials and query logic are not sent to the client.

Supabase docs checked on 2026-06-10:

- `https://supabase.com/docs/guides/database/postgres/row-level-security`
- `https://supabase.com/docs/guides/api/securing-your-api`

Use RLS plus grants: grants make the table reachable to roles, and RLS policies decide which rows those roles can read or modify.

---

### Task 1: Add Stockbee Breadth Migration

**Files:**
- Modify: `src/lib/supabase/schema.test.ts`
- Create: Supabase CLI-generated migration file ending in `_add_stockbee_breadth_rows.sql`

- [ ] **Step 1: Write the failing migration test**

Change the first import in `src/lib/supabase/schema.test.ts`:

```ts
import { readFileSync, readdirSync } from "node:fs";
```

Append this block to `src/lib/supabase/schema.test.ts`:

```ts
describe("Stockbee breadth rows migration", () => {
  it("adds persisted raw Stockbee rows with authenticated read access", () => {
    const migrationName = readdirSync(join(process.cwd(), "supabase", "migrations")).find(
      (name) => name.endsWith("_add_stockbee_breadth_rows.sql"),
    );
    expect(migrationName).toBeDefined();

    const migrations = readFileSync(
      join(process.cwd(), "supabase", "migrations", migrationName!),
      "utf8",
    );

    expect(migrations).toContain("create table public.stockbee_breadth_rows");
    expect(migrations).toContain("date date primary key");
    expect(migrations).toContain("up_4_percent numeric not null");
    expect(migrations).toContain("down_4_percent numeric not null");
    expect(migrations).toContain("ratio_5_day numeric not null");
    expect(migrations).toContain("ratio_10_day numeric not null");
    expect(migrations).toContain("up_13_in_34_days numeric not null");
    expect(migrations).toContain("down_13_in_34_days numeric not null");
    expect(migrations).toContain("source_url text not null");
    expect(migrations).toContain("source_fetched_at timestamptz not null");
    expect(migrations).toContain("stockbee_breadth_rows_date_desc_idx");
    expect(migrations).toContain("alter table public.stockbee_breadth_rows enable row level security");
    expect(migrations).toContain("grant select on table public.stockbee_breadth_rows to authenticated");
    expect(migrations).toContain("grant select, insert, update, delete on table public.stockbee_breadth_rows to service_role");
    expect(migrations).toContain("authenticated can select stockbee breadth rows");
    expect(migrations).toContain("using (true)");
  });
});
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run:

```bash
npm test -- src/lib/supabase/schema.test.ts
```

Expected: fail because no migration ending in `_add_stockbee_breadth_rows.sql` exists.

- [ ] **Step 3: Create the migration file with the Supabase CLI**

Run:

```bash
npx supabase migration new add_stockbee_breadth_rows
```

Expected: Supabase creates a file under `supabase/migrations/` ending in `_add_stockbee_breadth_rows.sql`.

- [ ] **Step 4: Add the migration SQL**

Put this SQL into the generated `_add_stockbee_breadth_rows.sql` migration file:

```sql
create table public.stockbee_breadth_rows (
  date date primary key,
  up_4_percent numeric not null,
  down_4_percent numeric not null,
  ratio_5_day numeric not null,
  ratio_10_day numeric not null,
  up_25_quarter numeric not null,
  down_25_quarter numeric not null,
  up_25_month numeric not null,
  down_25_month numeric not null,
  up_50_month numeric not null,
  down_50_month numeric not null,
  up_13_in_34_days numeric not null,
  down_13_in_34_days numeric not null,
  universe_count numeric not null,
  t2108 numeric not null,
  sp500 numeric not null,
  source_url text not null,
  source_fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stockbee_breadth_rows_date_desc_idx
  on public.stockbee_breadth_rows (date desc);

alter table public.stockbee_breadth_rows enable row level security;

grant select
on table public.stockbee_breadth_rows
to authenticated;

grant select, insert, update, delete
on table public.stockbee_breadth_rows
to service_role;

create policy "authenticated can select stockbee breadth rows"
on public.stockbee_breadth_rows for select to authenticated
using (true);
```

- [ ] **Step 5: Run the migration test to verify it passes**

Run:

```bash
npm test -- src/lib/supabase/schema.test.ts
```

Expected: all tests in `schema.test.ts` pass.

- [ ] **Step 6: Commit the migration**

Run:

```bash
git add src/lib/supabase/schema.test.ts supabase/migrations/*_add_stockbee_breadth_rows.sql
git commit -m "Add Stockbee breadth rows migration"
```

---

### Task 2: Add Stockbee Breadth Store Helpers

**Files:**
- Create: `src/lib/market-data/stockbee-breadth-store.test.ts`
- Create: `src/lib/market-data/stockbee-breadth-store.ts`

- [ ] **Step 1: Write the failing store tests**

Create `src/lib/market-data/stockbee-breadth-store.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  groupStockbeeBreadthRowsByYear,
  readStockbeeBreadthRows,
  selectedStockbeeBreadthYear,
  stockbeeBreadthUpsertPayload,
  syncStockbeeBreadthRows,
} from "./stockbee-breadth-store";
import type { StockbeeBreadthRow } from "./breadth";

const sourceUrl = "https://example.test/stockbee.csv";
const fetchedAt = new Date("2026-06-10T12:00:00.000Z");

describe("stockbeeBreadthUpsertPayload", () => {
  it("maps raw Stockbee CSV fields to persisted column names", () => {
    expect(stockbeeBreadthUpsertPayload(row({ date: "2026-06-09" }), sourceUrl, fetchedAt)).toEqual({
      date: "2026-06-09",
      down_13_in_34_days: 11,
      down_25_month: 6,
      down_25_quarter: 4,
      down_4_percent: 2,
      down_50_month: 8,
      ratio_10_day: 1.2,
      ratio_5_day: 1.1,
      source_fetched_at: "2026-06-10T12:00:00.000Z",
      source_url: sourceUrl,
      sp500: 7553.68,
      t2108: 39.31,
      universe_count: 6462,
      up_13_in_34_days: 10,
      up_25_month: 5,
      up_25_quarter: 3,
      up_4_percent: 1,
      up_50_month: 7,
      updated_at: "2026-06-10T12:00:00.000Z",
    });
  });
});

describe("syncStockbeeBreadthRows", () => {
  it("upserts rows by date", async () => {
    const client = fakeStockbeeClient([]);

    await syncStockbeeBreadthRows({
      client,
      fetchedAt,
      rows: [row({ date: "2026-06-10" }), row({ date: "2026-06-09" })],
      sourceUrl,
    });

    expect(client.upsertedRows).toHaveLength(2);
    expect(client.upsertOptions).toEqual({ onConflict: "date" });
  });

  it("does not call Supabase when there are no parsed rows", async () => {
    const client = fakeStockbeeClient([]);

    await syncStockbeeBreadthRows({ client, fetchedAt, rows: [], sourceUrl });

    expect(client.upsertedRows).toEqual([]);
  });
});

describe("readStockbeeBreadthRows", () => {
  it("maps persisted rows back to StockbeeBreadthRow in descending date order", async () => {
    const client = fakeStockbeeClient([
      {
        date: "2026-06-10",
        down_13_in_34_days: 11,
        down_25_month: 6,
        down_25_quarter: 4,
        down_4_percent: 2,
        down_50_month: 8,
        ratio_10_day: 1.2,
        ratio_5_day: 1.1,
        sp500: 7553.68,
        t2108: 39.31,
        universe_count: 6462,
        up_13_in_34_days: 10,
        up_25_month: 5,
        up_25_quarter: 3,
        up_4_percent: 1,
        up_50_month: 7,
      },
    ]);

    await expect(readStockbeeBreadthRows({ client })).resolves.toEqual([
      row({ date: "2026-06-10" }),
    ]);
    expect(client.orderCall).toEqual(["date", { ascending: false }]);
  });
});

describe("groupStockbeeBreadthRowsByYear", () => {
  it("groups rows into newest-first year buckets", () => {
    expect(
      groupStockbeeBreadthRowsByYear([
        row({ date: "2026-06-10" }),
        row({ date: "2025-12-31" }),
        row({ date: "2025-01-02" }),
      ]),
    ).toEqual([
      { rows: [row({ date: "2026-06-10" })], year: "2026" },
      { rows: [row({ date: "2025-12-31" }), row({ date: "2025-01-02" })], year: "2025" },
    ]);
  });
});

describe("selectedStockbeeBreadthYear", () => {
  it("uses a valid requested year or falls back to the newest year", () => {
    const groups = groupStockbeeBreadthRowsByYear([
      row({ date: "2026-06-10" }),
      row({ date: "2025-12-31" }),
    ]);

    expect(selectedStockbeeBreadthYear(groups, "2025")).toBe("2025");
    expect(selectedStockbeeBreadthYear(groups, "2024")).toBe("2026");
    expect(selectedStockbeeBreadthYear(groups, undefined)).toBe("2026");
  });
});

function row(overrides: Partial<StockbeeBreadthRow> = {}): StockbeeBreadthRow {
  return {
    date: "2026-06-10",
    down13In34Days: 11,
    down25Month: 6,
    down25Quarter: 4,
    down4Percent: 2,
    down50Month: 8,
    ratio10Day: 1.2,
    ratio5Day: 1.1,
    sp500: 7553.68,
    t2108: 39.31,
    universeCount: 6462,
    up13In34Days: 10,
    up25Month: 5,
    up25Quarter: 3,
    up4Percent: 1,
    up50Month: 7,
    ...overrides,
  };
}

function fakeStockbeeClient(storedRows: Record<string, unknown>[]) {
  const client = {
    orderCall: null as unknown,
    upsertedRows: [] as Record<string, unknown>[],
    upsertOptions: null as unknown,
    from(table: string) {
      expect(table).toBe("stockbee_breadth_rows");

      return {
        select: () => ({
          order: vi.fn((column, options) => {
            client.orderCall = [column, options];
            return Promise.resolve({ data: storedRows, error: null });
          }),
        }),
        upsert: vi.fn((rows, options) => {
          client.upsertedRows.push(...rows);
          client.upsertOptions = options;
          return Promise.resolve({ error: null });
        }),
      };
    },
  };

  return client;
}
```

- [ ] **Step 2: Run the store tests to verify they fail**

Run:

```bash
npm test -- src/lib/market-data/stockbee-breadth-store.test.ts
```

Expected: fail because `src/lib/market-data/stockbee-breadth-store.ts` does not exist.

- [ ] **Step 3: Implement the store helper**

Create `src/lib/market-data/stockbee-breadth-store.ts`:

```ts
import type { StockbeeBreadthRow } from "./breadth";

export type StockbeeBreadthYearGroup = {
  rows: StockbeeBreadthRow[];
  year: string;
};

type StockbeeBreadthClient = {
  from(table: "stockbee_breadth_rows"): {
    select(columns: "*"): {
      order(
        column: "date",
        options: { ascending: boolean },
      ): Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
    upsert(
      rows: Record<string, unknown>[],
      options: { onConflict: "date" },
    ): Promise<{ error: unknown }>;
  };
};

export function stockbeeBreadthUpsertPayload(
  row: StockbeeBreadthRow,
  sourceUrl: string,
  fetchedAt: Date,
) {
  const timestamp = fetchedAt.toISOString();

  return {
    date: row.date,
    down_13_in_34_days: row.down13In34Days,
    down_25_month: row.down25Month,
    down_25_quarter: row.down25Quarter,
    down_4_percent: row.down4Percent,
    down_50_month: row.down50Month,
    ratio_10_day: row.ratio10Day,
    ratio_5_day: row.ratio5Day,
    source_fetched_at: timestamp,
    source_url: sourceUrl,
    sp500: row.sp500,
    t2108: row.t2108,
    universe_count: row.universeCount,
    up_13_in_34_days: row.up13In34Days,
    up_25_month: row.up25Month,
    up_25_quarter: row.up25Quarter,
    up_4_percent: row.up4Percent,
    up_50_month: row.up50Month,
    updated_at: timestamp,
  };
}

export async function syncStockbeeBreadthRows(input: {
  client: unknown;
  fetchedAt: Date;
  rows: StockbeeBreadthRow[];
  sourceUrl: string;
}) {
  if (input.rows.length === 0) {
    return;
  }

  const client = input.client as StockbeeBreadthClient;
  const result = await client.from("stockbee_breadth_rows").upsert(
    input.rows.map((row) =>
      stockbeeBreadthUpsertPayload(row, input.sourceUrl, input.fetchedAt),
    ),
    { onConflict: "date" },
  );

  if (result.error) {
    throw result.error;
  }
}

export async function readStockbeeBreadthRows(input: { client: unknown }) {
  const client = input.client as StockbeeBreadthClient;
  const { data, error } = await client
    .from("stockbee_breadth_rows")
    .select("*")
    .order("date", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(stockbeeBreadthRowFromStoredRow);
}

export function groupStockbeeBreadthRowsByYear(rows: StockbeeBreadthRow[]) {
  const groups = new Map<string, StockbeeBreadthRow[]>();

  for (const row of rows) {
    const year = row.date.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), row]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, yearRows]) => ({
      rows: yearRows,
      year,
    }));
}

export function selectedStockbeeBreadthYear(
  groups: StockbeeBreadthYearGroup[],
  requestedYear: string | undefined,
) {
  if (requestedYear && groups.some((group) => group.year === requestedYear)) {
    return requestedYear;
  }

  return groups[0]?.year ?? null;
}

function stockbeeBreadthRowFromStoredRow(row: Record<string, unknown>): StockbeeBreadthRow {
  return {
    date: String(row.date),
    down13In34Days: numberOrZero(row.down_13_in_34_days),
    down25Month: numberOrZero(row.down_25_month),
    down25Quarter: numberOrZero(row.down_25_quarter),
    down4Percent: numberOrZero(row.down_4_percent),
    down50Month: numberOrZero(row.down_50_month),
    ratio10Day: numberOrZero(row.ratio_10_day),
    ratio5Day: numberOrZero(row.ratio_5_day),
    sp500: numberOrZero(row.sp500),
    t2108: numberOrZero(row.t2108),
    universeCount: numberOrZero(row.universe_count),
    up13In34Days: numberOrZero(row.up_13_in_34_days),
    up25Month: numberOrZero(row.up_25_month),
    up25Quarter: numberOrZero(row.up_25_quarter),
    up4Percent: numberOrZero(row.up_4_percent),
    up50Month: numberOrZero(row.up_50_month),
  };
}

function numberOrZero(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
```

- [ ] **Step 4: Run the store tests to verify they pass**

Run:

```bash
npm test -- src/lib/market-data/stockbee-breadth-store.test.ts
```

Expected: all tests in `stockbee-breadth-store.test.ts` pass.

- [ ] **Step 5: Commit the store helper**

Run:

```bash
git add src/lib/market-data/stockbee-breadth-store.ts src/lib/market-data/stockbee-breadth-store.test.ts
git commit -m "Add Stockbee breadth store helpers"
```

---

### Task 3: Add Stockbee History Loader Fallbacks

**Files:**
- Modify: `src/lib/market-data/stockbee-breadth-store.test.ts`
- Modify: `src/lib/market-data/stockbee-breadth-store.ts`

- [ ] **Step 1: Add failing loader tests**

Add this import to `src/lib/market-data/stockbee-breadth-store.test.ts`:

```ts
import { loadStockbeeBreadthHistory } from "./stockbee-breadth-store";
```

Because the file already imports from `./stockbee-breadth-store`, merge `loadStockbeeBreadthHistory` into the existing named import instead of adding a duplicate import.

Append these tests before the helper functions:

```ts
describe("loadStockbeeBreadthHistory", () => {
  it("syncs live rows, then renders persisted rows grouped by selected year", async () => {
    const persisted = [
      storedRow({ date: "2026-06-10" }),
      storedRow({ date: "2025-12-31" }),
    ];
    const client = fakeStockbeeClient(persisted);
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => csvForDates(["6/10/2026", "12/31/2025"]),
    });

    await expect(
      loadStockbeeBreadthHistory({
        client,
        fetcher,
        requestedYear: "2025",
        sourceUrl,
      }),
    ).resolves.toEqual({
      groups: [
        { rows: [row({ date: "2026-06-10" })], year: "2026" },
        { rows: [row({ date: "2025-12-31" })], year: "2025" },
      ],
      liveRows: [row({ date: "2026-06-10" }), row({ date: "2025-12-31" })],
      selectedRows: [row({ date: "2025-12-31" })],
      selectedYear: "2025",
      syncError: null,
    });
    expect(client.upsertedRows.map((item) => item.date)).toEqual(["2026-06-10", "2025-12-31"]);
  });

  it("falls back to persisted rows when live Stockbee fetch fails", async () => {
    const client = fakeStockbeeClient([storedRow({ date: "2026-06-10" })]);
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "",
    });

    const result = await loadStockbeeBreadthHistory({
      client,
      fetcher,
      requestedYear: undefined,
      sourceUrl,
    });

    expect(result.syncError).toBe("Stockbee Market Monitor request failed with 503");
    expect(result.selectedRows).toEqual([row({ date: "2026-06-10" })]);
    expect(client.upsertedRows).toEqual([]);
  });

  it("falls back to live rows when persisted read fails after a successful fetch", async () => {
    const client = fakeStockbeeClient([], { readError: new Error("database unavailable") });
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => csvForDates(["6/10/2026"]),
    });

    const result = await loadStockbeeBreadthHistory({
      client,
      fetcher,
      requestedYear: undefined,
      sourceUrl,
    });

    expect(result.syncError).toBe("Persisted Stockbee history unavailable: database unavailable");
    expect(result.selectedRows).toEqual([row({ date: "2026-06-10" })]);
  });
});
```

Replace the existing `fakeStockbeeClient` helper with this version:

```ts
function fakeStockbeeClient(
  storedRows: Record<string, unknown>[],
  options: { readError?: unknown } = {},
) {
  const client = {
    orderCall: null as unknown,
    upsertedRows: [] as Record<string, unknown>[],
    upsertOptions: null as unknown,
    from(table: string) {
      expect(table).toBe("stockbee_breadth_rows");

      return {
        select: () => ({
          order: vi.fn((column, orderOptions) => {
            client.orderCall = [column, orderOptions];
            return Promise.resolve({
              data: options.readError ? null : storedRows,
              error: options.readError ?? null,
            });
          }),
        }),
        upsert: vi.fn((rows, upsertOptions) => {
          client.upsertedRows.push(...rows);
          client.upsertOptions = upsertOptions;
          return Promise.resolve({ error: null });
        }),
      };
    },
  };

  return client;
}
```

Add these helpers after `row()`:

```ts
function storedRow(overrides: Partial<StockbeeBreadthRow> = {}) {
  const item = row(overrides);

  return {
    date: item.date,
    down_13_in_34_days: item.down13In34Days,
    down_25_month: item.down25Month,
    down_25_quarter: item.down25Quarter,
    down_4_percent: item.down4Percent,
    down_50_month: item.down50Month,
    ratio_10_day: item.ratio10Day,
    ratio_5_day: item.ratio5Day,
    sp500: item.sp500,
    t2108: item.t2108,
    universe_count: item.universeCount,
    up_13_in_34_days: item.up13In34Days,
    up_25_month: item.up25Month,
    up_25_quarter: item.up25Quarter,
    up_4_percent: item.up4Percent,
    up_50_month: item.up50Month,
  };
}

function csvForDates(dates: string[]) {
  return [
    "Date,Number of stocks up 4% plus today,Number of stocks down 4% plus today,5 day ratio,10 day  ratio ,Number of stocks up 25% plus in a quarter,Number of stocks down 25% + in a quarter,Number of stocks up 25% + in a month,Number of stocks down 25% + in a month,Number of stocks up 50% + in a month,Number of stocks down 50% + in a month,Number of stocks up 13% + in 34 days,Number of stocks down 13% + in 34 days, Worden Common stock universe,T2108 ,S&P",
    ...dates.map((date) => `${date},1,2,1.1,1.2,3,4,5,6,7,8,10,11,6462,39.31,"7,553.68"`),
  ].join("\n");
}
```

- [ ] **Step 2: Run the loader tests to verify they fail**

Run:

```bash
npm test -- src/lib/market-data/stockbee-breadth-store.test.ts
```

Expected: fail because `loadStockbeeBreadthHistory` is not exported.

- [ ] **Step 3: Implement the loader**

Add these imports to `src/lib/market-data/stockbee-breadth-store.ts`:

```ts
import {
  buildMarketBreadthSnapshot,
  parseStockbeeMarketMonitorCsv,
  STOCKBEE_MARKET_MONITOR_URL,
  type MarketBreadthSnapshot,
  type StockbeeBreadthRow,
} from "./breadth";
```

Remove the existing separate `import type { StockbeeBreadthRow } from "./breadth";`.

Add these types after `StockbeeBreadthYearGroup`:

```ts
type StockbeeFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type StockbeeBreadthHistory = {
  groups: StockbeeBreadthYearGroup[];
  liveRows: StockbeeBreadthRow[];
  selectedRows: StockbeeBreadthRow[];
  selectedYear: string | null;
  snapshot: MarketBreadthSnapshot;
  syncError: string | null;
};
```

Add this function before `stockbeeBreadthUpsertPayload`:

```ts
export async function loadStockbeeBreadthHistory(input: {
  client: unknown;
  fetcher?: StockbeeFetcher;
  requestedYear?: string;
  sourceUrl?: string;
}): Promise<StockbeeBreadthHistory> {
  const fetcher = input.fetcher ?? fetch;
  const sourceUrl = input.sourceUrl ?? STOCKBEE_MARKET_MONITOR_URL;
  let liveRows: StockbeeBreadthRow[] = [];
  let syncError: string | null = null;

  try {
    const response = await fetcher(sourceUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Stockbee Market Monitor request failed with ${response.status}`);
    }

    liveRows = parseStockbeeMarketMonitorCsv(await response.text());
    await syncStockbeeBreadthRows({
      client: input.client,
      fetchedAt: new Date(),
      rows: liveRows,
      sourceUrl,
    });
  } catch (error) {
    syncError = errorMessage(error);
  }

  let persistedRows: StockbeeBreadthRow[];

  try {
    persistedRows = await readStockbeeBreadthRows({ client: input.client });
  } catch (error) {
    persistedRows = liveRows;
    syncError = `Persisted Stockbee history unavailable: ${errorMessage(error)}`;
  }

  const sourceRows = persistedRows.length > 0 ? persistedRows : liveRows;
  const groups = groupStockbeeBreadthRowsByYear(sourceRows);
  const selectedYear = selectedStockbeeBreadthYear(groups, input.requestedYear);
  const selectedRows = groups.find((group) => group.year === selectedYear)?.rows ?? [];

  return {
    groups,
    liveRows,
    selectedRows,
    selectedYear,
    snapshot: buildMarketBreadthSnapshot(sourceRows),
    syncError,
  };
}
```

Add this helper near the bottom:

```ts
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 4: Run the loader tests to verify they pass**

Run:

```bash
npm test -- src/lib/market-data/stockbee-breadth-store.test.ts
```

Expected: all tests in `stockbee-breadth-store.test.ts` pass.

- [ ] **Step 5: Commit the loader fallback behavior**

Run:

```bash
git add src/lib/market-data/stockbee-breadth-store.ts src/lib/market-data/stockbee-breadth-store.test.ts
git commit -m "Add Stockbee breadth history loader"
```

---

### Task 4: Render Year Tabs on the Market Breadth Page

**Files:**
- Modify: `src/app/market-breadth/page.tsx`

- [ ] **Step 1: Update the page data imports and props**

In `src/app/market-breadth/page.tsx`, add this import:

```ts
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { loadStockbeeBreadthHistory, type StockbeeBreadthYearGroup } from "@/lib/market-data/stockbee-breadth-store";
```

Remove `getStockbeeMarketBreadth` from the `@/lib/market-data/breadth` import.

Change the page signature:

```tsx
export default async function MarketBreadthPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const requestedYear = firstParam(params.year);
  const [breadthResult, indexCards] = await Promise.all([
    loadBreadthHistory(requestedYear),
    loadMarketIndexCards(),
  ]);
```

- [ ] **Step 2: Replace the raw table call**

Replace:

```tsx
      <BreadthTable rows={breadthResult.snapshot.tableRows} />
```

With:

```tsx
      <BreadthTable
        groups={breadthResult.groups}
        rows={breadthResult.selectedRows}
        selectedYear={breadthResult.selectedYear}
      />
```

- [ ] **Step 3: Replace the page loader helper**

Replace `loadBreadthSnapshot()` with:

```ts
async function loadBreadthHistory(requestedYear: string | undefined) {
  const client = createSupabaseAdminClient();

  if (!client) {
    return {
      groups: [],
      selectedRows: [],
      selectedYear: null,
      snapshot: { latest: null, tableRows: [], chartRows: [] } satisfies MarketBreadthSnapshot,
      error: "Supabase service role is not configured, so Stockbee history cannot be persisted.",
    };
  }

  const history = await loadStockbeeBreadthHistory({
    client,
    requestedYear,
  });

  return {
    groups: history.groups,
    selectedRows: history.selectedRows,
    selectedYear: history.selectedYear,
    snapshot: history.snapshot,
    error: history.syncError,
  };
}
```

Add this helper near `errorMessage`:

```ts
function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
```

- [ ] **Step 4: Replace the table component**

Replace `function BreadthTable({ rows }: { rows: StockbeeBreadthRow[] })` with:

```tsx
function BreadthTable({
  groups,
  rows,
  selectedYear,
}: {
  groups: StockbeeBreadthYearGroup[];
  rows: StockbeeBreadthRow[];
  selectedYear: string | null;
}) {
  return (
    <section className="mt-4 rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Stockbee Market Monitor History</h2>
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <Link
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                group.year === selectedYear
                  ? "bg-cyan-300 text-zinc-950"
                  : "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1] hover:text-white"
              }`}
              href={`/market-breadth?year=${group.year}`}
              key={group.year}
            >
              {group.year}
            </Link>
          ))}
        </div>
      </div>
      <div className="mt-4 max-h-[720px] overflow-auto">
        <table className="w-full min-w-[1160px] border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 bg-[#0d1117] text-xs text-zinc-400">
            <tr>
              {[
                "Date",
                "Up 4%",
                "Down 4%",
                "5d Ratio",
                "10d Ratio",
                "Up 25% Q",
                "Dn 25% Q",
                "Up 25% M",
                "Dn 25% M",
                "Up 50% M",
                "Dn 50% M",
                "Up 13/34",
                "Dn 13/34",
                "Worden",
                "T2108",
                "S&P 500",
              ].map((heading) => (
                <th className="px-3 py-2 font-medium" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {rows.map((row) => (
              <tr className="border-t border-white/10" key={row.date}>
                <td className="px-3 py-2 text-zinc-400">{dateForTable(row.date)}</td>
                <HeatCell intent={row.up4Percent >= row.down4Percent ? "up" : "down"} value={row.up4Percent} />
                <HeatCell intent={row.down4Percent > row.up4Percent ? "down" : "up"} value={row.down4Percent} />
                <td className={ratioClass(row.ratio5Day)}>{formatNumber(row.ratio5Day, 2)}</td>
                <td className={ratioClass(row.ratio10Day)}>{formatNumber(row.ratio10Day, 2)}</td>
                <HeatCell intent={row.up25Quarter >= row.down25Quarter ? "up" : "down"} value={row.up25Quarter} />
                <HeatCell intent={row.down25Quarter > row.up25Quarter ? "down" : "up"} value={row.down25Quarter} />
                <HeatCell intent={row.up25Month >= row.down25Month ? "up" : "down"} value={row.up25Month} />
                <HeatCell intent={row.down25Month > row.up25Month ? "down" : "up"} value={row.down25Month} />
                <HeatCell intent={row.up50Month >= row.down50Month ? "up" : "down"} value={row.up50Month} />
                <HeatCell intent={row.down50Month > row.up50Month ? "down" : "up"} value={row.down50Month} />
                <HeatCell intent={row.up13In34Days >= row.down13In34Days ? "up" : "down"} value={row.up13In34Days} />
                <HeatCell intent={row.down13In34Days > row.up13In34Days ? "down" : "up"} value={row.down13In34Days} />
                <td className="px-3 py-2 text-right text-zinc-400">{formatNumber(row.universeCount, 0)}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{formatNumber(row.t2108, 1)}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{formatNumber(row.sp500, 2)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500" colSpan={16}>
                  No breadth rows are available right now.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run focused tests and lint**

Run:

```bash
npm test -- src/lib/market-data/stockbee-breadth-store.test.ts src/lib/market-data/breadth.test.ts
npm run lint
```

Expected: tests and lint pass.

- [ ] **Step 6: Commit the page update**

Run:

```bash
git add src/app/market-breadth/page.tsx
git commit -m "Show Stockbee breadth history by year"
```

---

### Task 5: Full Verification and Browser Smoke Test

**Files:**
- Modify only if useful: `docs/screenshots/market-breadth-page.png`

- [ ] **Step 1: Run the full local verification suite**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands exit successfully.

- [ ] **Step 2: Start the dev server**

Run:

```bash
npm run dev
```

Expected: Next.js starts on `http://localhost:3000` or reports another available local port.

- [ ] **Step 3: Smoke-test `/market-breadth` in the browser**

Open the local Market Breadth page and verify:

- The page is inside the authenticated app shell.
- The Stockbee warning is absent when live sync and persistence work, or visible when local Supabase/service role is not configured.
- The table heading says `Stockbee Market Monitor History`.
- Year tabs render when persisted or live rows exist.
- The newest year is selected by default.
- Clicking an older year tab updates the URL to `/market-breadth?year=<year>`.
- The selected year table scrolls vertically and keeps all existing Stockbee CSV columns.
- Charts still render from the latest persisted rows.

- [ ] **Step 4: Capture screenshot if the page renders meaningfully**

If local auth and data are available, update:

```text
docs/screenshots/market-breadth-page.png
```

Skip the screenshot update if the local environment cannot authenticate or cannot produce meaningful breadth rows.

- [ ] **Step 5: Commit the screenshot if updated**

Run only if the screenshot changed:

```bash
git add docs/screenshots/market-breadth-page.png
git commit -m "Update market breadth history screenshot"
```

---

## Self-Review Notes

- Spec coverage: the plan covers raw CSV row persistence, backfill via first page load, continued page-load sync, year tabs, selected year query string, fallback behavior, future chat-friendly row storage, RLS, CI inclusion, and browser verification.
- Placeholder scan: implementation steps include concrete file paths, function names, SQL, test code, page code, commands, and expected outcomes. The migration filename is intentionally matched by suffix because Supabase CLI generates migration timestamps.
- Type consistency: `StockbeeBreadthRow`, `StockbeeBreadthYearGroup`, `StockbeeBreadthHistory`, `syncStockbeeBreadthRows`, `readStockbeeBreadthRows`, `loadStockbeeBreadthHistory`, and `selectedStockbeeBreadthYear` are introduced before page use and reuse the same names throughout.
