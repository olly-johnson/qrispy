# Sector Breadth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authenticated `/sector-breadth` page that shows today’s common-stock performance by SIC-derived sector, industry, and stock, plus live breadth metrics from Massive market data.

**Architecture:** Store free SIC-derived classifications in Supabase, fetch live snapshots and active reference tickers through the existing Massive provider, and reuse the existing OHLCV cache for historical daily bars. Keep the page server-rendered for data loading and use a small client component only for sector/industry drilldown state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/RLS, Massive REST API, Vitest, Tailwind CSS, lucide-react.

---

## Preflight

- Start from an updated `main` branch and create a `codex/sector-breadth` branch before implementation.
- Leave unrelated untracked files such as `.codex-logs/` alone.
- Before editing Next.js page files, read the local Next 16 docs:

```powershell
Select-String -Path node_modules\next\dist\docs\01-app\01-getting-started\03-layouts-and-pages.md -Pattern "searchParams|Server Component" -Context 2,6
Select-String -Path node_modules\next\dist\docs\01-app\01-getting-started\06-fetching-data.md -Pattern "Server Components|database|fetch" -Context 2,6
```

Expected: confirm App Router pages can be async Server Components and server-side data access stays off the client.

## File Structure

- Modify `src/lib/supabase/schema.test.ts`: migration coverage for `stock_classifications`.
- Create `supabase/migrations/*_add_stock_classifications.sql`: classification cache table.
- Modify `src/lib/market-data/massive.ts`: add ticker detail fetch and exported numeric/path helpers only if needed.
- Modify `src/lib/market-data/massive.test.ts`: provider coverage for ticker details.
- Create `src/lib/market-data/market-universe.ts`: shared common-stock filtering and snapshot normalization used by gappers and sector breadth.
- Create `src/lib/market-data/market-universe.test.ts`: tests for shared universe/snapshot behavior.
- Modify `src/lib/market-data/gappers.ts`: use shared helpers without changing public `GappersRow` behavior.
- Create `src/lib/market-data/sector-classifications.ts`: Supabase read/upsert helpers, SIC-to-sector mapping, and classification payload conversion.
- Create `src/lib/market-data/sector-classifications.test.ts`: tests for SIC-derived mapping and store helpers.
- Create `src/lib/market-data/sector-breadth.ts`: sector/industry grouping and breadth metric calculations.
- Create `src/lib/market-data/sector-breadth.test.ts`: tests for grouping, live breadth, and historical metrics.
- Create `src/components/sector-breadth-view.tsx`: client drilldown for `Sector -> Industry -> Stocks`.
- Create `src/app/sector-breadth/page.tsx`: authenticated server page and loader.
- Modify `src/components/app-shell.tsx`: add nav link.
- Optionally update `docs/screenshots/sector-breadth-page.png` if local auth/data make a meaningful screenshot possible.

---

### Task 1: Add Stock Classifications Table

**Files:**
- Modify: `src/lib/supabase/schema.test.ts`
- Create: `supabase/migrations/*_add_stock_classifications.sql`

- [ ] **Step 1: Write the failing migration test**

Append this block to `src/lib/supabase/schema.test.ts`:

```ts
describe("Stock classifications migration", () => {
  it("adds SIC-derived sector classification cache with authenticated read access", () => {
    const migrationName = readdirSync(
      join(process.cwd(), "supabase", "migrations"),
    ).find((name) => name.endsWith("_add_stock_classifications.sql"));
    expect(migrationName).toBeDefined();

    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", migrationName!),
      "utf8",
    );

    expect(sql).toContain("create table public.stock_classifications");
    expect(sql).toContain("ticker text primary key");
    expect(sql).toContain("name text not null");
    expect(sql).toContain("sector text not null");
    expect(sql).toContain("industry text not null");
    expect(sql).toContain("source text not null");
    expect(sql).toContain("source_updated_at timestamptz not null");
    expect(sql).toContain("stock_classifications_sector_industry_idx");
    expect(sql).toContain(
      "alter table public.stock_classifications enable row level security",
    );
    expect(sql).toContain(
      "grant select on table public.stock_classifications to authenticated",
    );
    expect(sql).toContain(
      "grant select, insert, update, delete on table public.stock_classifications to service_role",
    );
    expect(sql).toContain("authenticated can select stock classifications");
    expect(sql).toContain("using (true)");
  });
});
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run:

```powershell
npm test -- src/lib/supabase/schema.test.ts
```

Expected: fail because no migration ending in `_add_stock_classifications.sql` exists.

- [ ] **Step 3: Create the migration file**

Run:

```powershell
npx supabase migration new add_stock_classifications
```

Expected: Supabase creates a timestamped migration file under `supabase/migrations`.

- [ ] **Step 4: Add the migration SQL**

Put this SQL in the generated migration:

```sql
create table public.stock_classifications (
  ticker text primary key,
  name text not null,
  sector text not null,
  industry text not null,
  source text not null,
  source_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stock_classifications_sector_industry_idx
  on public.stock_classifications (sector, industry, ticker);

alter table public.stock_classifications enable row level security;

grant select on table public.stock_classifications to authenticated;

grant select, insert, update, delete on table public.stock_classifications to service_role;

create policy "authenticated can select stock classifications"
on public.stock_classifications for select to authenticated
using (true);
```

- [ ] **Step 5: Run the migration test to verify it passes**

Run:

```powershell
npm test -- src/lib/supabase/schema.test.ts
```

Expected: all tests in `schema.test.ts` pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add src/lib/supabase/schema.test.ts supabase/migrations/*_add_stock_classifications.sql
git commit -m "Add stock classifications table"
```

---

### Task 2: Add Massive Ticker Details and Shared Market Universe Helpers

**Files:**
- Modify: `src/lib/market-data/massive.ts`
- Modify: `src/lib/market-data/massive.test.ts`
- Create: `src/lib/market-data/market-universe.ts`
- Create: `src/lib/market-data/market-universe.test.ts`
- Modify: `src/lib/market-data/gappers.ts`
- Modify: `src/lib/market-data/gappers.test.ts`

- [ ] **Step 1: Write failing Massive ticker detail test**

Add this test to `src/lib/market-data/massive.test.ts`:

```ts
it("fetches ticker details with SIC classification fields", async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      results: {
        active: true,
        name: "Acme Semiconductors",
        sic_code: "3674",
        sic_description: "Semiconductors and Related Devices",
        ticker: "ACME",
      },
    }),
  });
  const provider = new MassiveMarketDataProvider({
    apiKey: "massive-key",
    fetcher,
  });

  await expect(provider.getTickerDetails("acme")).resolves.toEqual({
    active: true,
    name: "Acme Semiconductors",
    sicCode: "3674",
    sicDescription: "Semiconductors and Related Devices",
    ticker: "ACME",
  });

  const url = new URL(fetcher.mock.calls[0][0]);
  expect(url.pathname).toBe("/v3/reference/tickers/ACME");
  expect(url.searchParams.get("apiKey")).toBe("massive-key");
  expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });
});
```

- [ ] **Step 2: Run the Massive test to verify it fails**

Run:

```powershell
npm test -- src/lib/market-data/massive.test.ts
```

Expected: fail because `getTickerDetails` does not exist.

- [ ] **Step 3: Implement ticker details**

In `src/lib/market-data/massive.ts`, add this exported type near the other Massive types:

```ts
export type MassiveTickerDetails = {
  active: boolean | null;
  name: string | null;
  sicCode: string | null;
  sicDescription: string | null;
  ticker: string;
};
```

Add this method inside `MassiveMarketDataProvider`:

```ts
async getTickerDetails(ticker: string): Promise<MassiveTickerDetails> {
  const symbol = ticker.toUpperCase();
  const url = new URL(`${this.baseUrl}/v3/reference/tickers/${symbol}`);
  url.searchParams.set("apiKey", this.apiKey);

  const response = await this.fetcher(url.toString(), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Massive ticker details request failed with ${response.status}`);
  }

  const payload = (await response.json()) as { results?: Record<string, unknown> };
  const row = payload.results ?? {};

  return {
    active: typeof row.active === "boolean" ? row.active : null,
    name: typeof row.name === "string" ? row.name : null,
    sicCode: typeof row.sic_code === "string" ? row.sic_code : null,
    sicDescription:
      typeof row.sic_description === "string" ? row.sic_description : null,
    ticker: String(row.ticker ?? symbol).toUpperCase(),
  };
}
```

- [ ] **Step 4: Run the Massive test to verify it passes**

Run:

```powershell
npm test -- src/lib/market-data/massive.test.ts
```

Expected: all Massive tests pass.

- [ ] **Step 5: Write failing shared universe tests**

Create `src/lib/market-data/market-universe.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildCommonStockUniverse,
  normalizeMarketSnapshotTicker,
} from "./market-universe";

describe("buildCommonStockUniverse", () => {
  it("keeps active US common stocks and excludes ETFs, funds, inactive rows, and OTC rows", () => {
    const universe = buildCommonStockUniverse([
      ticker("ACME", "Acme Corp", "CS", "stocks", "us", true),
      ticker("IETF", "Index ETF", "ETF", "stocks", "us", true),
      ticker("FUNDX", "Mutual Fund", "FUND", "stocks", "us", true),
      ticker("DEAD", "Inactive", "CS", "stocks", "us", false),
      ticker("OTCM", "OTC Name", "CS", "otc", "us", true),
      ticker("FOREIGN", "Foreign Name", "CS", "stocks", "global", true),
    ]);

    expect([...universe.values()]).toEqual([
      { name: "Acme Corp", symbol: "ACME" },
    ]);
  });
});

describe("normalizeMarketSnapshotTicker", () => {
  it("extracts current price, previous close, volume, and update time from Massive snapshot shapes", () => {
    expect(
      normalizeMarketSnapshotTicker({
        day: { c: 10.5, v: 100_000 },
        min: { c: 11 },
        prevDay: { c: 10 },
        ticker: "ACME",
        updated: 1_780_000_000_000,
      }),
    ).toEqual({
      lastUpdatedAt: "2026-05-31T10:13:20.000Z",
      price: 11,
      previousClose: 10,
      symbol: "ACME",
      volume: 100_000,
    });
  });

  it("returns null when price or previous close is missing", () => {
    expect(normalizeMarketSnapshotTicker({ ticker: "ACME" })).toBeNull();
  });
});

function ticker(
  tickerSymbol: string,
  name: string,
  type: string,
  market: string,
  locale: string,
  active: boolean,
) {
  return {
    active,
    locale,
    market,
    name,
    ticker: tickerSymbol,
    type,
  };
}
```

- [ ] **Step 6: Run shared universe tests to verify they fail**

Run:

```powershell
npm test -- src/lib/market-data/market-universe.test.ts
```

Expected: fail because `market-universe.ts` does not exist.

- [ ] **Step 7: Implement shared universe helpers**

Create `src/lib/market-data/market-universe.ts`:

```ts
import type {
  MassiveReferenceTicker,
  MassiveSnapshotTicker,
} from "./massive";

export type CommonStockUniverseEntry = {
  name: string;
  symbol: string;
};

export type NormalizedMarketSnapshot = {
  lastUpdatedAt: string | null;
  price: number;
  previousClose: number;
  symbol: string;
  volume: number;
};

export function buildCommonStockUniverse(rows: MassiveReferenceTicker[]) {
  const universe = new Map<string, CommonStockUniverseEntry>();

  for (const item of rows) {
    const symbol = String(item.ticker ?? "").toUpperCase();
    const type = String(item.type ?? "").toUpperCase();
    const market = String(item.market ?? "").toLowerCase();
    const locale = String(item.locale ?? "").toLowerCase();

    if (!symbol || item.active === false || locale !== "us" || market !== "stocks") {
      continue;
    }
    if (type !== "CS") {
      continue;
    }

    universe.set(symbol, { name: item.name ?? symbol, symbol });
  }

  return universe;
}

export function normalizeMarketSnapshotTicker(
  snapshot: MassiveSnapshotTicker,
): NormalizedMarketSnapshot | null {
  const symbol = String(snapshot.ticker ?? "").toUpperCase();
  const price = firstFiniteNumber([
    getPath(snapshot, ["fmv"]),
    getPath(snapshot, ["lastTrade", "p"]),
    getPath(snapshot, ["last_trade", "price"]),
    getPath(snapshot, ["min", "c"]),
    getPath(snapshot, ["day", "c"]),
  ]);
  const previousClose = firstFiniteNumber([
    getPath(snapshot, ["prevDay", "c"]),
    getPath(snapshot, ["session", "previous_close"]),
  ]);

  if (!symbol || price == null || previousClose == null || previousClose <= 0) {
    return null;
  }

  const volume =
    firstFiniteNumber([
      getPath(snapshot, ["day", "v"]),
      getPath(snapshot, ["session", "volume"]),
    ]) ?? 0;
  const updated = firstFiniteNumber([snapshot.updated, snapshot.last_updated]);

  return {
    lastUpdatedAt: updated == null ? null : timestampToIso(updated),
    price,
    previousClose,
    symbol,
    volume,
  };
}

function getPath(value: Record<string, unknown>, path: string[]) {
  let current: unknown = value;

  for (const key of path) {
    if (!current || typeof current !== "object") {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

function firstFiniteNumber(values: unknown[]) {
  for (const value of values) {
    const parsed = numberFrom(value);

    if (parsed != null) {
      return parsed;
    }
  }

  return null;
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function timestampToIso(value: number) {
  const milliseconds =
    value > 10_000_000_000_000 ? Math.floor(value / 1_000_000) : value;

  return new Date(milliseconds).toISOString();
}
```

- [ ] **Step 8: Run shared universe tests to verify they pass**

Run:

```powershell
npm test -- src/lib/market-data/market-universe.test.ts
```

Expected: all shared universe tests pass.

- [ ] **Step 9: Refactor gappers to use shared helpers**

In `src/lib/market-data/gappers.ts`, import shared helpers:

```ts
import {
  buildCommonStockUniverse,
  normalizeMarketSnapshotTicker,
} from "./market-universe";
```

Replace the internal common-stock part of `buildUniverse` by using `buildCommonStockUniverse(references)` for common stocks, then add ETFs locally:

```ts
function buildUniverse(references: MassiveReferenceTicker[]) {
  const universe = new Map<string, { name: string; securityType: GappersSecurityType }>();

  for (const item of buildCommonStockUniverse(references).values()) {
    universe.set(item.symbol, { name: item.name, securityType: "Stock" });
  }

  for (const item of references) {
    const symbol = String(item.ticker ?? "").toUpperCase();
    const type = String(item.type ?? "").toUpperCase();
    const market = String(item.market ?? "").toLowerCase();
    const locale = String(item.locale ?? "").toLowerCase();

    if (!symbol || item.active === false || locale !== "us" || market !== "stocks") {
      continue;
    }
    if (type === "ETF") {
      universe.set(symbol, { name: item.name ?? symbol, securityType: "ETF" });
    }
  }

  return universe;
}
```

In `normalizeCandidate`, replace duplicated price/previous-close/update extraction with `normalizeMarketSnapshotTicker(snapshot)`, while preserving the existing volume fallback logic for extended-hours gappers.

- [ ] **Step 10: Run gappers and shared tests**

Run:

```powershell
npm test -- src/lib/market-data/gappers.test.ts src/lib/market-data/market-universe.test.ts src/lib/market-data/massive.test.ts
```

Expected: all tests pass with unchanged gappers behavior.

- [ ] **Step 11: Commit**

Run:

```powershell
git add src/lib/market-data/massive.ts src/lib/market-data/massive.test.ts src/lib/market-data/market-universe.ts src/lib/market-data/market-universe.test.ts src/lib/market-data/gappers.ts src/lib/market-data/gappers.test.ts
git commit -m "Share Massive market universe helpers"
```

---

### Task 3: Add SIC-Derived Classification Store

**Files:**
- Create: `src/lib/market-data/sector-classifications.ts`
- Create: `src/lib/market-data/sector-classifications.test.ts`

- [ ] **Step 1: Write failing classification tests**

Create `src/lib/market-data/sector-classifications.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  classificationFromTickerDetails,
  readStockClassifications,
  sectorFromSicCode,
  stockClassificationUpsertPayload,
  syncStockClassifications,
} from "./sector-classifications";

const fetchedAt = new Date("2026-06-10T12:00:00.000Z");

describe("sectorFromSicCode", () => {
  it("maps SIC codes into familiar sector labels", () => {
    expect(sectorFromSicCode("1311")).toBe("Energy");
    expect(sectorFromSicCode("2834")).toBe("Health Care");
    expect(sectorFromSicCode("3674")).toBe("Information Technology");
    expect(sectorFromSicCode("6021")).toBe("Financials");
    expect(sectorFromSicCode("6798")).toBe("Real Estate");
    expect(sectorFromSicCode("4911")).toBe("Utilities");
  });

  it("returns null for unsupported or missing SIC codes", () => {
    expect(sectorFromSicCode(null)).toBeNull();
    expect(sectorFromSicCode("9999")).toBeNull();
  });
});

describe("classificationFromTickerDetails", () => {
  it("builds an SIC-derived classification from ticker details", () => {
    expect(
      classificationFromTickerDetails({
        active: true,
        name: "Acme Semiconductors",
        sicCode: "3674",
        sicDescription: "Semiconductors and Related Devices",
        ticker: "acme",
      }),
    ).toEqual({
      industry: "Semiconductors and Related Devices",
      name: "Acme Semiconductors",
      sector: "Information Technology",
      source: "sic-derived",
      ticker: "ACME",
    });
  });

  it("skips inactive or unclassified details", () => {
    expect(
      classificationFromTickerDetails({
        active: false,
        name: "Inactive Corp",
        sicCode: "3674",
        sicDescription: "Semiconductors and Related Devices",
        ticker: "DEAD",
      }),
    ).toBeNull();
    expect(
      classificationFromTickerDetails({
        active: true,
        name: "Unknown Corp",
        sicCode: null,
        sicDescription: null,
        ticker: "UNKN",
      }),
    ).toBeNull();
  });
});

describe("stockClassificationUpsertPayload", () => {
  it("maps classification fields to Supabase columns", () => {
    expect(
      stockClassificationUpsertPayload(
        {
          industry: "Semiconductors",
          name: "Acme Corp",
          sector: "Information Technology",
          source: "sic-derived",
          ticker: "ACME",
        },
        fetchedAt,
      ),
    ).toEqual({
      industry: "Semiconductors",
      name: "Acme Corp",
      sector: "Information Technology",
      source: "sic-derived",
      source_updated_at: "2026-06-10T12:00:00.000Z",
      ticker: "ACME",
      updated_at: "2026-06-10T12:00:00.000Z",
    });
  });
});

describe("stock classification store", () => {
  it("upserts classifications by ticker and reads them back", async () => {
    const client = fakeClassificationClient([
      {
        industry: "Semiconductors",
        name: "Acme Corp",
        sector: "Information Technology",
        source: "sic-derived",
        ticker: "ACME",
      },
    ]);

    await syncStockClassifications({
      classifications: [
        {
          industry: "Banks",
          name: "Bank Corp",
          sector: "Financials",
          source: "sic-derived",
          ticker: "BANK",
        },
      ],
      client,
      fetchedAt,
    });

    expect(client.upsertedRows).toEqual([
      expect.objectContaining({ sector: "Financials", ticker: "BANK" }),
    ]);
    expect(client.upsertOptions).toEqual({ onConflict: "ticker" });
    await expect(readStockClassifications({ client })).resolves.toEqual([
      {
        industry: "Semiconductors",
        name: "Acme Corp",
        sector: "Information Technology",
        source: "sic-derived",
        ticker: "ACME",
      },
    ]);
  });
});

function fakeClassificationClient(storedRows: Record<string, unknown>[]) {
  const client = {
    upsertOptions: null as unknown,
    upsertedRows: [] as Record<string, unknown>[],
    from(table: string) {
      expect(table).toBe("stock_classifications");

      return {
        select: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: storedRows, error: null })),
        })),
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

- [ ] **Step 2: Run classification tests to verify they fail**

Run:

```powershell
npm test -- src/lib/market-data/sector-classifications.test.ts
```

Expected: fail because `sector-classifications.ts` does not exist.

- [ ] **Step 3: Implement classification store and SIC mapping**

Create `src/lib/market-data/sector-classifications.ts`:

```ts
import type { MassiveTickerDetails } from "./massive";

export type StockClassification = {
  industry: string;
  name: string;
  sector: SectorName;
  source: "sic-derived";
  ticker: string;
};

export type SectorName =
  | "Communication Services"
  | "Consumer Discretionary"
  | "Consumer Staples"
  | "Energy"
  | "Financials"
  | "Health Care"
  | "Industrials"
  | "Information Technology"
  | "Materials"
  | "Real Estate"
  | "Utilities";

type ClassificationClient = {
  from(table: "stock_classifications"): {
    select(columns: "*"): {
      order(
        column: "ticker",
        options: { ascending: boolean },
      ): Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
    upsert(
      rows: Record<string, unknown>[],
      options: { onConflict: "ticker" },
    ): Promise<{ error: unknown }>;
  };
};

export function classificationFromTickerDetails(
  details: MassiveTickerDetails,
): StockClassification | null {
  if (details.active === false) {
    return null;
  }

  const ticker = details.ticker.toUpperCase();
  const sector = sectorFromSicCode(details.sicCode);
  const industry = normalizeIndustry(details.sicDescription);
  const name = details.name?.trim();

  if (!ticker || !sector || !industry || !name) {
    return null;
  }

  return {
    industry,
    name,
    sector,
    source: "sic-derived",
    ticker,
  };
}

export function sectorFromSicCode(code: string | null): SectorName | null {
  const sic = Number(code);

  if (!Number.isInteger(sic)) {
    return null;
  }
  if (sic >= 1000 && sic <= 1499) {
    return "Energy";
  }
  if (sic >= 1500 && sic <= 1799) {
    return "Industrials";
  }
  if (sic >= 2000 && sic <= 2199) {
    return "Consumer Staples";
  }
  if (sic >= 2200 && sic <= 2399) {
    return "Consumer Discretionary";
  }
  if (sic >= 2400 && sic <= 2499) {
    return "Materials";
  }
  if (sic >= 2500 && sic <= 2599) {
    return "Consumer Discretionary";
  }
  if (sic >= 2600 && sic <= 2699) {
    return "Materials";
  }
  if (sic >= 2700 && sic <= 2799) {
    return "Communication Services";
  }
  if (sic >= 2800 && sic <= 2899) {
    return "Health Care";
  }
  if (sic >= 2900 && sic <= 2999) {
    return "Energy";
  }
  if (sic >= 3000 && sic <= 3499) {
    return "Materials";
  }
  if (sic >= 3500 && sic <= 3599) {
    return "Industrials";
  }
  if (sic >= 3600 && sic <= 3699) {
    return "Information Technology";
  }
  if (sic >= 3700 && sic <= 3799) {
    return "Industrials";
  }
  if (sic >= 3800 && sic <= 3899) {
    return "Health Care";
  }
  if (sic >= 3900 && sic <= 3999) {
    return "Consumer Discretionary";
  }
  if (sic >= 4000 && sic <= 4899) {
    return "Industrials";
  }
  if (sic >= 4900 && sic <= 4999) {
    return "Utilities";
  }
  if (sic >= 5000 && sic <= 5199) {
    return "Industrials";
  }
  if (sic >= 5200 && sic <= 5999) {
    return "Consumer Discretionary";
  }
  if (sic >= 6000 && sic <= 6499) {
    return "Financials";
  }
  if (sic >= 6500 && sic <= 6799) {
    return "Real Estate";
  }
  if (sic >= 7000 && sic <= 7369) {
    return "Consumer Discretionary";
  }
  if (sic >= 7370 && sic <= 7379) {
    return "Information Technology";
  }
  if (sic >= 7380 && sic <= 7999) {
    return "Industrials";
  }
  if (sic >= 8000 && sic <= 8099) {
    return "Health Care";
  }
  if (sic >= 8100 && sic <= 8999) {
    return "Industrials";
  }

  return null;
}

export function stockClassificationUpsertPayload(
  classification: StockClassification,
  fetchedAt: Date,
) {
  const timestamp = fetchedAt.toISOString();

  return {
    industry: classification.industry,
    name: classification.name,
    sector: classification.sector,
    source: classification.source,
    source_updated_at: timestamp,
    ticker: classification.ticker,
    updated_at: timestamp,
  };
}

export async function syncStockClassifications(input: {
  classifications: StockClassification[];
  client: unknown;
  fetchedAt: Date;
}) {
  if (input.classifications.length === 0) {
    return;
  }

  const client = input.client as ClassificationClient;
  const result = await client.from("stock_classifications").upsert(
    input.classifications.map((classification) =>
      stockClassificationUpsertPayload(classification, input.fetchedAt),
    ),
    { onConflict: "ticker" },
  );

  if (result.error) {
    throw result.error;
  }
}

export async function readStockClassifications(input: { client: unknown }) {
  const client = input.client as ClassificationClient;
  const { data, error } = await client
    .from("stock_classifications")
    .select("*")
    .order("ticker", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(classificationFromStoredRow);
}

function classificationFromStoredRow(
  row: Record<string, unknown>,
): StockClassification {
  return {
    industry: String(row.industry),
    name: String(row.name),
    sector: String(row.sector) as SectorName,
    source: "sic-derived",
    ticker: String(row.ticker).toUpperCase(),
  };
}

function normalizeIndustry(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");

  return normalized || null;
}
```

- [ ] **Step 4: Run classification tests to verify they pass**

Run:

```powershell
npm test -- src/lib/market-data/sector-classifications.test.ts
```

Expected: all classification tests pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/market-data/sector-classifications.ts src/lib/market-data/sector-classifications.test.ts
git commit -m "Add SIC-derived stock classifications"
```

---

### Task 4: Add Sector Breadth Calculations

**Files:**
- Create: `src/lib/market-data/sector-breadth.ts`
- Create: `src/lib/market-data/sector-breadth.test.ts`

- [ ] **Step 1: Write failing sector breadth tests**

Create `src/lib/market-data/sector-breadth.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  buildSectorBreadthSnapshot,
  calculateHistoricalBreadthMetrics,
} from "./sector-breadth";
import type { StockClassification } from "./sector-classifications";
import type { NormalizedMarketSnapshot } from "./market-universe";
import type { OhlcvBar } from "./types";

describe("buildSectorBreadthSnapshot", () => {
  it("groups mapped common stocks into sectors, industries, and ordered stocks", () => {
    const snapshot = buildSectorBreadthSnapshot({
      classifications: [
        classification("ACME", "Acme Semis", "Information Technology", "Semiconductors"),
        classification("SOFT", "Soft Co", "Information Technology", "Software"),
        classification("BANK", "Bank Co", "Financials", "Banks"),
      ],
      historicalMetrics: {
        down13In34Days: 1,
        ratio10Day: 1.1,
        ratio5Day: 1.4,
        t2108: 66.67,
        t2108Covered: 3,
        up13In34Days: 1,
      },
      loadedAt: "2026-06-10T15:00:00.000Z",
      snapshots: [
        marketSnapshot("ACME", 110, 100, 100_000),
        marketSnapshot("SOFT", 95, 100, 50_000),
        marketSnapshot("BANK", 100, 100, 25_000),
        marketSnapshot("MISS", 120, 100, 20_000),
      ],
      totalCommonStocks: 4,
    });

    expect(snapshot.coverage).toEqual({
      mapped: 3,
      totalCommonStocks: 4,
      unmapped: 1,
      withLiveSnapshot: 3,
    });
    expect(snapshot.liveBreadth).toEqual({
      down4Percent: 1,
      flat: 1,
      ratio10Day: 1.1,
      ratio5Day: 1.4,
      red: 1,
      t2108: 66.67,
      t2108Covered: 3,
      up13In34Days: 1,
      down13In34Days: 1,
      up4Percent: 1,
      green: 1,
    });
    expect(snapshot.sectors.map((sector) => sector.name)).toEqual([
      "Information Technology",
      "Financials",
    ]);
    expect(snapshot.sectors[0]).toEqual(
      expect.objectContaining({
        averageTodayPercent: 2.5,
        down: 1,
        flat: 0,
        medianTodayPercent: 2.5,
        name: "Information Technology",
        up: 1,
      }),
    );
    expect(snapshot.sectors[0].industries[0].stocks[0]).toEqual(
      expect.objectContaining({ symbol: "ACME", todayPercent: 10 }),
    );
  });
});

describe("calculateHistoricalBreadthMetrics", () => {
  it("calculates T2108, 13-in-34 counts, and 5/10 day up-down ratios", () => {
    const metrics = calculateHistoricalBreadthMetrics({
      barsBySymbol: new Map([
        ["ACME", bars("ACME", 100, 150)],
        ["SOFT", bars("SOFT", 100, 80)],
        ["FLAT", bars("FLAT", 100, 101)],
      ]),
      todayDown4Percent: 1,
      todayUp4Percent: 2,
    });

    expect(metrics).toEqual({
      down13In34Days: 1,
      ratio10Day: expect.any(Number),
      ratio5Day: expect.any(Number),
      t2108: 66.67,
      t2108Covered: 3,
      up13In34Days: 1,
    });
    expect(metrics.ratio5Day).toBeGreaterThan(0);
    expect(metrics.ratio10Day).toBeGreaterThan(0);
  });
});

function classification(
  ticker: string,
  name: string,
  sector: StockClassification["sector"],
  industry: string,
): StockClassification {
  return {
    industry,
    name,
    sector,
    source: "sic-derived",
    ticker,
  };
}

function marketSnapshot(
  symbol: string,
  price: number,
  previousClose: number,
  volume: number,
): NormalizedMarketSnapshot {
  return {
    lastUpdatedAt: "2026-06-10T15:00:00.000Z",
    price,
    previousClose,
    symbol,
    volume,
  };
}

function bars(symbol: string, firstClose: number, lastClose: number): OhlcvBar[] {
  return Array.from({ length: 45 }, (_, index) => {
    const close =
      index === 0
        ? firstClose
        : index === 44
          ? lastClose
          : firstClose + index;

    return {
      adjusted: true,
      barStartAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      close,
      high: close,
      low: close,
      open: close,
      provider: "test",
      rawPayload: {},
      symbol,
      timeframe: "1d",
      volume: 1,
    };
  });
}
```

- [ ] **Step 2: Run sector breadth tests to verify they fail**

Run:

```powershell
npm test -- src/lib/market-data/sector-breadth.test.ts
```

Expected: fail because `sector-breadth.ts` does not exist.

- [ ] **Step 3: Implement sector breadth calculations**

Create `src/lib/market-data/sector-breadth.ts` with these exports:

```ts
import type { NormalizedMarketSnapshot } from "./market-universe";
import type {
  SectorName,
  StockClassification,
} from "./sector-classifications";
import type { OhlcvBar } from "./types";

export type SectorBreadthStock = {
  lastUpdatedAt: string | null;
  name: string;
  price: number;
  symbol: string;
  todayPercent: number;
  volume: number;
};

export type SectorBreadthIndustry = {
  averageTodayPercent: number;
  down: number;
  flat: number;
  medianTodayPercent: number;
  name: string;
  stocks: SectorBreadthStock[];
  up: number;
};

export type SectorBreadthSector = {
  averageTodayPercent: number;
  down: number;
  flat: number;
  industries: SectorBreadthIndustry[];
  medianTodayPercent: number;
  name: SectorName;
  stocks: SectorBreadthStock[];
  up: number;
};

export type HistoricalBreadthMetrics = {
  down13In34Days: number;
  ratio10Day: number | null;
  ratio5Day: number | null;
  t2108: number | null;
  t2108Covered: number;
  up13In34Days: number;
};

export type SectorBreadthSnapshot = {
  coverage: {
    mapped: number;
    totalCommonStocks: number;
    unmapped: number;
    withLiveSnapshot: number;
  };
  liveBreadth: {
    down13In34Days: number;
    down4Percent: number;
    flat: number;
    green: number;
    ratio10Day: number | null;
    ratio5Day: number | null;
    red: number;
    t2108: number | null;
    t2108Covered: number;
    up13In34Days: number;
    up4Percent: number;
  };
  loadedAt: string;
  sectors: SectorBreadthSector[];
};

export function buildSectorBreadthSnapshot(input: {
  classifications: StockClassification[];
  historicalMetrics: HistoricalBreadthMetrics;
  loadedAt: string;
  snapshots: NormalizedMarketSnapshot[];
  totalCommonStocks: number;
}): SectorBreadthSnapshot {
  const classificationByTicker = new Map(
    input.classifications.map((classification) => [
      classification.ticker.toUpperCase(),
      classification,
    ]),
  );
  const stocks: Array<SectorBreadthStock & { industry: string; sector: SectorName }> = [];

  for (const snapshot of input.snapshots) {
    const classification = classificationByTicker.get(snapshot.symbol);

    if (!classification) {
      continue;
    }

    stocks.push({
      industry: classification.industry,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      name: classification.name,
      price: round(snapshot.price, 2),
      sector: classification.sector,
      symbol: snapshot.symbol,
      todayPercent: round(
        ((snapshot.price - snapshot.previousClose) / snapshot.previousClose) * 100,
        2,
      ),
      volume: snapshot.volume,
    });
  }

  const sectors = groupSectors(stocks);
  const liveCounts = participationCounts(stocks);

  return {
    coverage: {
      mapped: input.classifications.length,
      totalCommonStocks: input.totalCommonStocks,
      unmapped: Math.max(0, input.totalCommonStocks - input.classifications.length),
      withLiveSnapshot: stocks.length,
    },
    liveBreadth: {
      down13In34Days: input.historicalMetrics.down13In34Days,
      down4Percent: stocks.filter((stock) => stock.todayPercent <= -4).length,
      flat: liveCounts.flat,
      green: liveCounts.up,
      ratio10Day: input.historicalMetrics.ratio10Day,
      ratio5Day: input.historicalMetrics.ratio5Day,
      red: liveCounts.down,
      t2108: input.historicalMetrics.t2108,
      t2108Covered: input.historicalMetrics.t2108Covered,
      up13In34Days: input.historicalMetrics.up13In34Days,
      up4Percent: stocks.filter((stock) => stock.todayPercent >= 4).length,
    },
    loadedAt: input.loadedAt,
    sectors,
  };
}

export function calculateHistoricalBreadthMetrics(input: {
  barsBySymbol: Map<string, OhlcvBar[]>;
  todayDown4Percent: number;
  todayUp4Percent: number;
}): HistoricalBreadthMetrics {
  let above40 = 0;
  let t2108Covered = 0;
  let up13In34Days = 0;
  let down13In34Days = 0;
  const dailyCounts = new Map<string, { down4: number; up4: number }>();

  for (const bars of input.barsBySymbol.values()) {
    const sorted = bars
      .filter((bar) => Number.isFinite(bar.close))
      .sort((left, right) => left.barStartAt.localeCompare(right.barStartAt));
    const latest = sorted.at(-1);

    if (!latest) {
      continue;
    }

    const sma40 = averageTail(
      sorted.slice(0, -1).map((bar) => bar.close).concat(latest.close),
      40,
    );

    if (sma40 != null) {
      t2108Covered += 1;
      if (latest.close > sma40) {
        above40 += 1;
      }
    }

    const anchor34 = sorted.at(-35);
    if (anchor34 && anchor34.close > 0) {
      const move = ((latest.close - anchor34.close) / anchor34.close) * 100;
      if (move >= 13) {
        up13In34Days += 1;
      }
      if (move <= -13) {
        down13In34Days += 1;
      }
    }

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (!previous || !current || previous.close <= 0) {
        continue;
      }
      const move = ((current.close - previous.close) / previous.close) * 100;
      const date = current.barStartAt.slice(0, 10);
      const counts = dailyCounts.get(date) ?? { down4: 0, up4: 0 };
      if (move >= 4) {
        counts.up4 += 1;
      }
      if (move <= -4) {
        counts.down4 += 1;
      }
      dailyCounts.set(date, counts);
    }
  }

  const orderedCounts = [...dailyCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, counts]) => counts);
  const withToday = [
    ...orderedCounts,
    { down4: input.todayDown4Percent, up4: input.todayUp4Percent },
  ];

  return {
    down13In34Days,
    ratio10Day: ratioForTail(withToday, 10),
    ratio5Day: ratioForTail(withToday, 5),
    t2108:
      t2108Covered === 0 ? null : round((above40 / t2108Covered) * 100, 2),
    t2108Covered,
    up13In34Days,
  };
}

function groupSectors(
  stocks: Array<SectorBreadthStock & { industry: string; sector: SectorName }>,
) {
  const bySector = new Map<SectorName, typeof stocks>();

  for (const stock of stocks) {
    bySector.set(stock.sector, [...(bySector.get(stock.sector) ?? []), stock]);
  }

  return [...bySector.entries()]
    .map(([name, sectorStocks]) => {
      const byIndustry = new Map<string, typeof stocks>();
      for (const stock of sectorStocks) {
        byIndustry.set(stock.industry, [
          ...(byIndustry.get(stock.industry) ?? []),
          stock,
        ]);
      }
      const industries = [...byIndustry.entries()]
        .map(([industryName, industryStocks]) =>
          summarizeIndustry(industryName, industryStocks),
        )
        .sort((left, right) => right.averageTodayPercent - left.averageTodayPercent);
      const summary = summarizeStocks(sectorStocks);

      return {
        ...summary,
        industries,
        name,
        stocks: sortStocks(sectorStocks),
      };
    })
    .sort((left, right) => right.averageTodayPercent - left.averageTodayPercent);
}

function summarizeIndustry(
  name: string,
  stocks: Array<SectorBreadthStock & { industry: string; sector: SectorName }>,
): SectorBreadthIndustry {
  return {
    ...summarizeStocks(stocks),
    name,
    stocks: sortStocks(stocks),
  };
}

function summarizeStocks(stocks: SectorBreadthStock[]) {
  const counts = participationCounts(stocks);
  const values = stocks.map((stock) => stock.todayPercent);

  return {
    averageTodayPercent: round(average(values), 2),
    down: counts.down,
    flat: counts.flat,
    medianTodayPercent: round(median(values), 2),
    up: counts.up,
  };
}

function participationCounts(stocks: SectorBreadthStock[]) {
  return stocks.reduce(
    (counts, stock) => {
      if (stock.todayPercent > 0) {
        counts.up += 1;
      } else if (stock.todayPercent < 0) {
        counts.down += 1;
      } else {
        counts.flat += 1;
      }
      return counts;
    },
    { down: 0, flat: 0, up: 0 },
  );
}

function sortStocks<T extends SectorBreadthStock>(stocks: T[]) {
  return [...stocks].sort(
    (left, right) =>
      right.todayPercent - left.todayPercent || left.symbol.localeCompare(right.symbol),
  );
}

function ratioForTail(values: Array<{ down4: number; up4: number }>, period: number) {
  if (values.length < period) {
    return null;
  }

  const tail = values.slice(-period);
  const up = tail.reduce((sum, item) => sum + item.up4, 0);
  const down = tail.reduce((sum, item) => sum + item.down4, 0);

  if (down === 0) {
    return up === 0 ? null : round(up, 2);
  }

  return round(up / down, 2);
}

function averageTail(values: number[], period: number) {
  if (values.length < period) {
    return null;
  }

  return average(values.slice(-period));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
```

- [ ] **Step 4: Run sector breadth tests to verify they pass**

Run:

```powershell
npm test -- src/lib/market-data/sector-breadth.test.ts
```

Expected: all sector breadth tests pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/lib/market-data/sector-breadth.ts src/lib/market-data/sector-breadth.test.ts
git commit -m "Add sector breadth calculations"
```

---

### Task 5: Add Sector Breadth Page Loader and UI

**Files:**
- Create: `src/components/sector-breadth-view.tsx`
- Create: `src/app/sector-breadth/page.tsx`
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Create the client drilldown component**

Create `src/components/sector-breadth-view.tsx`:

```tsx
"use client";

import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatDateTime } from "@/components/format";
import type { SectorBreadthSnapshot } from "@/lib/market-data/sector-breadth";

export function SectorBreadthView({
  error,
  snapshot,
}: {
  error: string | null;
  snapshot: SectorBreadthSnapshot | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openIndustries, setOpenIndustries] = useState<Set<string>>(() => new Set());
  const [openSectors, setOpenSectors] = useState<Set<string>>(() => new Set());

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sector Breadth</h1>
          <p className="mt-1 text-sm text-zinc-500">
            SIC-derived common-stock sectors
            {snapshot ? ` / Last updated: ${formatDateTime(snapshot.loadedAt)}` : ""}
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60"
          disabled={isPending}
          onClick={refresh}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <section className="mt-6 rounded-md border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm text-amber-100">
          {error}
        </section>
      ) : null}

      {snapshot ? (
        <>
          <BreadthCards snapshot={snapshot} />
          <CoverageNote snapshot={snapshot} />
          <section className="mt-4 overflow-hidden rounded-md border border-white/10 bg-white/[0.04]">
            {snapshot.sectors.map((sector) => {
              const sectorOpen = openSectors.has(sector.name);

              return (
                <div className="border-b border-white/10 last:border-b-0" key={sector.name}>
                  <button
                    className="grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-4 text-left transition hover:bg-white/[0.04] md:grid-cols-[1fr_8rem_8rem_8rem_auto]"
                    onClick={() =>
                      setOpenSectors((current) => toggleSetValue(current, sector.name))
                    }
                    type="button"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      {sectorOpen ? (
                        <ChevronDown className="h-4 w-4 text-cyan-300" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-cyan-300" />
                      )}
                      {sector.name}
                    </span>
                    <Metric value={formatPercentValue(sector.averageTodayPercent)} />
                    <Metric value={`${sector.up} up`} tone="up" />
                    <Metric value={`${sector.down} down`} tone="down" />
                    <Metric value={`${sector.industries.length} industries`} />
                  </button>
                  {sectorOpen ? (
                    <div className="bg-black/20 px-4 pb-4">
                      {sector.industries.map((industry) => {
                        const industryKey = `${sector.name}:${industry.name}`;
                        const industryOpen = openIndustries.has(industryKey);

                        return (
                          <div className="border-t border-white/10" key={industry.name}>
                            <button
                              className="grid w-full grid-cols-[1fr_auto] gap-3 py-3 text-left text-sm transition hover:text-white md:grid-cols-[1fr_8rem_8rem_8rem_auto]"
                              onClick={() =>
                                setOpenIndustries((current) =>
                                  toggleSetValue(current, industryKey),
                                )
                              }
                              type="button"
                            >
                              <span className="flex items-center gap-2 text-zinc-200">
                                {industryOpen ? (
                                  <ChevronDown className="h-4 w-4 text-cyan-300" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-cyan-300" />
                                )}
                                {industry.name}
                              </span>
                              <Metric value={formatPercentValue(industry.averageTodayPercent)} />
                              <Metric value={`${industry.up} up`} tone="up" />
                              <Metric value={`${industry.down} down`} tone="down" />
                              <Metric value={`${industry.stocks.length} stocks`} />
                            </button>
                            {industryOpen ? <StocksTable stocks={industry.stocks} /> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        </>
      ) : !error ? (
        <section className="mt-6 rounded-md border border-white/10 bg-white/[0.04] p-6 text-sm text-zinc-500">
          No sector breadth data is available.
        </section>
      ) : null}
    </div>
  );
}

function BreadthCards({ snapshot }: { snapshot: SectorBreadthSnapshot }) {
  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card label="T2108" value={formatNullablePercent(snapshot.liveBreadth.t2108)} />
      <Card
        label="4% Today"
        value={`${snapshot.liveBreadth.up4Percent} up / ${snapshot.liveBreadth.down4Percent} down`}
      />
      <Card
        label="13% in 34 Days"
        value={`${snapshot.liveBreadth.up13In34Days} up / ${snapshot.liveBreadth.down13In34Days} down`}
      />
      <Card label="5d Ratio" value={formatNullableNumber(snapshot.liveBreadth.ratio5Day)} />
      <Card label="10d Ratio" value={formatNullableNumber(snapshot.liveBreadth.ratio10Day)} />
    </section>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-3 font-mono text-xl font-semibold text-white">{value}</div>
    </article>
  );
}

function CoverageNote({ snapshot }: { snapshot: SectorBreadthSnapshot }) {
  return (
    <section className="mt-4 rounded-md border border-white/10 bg-black/20 p-3 text-sm text-zinc-500">
      {snapshot.coverage.mapped.toLocaleString("en-US")} classified /{" "}
      {snapshot.coverage.totalCommonStocks.toLocaleString("en-US")} common stocks.{" "}
      {snapshot.coverage.unmapped.toLocaleString("en-US")} unclassified excluded from sector totals.{" "}
      T2108 coverage: {snapshot.liveBreadth.t2108Covered.toLocaleString("en-US")} stocks.
    </section>
  );
}

function StocksTable({
  stocks,
}: {
  stocks: SectorBreadthSnapshot["sectors"][number]["stocks"];
}) {
  return (
    <div className="overflow-x-auto pb-3">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-2 pr-3">Symbol</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 text-right">Today</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Volume</th>
            <th className="px-3 py-2">Updated</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr className="border-t border-white/10" key={stock.symbol}>
              <td className="py-2 pr-3 font-mono font-semibold text-cyan-200">{stock.symbol}</td>
              <td className="max-w-80 truncate px-3 py-2 text-zinc-300">{stock.name}</td>
              <td className={`px-3 py-2 text-right font-mono font-semibold ${toneClass(stock.todayPercent)}`}>
                {formatPercentValue(stock.todayPercent)}
              </td>
              <td className="px-3 py-2 text-right font-mono">{formatMoney(stock.price)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCompact(stock.volume)}</td>
              <td className="px-3 py-2 text-zinc-500">
                {stock.lastUpdatedAt ? formatDateTime(stock.lastUpdatedAt) : "--"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({
  tone,
  value,
}: {
  tone?: "down" | "up";
  value: string;
}) {
  return (
    <span
      className={`text-right font-mono text-sm ${
        tone === "up"
          ? "text-emerald-300"
          : tone === "down"
            ? "text-rose-300"
            : "text-zinc-300"
      }`}
    >
      {value}
    </span>
  );
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);

  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }

  return next;
}

function toneClass(value: number) {
  if (value > 0) {
    return "text-emerald-300";
  }
  if (value < 0) {
    return "text-rose-300";
  }

  return "text-zinc-300";
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatNullableNumber(value: number | null) {
  return value == null ? "--" : value.toFixed(2);
}

function formatNullablePercent(value: number | null) {
  return value == null ? "--" : `${value.toFixed(1)}%`;
}

function formatPercentValue(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
```

- [ ] **Step 2: Create the server page**

Create `src/app/sector-breadth/page.tsx`:

```tsx
import { AppShell } from "@/components/app-shell";
import { SectorBreadthView } from "@/components/sector-breadth-view";
import { requireUser } from "@/lib/auth/session";
import { getCachedOrFetchBars } from "@/lib/market-data/cache";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";
import {
  buildCommonStockUniverse,
  normalizeMarketSnapshotTicker,
} from "@/lib/market-data/market-universe";
import {
  buildSectorBreadthSnapshot,
  calculateHistoricalBreadthMetrics,
} from "@/lib/market-data/sector-breadth";
import { readStockClassifications } from "@/lib/market-data/sector-classifications";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const HISTORY_LOOKBACK_DAYS = 75;

export default async function SectorBreadthPage() {
  const user = await requireUser();
  const result = await loadSectorBreadth();

  return (
    <AppShell user={user}>
      <SectorBreadthView error={result.error} snapshot={result.snapshot} />
    </AppShell>
  );
}

async function loadSectorBreadth() {
  const provider = createMassiveMarketDataProvider();
  const client = createSupabaseAdminClient();
  const loadedAt = new Date();

  if (!provider) {
    return { error: "Massive API key is not configured.", snapshot: null };
  }
  if (!client) {
    return {
      error: "Supabase service role is not configured, so stock classifications cannot be read.",
      snapshot: null,
    };
  }

  try {
    const [references, rawSnapshots, classifications] = await Promise.all([
      provider.getActiveStockTickers(),
      provider.getFullMarketSnapshot(),
      readStockClassifications({ client }),
    ]);
    const universe = buildCommonStockUniverse(references);

    if (classifications.length === 0) {
      return {
        error:
          "No SIC-derived stock classifications are available. Import classifications before using sector breadth.",
        snapshot: null,
      };
    }

    const normalizedSnapshots = rawSnapshots
      .map(normalizeMarketSnapshotTicker)
      .filter((snapshot): snapshot is NonNullable<typeof snapshot> => snapshot != null)
      .filter((snapshot) => universe.has(snapshot.symbol));
    const snapshotBySymbol = new Map(
      normalizedSnapshots.map((snapshot) => [snapshot.symbol, snapshot]),
    );
    const mappedSymbols = classifications
      .map((classification) => classification.ticker)
      .filter((symbol) => universe.has(symbol) && snapshotBySymbol.has(symbol));
    const todayCounts = mappedSymbols.reduce(
      (counts, symbol) => {
        const snapshot = snapshotBySymbol.get(symbol);
        if (!snapshot) {
          return counts;
        }
        const todayPercent =
          ((snapshot.price - snapshot.previousClose) / snapshot.previousClose) * 100;
        if (todayPercent >= 4) {
          counts.up4 += 1;
        }
        if (todayPercent <= -4) {
          counts.down4 += 1;
        }
        return counts;
      },
      { down4: 0, up4: 0 },
    );
    const barsBySymbol = await loadHistoricalBars({
      client,
      loadedAt,
      provider,
      symbols: mappedSymbols,
    });
    const historicalMetrics = calculateHistoricalBreadthMetrics({
      barsBySymbol,
      todayDown4Percent: todayCounts.down4,
      todayUp4Percent: todayCounts.up4,
    });

    return {
      error: null,
      snapshot: buildSectorBreadthSnapshot({
        classifications,
        historicalMetrics,
        loadedAt: loadedAt.toISOString(),
        snapshots: normalizedSnapshots,
        totalCommonStocks: universe.size,
      }),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      snapshot: null,
    };
  }
}

async function loadHistoricalBars(input: {
  client: unknown;
  loadedAt: Date;
  provider: NonNullable<ReturnType<typeof createMassiveMarketDataProvider>>;
  symbols: string[];
}) {
  const to = datePart(input.loadedAt);
  const from = datePart(addDays(input.loadedAt, -HISTORY_LOOKBACK_DAYS));
  const barsBySymbol = new Map();

  for (const symbol of input.symbols) {
    try {
      const bars = await getCachedOrFetchBars({
        client: input.client,
        provider: input.provider,
        request: {
          adjusted: true,
          from,
          symbol,
          timeframe: "1d",
          to,
        },
      });
      barsBySymbol.set(symbol, bars);
    } catch {
      barsBySymbol.set(symbol, []);
    }
  }

  return barsBySymbol;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function datePart(value: Date) {
  return value.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Add navigation item**

In `src/components/app-shell.tsx`, add `Layers3` to the lucide import:

```ts
  Layers3,
```

Add this nav item after Gappers:

```ts
  { href: "/sector-breadth", label: "Sectors", icon: Layers3 },
```

- [ ] **Step 4: Run TypeScript-adjacent verification**

Run:

```powershell
npm test -- src/lib/market-data/sector-breadth.test.ts src/lib/market-data/sector-classifications.test.ts src/lib/market-data/market-universe.test.ts
npm run lint
```

Expected: tests and lint pass. If lint flags `loadHistoricalBars` sequential awaits, keep the sequential implementation for rate-limit safety and add a focused eslint-safe helper only if the existing lint rules require it.

- [ ] **Step 5: Commit**

Run:

```powershell
git add src/components/sector-breadth-view.tsx src/app/sector-breadth/page.tsx src/components/app-shell.tsx
git commit -m "Add sector breadth page"
```

---

### Task 6: Full Verification, Screenshot, and PR

**Files:**
- Modify only if meaningful: `docs/screenshots/sector-breadth-page.png`

- [ ] **Step 1: Run full local verification**

Run:

```powershell
npm test
```

Expected: Vitest exits successfully.

Run:

```powershell
npm run lint
```

Expected: ESLint exits successfully.

Run:

```powershell
npm run build
```

Expected: Next build exits successfully.

- [ ] **Step 2: Start the dev server**

Run:

```powershell
npm run dev
```

Expected: Next starts on `http://localhost:3000` or reports another local port.

- [ ] **Step 3: Browser smoke test**

Open `/sector-breadth` in the in-app browser and verify:

- the page is inside the authenticated `AppShell`;
- the nav includes `Sectors`;
- missing Massive or missing classification data produces a clear warning;
- when classification rows exist, the top breadth cards render;
- sectors render before industries;
- clicking a sector reveals industries;
- clicking an industry reveals stocks;
- red and green stock percentages are styled distinctly;
- text does not overlap at desktop or mobile widths.

- [ ] **Step 4: Capture screenshot if useful**

If local auth and classification data produce a meaningful page, save a screenshot to:

```text
docs/screenshots/sector-breadth-page.png
```

Skip this file if the local environment only shows setup/error states.

- [ ] **Step 5: Commit screenshot if updated**

Run only when `docs/screenshots/sector-breadth-page.png` changed:

```powershell
git add docs/screenshots/sector-breadth-page.png
git commit -m "Add sector breadth screenshot"
```

- [ ] **Step 6: Push and open PR**

Run:

```powershell
git status --short
```

Expected: only unrelated pre-existing untracked files remain.

Run:

```powershell
git push -u origin codex/sector-breadth
```

Open a draft PR with:

- summary of the new `/sector-breadth` page;
- note that classifications are SIC-derived, not official GICS;
- verification commands and results;
- screenshot if one was captured.

---

## Self-Review Notes

- Spec coverage: the plan covers the separate page, common-stock-only universe, SIC-derived free classification, shared Massive provider reuse, sector -> industry -> stocks drilldown, live breadth cards, historical coverage behavior, Supabase storage, tests, CI, screenshot, and PR.
- Placeholder scan: no placeholder markers are present. The implementation steps include exact file paths, commands, test blocks, SQL, and code for the main modules.
- Type consistency: `StockClassification`, `SectorName`, `NormalizedMarketSnapshot`, `HistoricalBreadthMetrics`, and `SectorBreadthSnapshot` are introduced before use in page/component code.
