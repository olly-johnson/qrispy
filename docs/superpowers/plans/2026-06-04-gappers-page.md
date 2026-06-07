# Gappers Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an authenticated `/gappers` page that screens US-listed common stocks and ETFs from Massive.com, supports customizable filters, and refreshes manually and every 15 minutes.

**Architecture:** Extend the existing Massive provider with reference ticker and full-market snapshot methods. Put session-mode, extended-hours volume, filtering, and sorting logic in a focused `gappers.ts` module, keep client-side threshold filtering in `gappers-client.ts`, and render the route with a server page plus a small client component for filters and refresh controls.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Massive REST API, existing Qrispy `AppShell`.

---

## File Structure

- Modify `src/lib/market-data/massive.ts`: add server-only Massive methods for active ticker references and full market snapshots.
- Modify `src/lib/market-data/massive.test.ts`: prove new Massive URLs, pagination, `apiKey`, and `cache: "no-store"` behavior.
- Create `src/lib/market-data/gappers.ts`: define gappers types, session-mode selection, Eastern-time windows, row normalization, provider orchestration, server-side safety filters, and sort order.
- Create `src/lib/market-data/gappers.test.ts`: prove extended-hours windows, regular-session mode, security universe filtering, gap calculation, dollar-volume calculation, and sorting.
- Create `src/lib/market-data/gappers-client.ts`: define client filter defaults and visible-row filtering.
- Create `src/lib/market-data/gappers-client.test.ts`: prove user-adjustable filters work without fetching.
- Create `src/components/gappers-table.tsx`: client component with Refresh button, 15-minute auto refresh, filter controls, summary counts, and responsive table.
- Create `src/app/gappers/page.tsx`: authenticated dynamic server page that fetches the latest dataset and renders the client component inside `AppShell`.
- Modify `src/components/app-shell.tsx`: add a `Gappers` nav item with a lucide icon.
- Leave `.github/workflows/ci.yml` unchanged because it already runs `npm test`, `npm run lint`, and `npm run build`.

---

### Task 1: Extend Massive Provider Surface

**Files:**
- Modify: `src/lib/market-data/massive.test.ts`
- Modify: `src/lib/market-data/massive.ts`

- [ ] **Step 1: Write failing Massive provider tests**

Add these tests to `src/lib/market-data/massive.test.ts` after the existing aggregate test:

```ts
  it("fetches active stock reference tickers with pagination", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              active: true,
              locale: "us",
              market: "stocks",
              name: "Acme Corp",
              ticker: "ACME",
              type: "CS",
            },
          ],
          next_url: "https://api.massive.com/v3/reference/tickers?cursor=next",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          results: [
            {
              active: true,
              locale: "us",
              market: "stocks",
              name: "Index ETF",
              ticker: "IETF",
              type: "ETF",
            },
          ],
        }),
      });
    const provider = new MassiveMarketDataProvider({
      apiKey: "massive-key",
      fetcher,
    });

    await expect(provider.getActiveStockTickers()).resolves.toEqual([
      expect.objectContaining({ ticker: "ACME", type: "CS" }),
      expect.objectContaining({ ticker: "IETF", type: "ETF" }),
    ]);

    const firstUrl = new URL(fetcher.mock.calls[0][0]);
    expect(firstUrl.pathname).toBe("/v3/reference/tickers");
    expect(firstUrl.searchParams.get("market")).toBe("stocks");
    expect(firstUrl.searchParams.get("active")).toBe("true");
    expect(firstUrl.searchParams.get("limit")).toBe("1000");
    expect(firstUrl.searchParams.get("sort")).toBe("ticker");
    expect(firstUrl.searchParams.get("apiKey")).toBe("massive-key");
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });

    const secondUrl = new URL(fetcher.mock.calls[1][0]);
    expect(secondUrl.searchParams.get("apiKey")).toBe("massive-key");
  });

  it("fetches the full US stock market snapshot without OTC tickers", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        tickers: [
          {
            ticker: "ACME",
            todaysChangePerc: 8.2,
            updated: 1_780_000_000_000,
          },
        ],
      }),
    });
    const provider = new MassiveMarketDataProvider({
      apiKey: "massive-key",
      fetcher,
    });

    await expect(provider.getFullMarketSnapshot()).resolves.toEqual([
      expect.objectContaining({ ticker: "ACME", todaysChangePerc: 8.2 }),
    ]);

    const url = new URL(fetcher.mock.calls[0][0]);
    expect(url.pathname).toBe("/v2/snapshot/locale/us/markets/stocks/tickers");
    expect(url.searchParams.get("include_otc")).toBe("false");
    expect(url.searchParams.get("apiKey")).toBe("massive-key");
    expect(fetcher.mock.calls[0][1]).toEqual({ cache: "no-store" });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/market-data/massive.test.ts
```

Expected: fail with TypeScript/runtime errors that `getActiveStockTickers` and `getFullMarketSnapshot` are not functions.

- [ ] **Step 3: Implement the Massive methods**

In `src/lib/market-data/massive.ts`, add these exported types near `MassiveProviderOptions`:

```ts
export type MassiveReferenceTicker = {
  active?: boolean;
  locale?: string;
  market?: string;
  name?: string;
  primary_exchange?: string;
  ticker?: string;
  type?: string;
};

export type MassiveSnapshotTicker = Record<string, unknown> & {
  ticker?: string;
};
```

Change aggregate fetching to pass `cache: "no-store"`:

```ts
const response = await this.fetcher(this.buildAggregateUrl(request), {
  cache: "no-store",
});
```

Add these methods inside `MassiveMarketDataProvider`:

```ts
  async getActiveStockTickers(): Promise<MassiveReferenceTicker[]> {
    const url = new URL(`${this.baseUrl}/v3/reference/tickers`);
    url.searchParams.set("market", "stocks");
    url.searchParams.set("active", "true");
    url.searchParams.set("order", "asc");
    url.searchParams.set("limit", "1000");
    url.searchParams.set("sort", "ticker");

    return this.fetchPaginatedResults<MassiveReferenceTicker>(url);
  }

  async getFullMarketSnapshot(): Promise<MassiveSnapshotTicker[]> {
    const url = new URL(`${this.baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers`);
    url.searchParams.set("include_otc", "false");
    url.searchParams.set("apiKey", this.apiKey);

    const response = await this.fetcher(url.toString(), { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Massive full market snapshot request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { tickers?: unknown[] };

    return Array.isArray(payload.tickers)
      ? (payload.tickers as MassiveSnapshotTicker[])
      : [];
  }

  private async fetchPaginatedResults<T extends Record<string, unknown>>(url: URL): Promise<T[]> {
    const rows: T[] = [];
    let nextUrl: string | null = this.withApiKey(url).toString();

    while (nextUrl) {
      const response = await this.fetcher(nextUrl, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`Massive reference request failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        next_url?: string;
        results?: unknown[];
      };

      if (Array.isArray(payload.results)) {
        rows.push(...(payload.results as T[]));
      }

      nextUrl = payload.next_url
        ? this.withApiKey(new URL(payload.next_url)).toString()
        : null;
    }

    return rows;
  }

  private withApiKey(url: URL) {
    url.searchParams.set("apiKey", this.apiKey);

    return url;
  }
```

- [ ] **Step 4: Run tests to verify provider methods pass**

Run:

```bash
npm test -- src/lib/market-data/massive.test.ts
```

Expected: all tests in `massive.test.ts` pass.

- [ ] **Step 5: Commit provider surface**

Run:

```bash
git add src/lib/market-data/massive.ts src/lib/market-data/massive.test.ts
git commit -m "Add Massive gappers data methods"
```

---

### Task 2: Implement Gappers Server Logic

**Files:**
- Create: `src/lib/market-data/gappers.test.ts`
- Create: `src/lib/market-data/gappers.ts`

- [ ] **Step 1: Write failing gappers tests**

Create `src/lib/market-data/gappers.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  buildGappersSnapshot,
  getGappersMode,
  getExtendedHoursWindows,
  type GappersDataProvider,
} from "./gappers";
import type { OhlcvBar } from "./types";

describe("getGappersMode", () => {
  it("uses extended-hours mode from 4:00 AM ET until 9:30 AM ET", () => {
    expect(getGappersMode(new Date("2026-06-04T08:00:00.000Z"))).toBe("regular");
    expect(getGappersMode(new Date("2026-06-04T08:00:01.000Z"))).toBe("extended");
    expect(getGappersMode(new Date("2026-06-04T13:29:59.000Z"))).toBe("extended");
    expect(getGappersMode(new Date("2026-06-04T13:30:00.000Z"))).toBe("regular");
    expect(getGappersMode(new Date("2026-06-04T21:00:00.000Z"))).toBe("regular");
  });
});

describe("getExtendedHoursWindows", () => {
  it("builds yesterday after-hours and today premarket windows in Eastern time", () => {
    expect(getExtendedHoursWindows(new Date("2026-06-04T12:00:00.000Z"))).toEqual([
      {
        from: new Date("2026-06-03T20:00:00.000Z"),
        to: new Date("2026-06-04T00:00:00.000Z"),
      },
      {
        from: new Date("2026-06-04T08:00:00.000Z"),
        to: new Date("2026-06-04T13:30:00.000Z"),
      },
    ]);
  });
});

describe("buildGappersSnapshot", () => {
  it("filters extended-hours common stocks and ETFs, sums volume, and sorts by dollar volume", async () => {
    const provider = providerWith({
      aggregateBars: {
        ACME: [bar("ACME", "2026-06-03T21:00:00.000Z", 11, 5_000), bar("ACME", "2026-06-04T12:00:00.000Z", 12, 8_000)],
        IETF: [bar("IETF", "2026-06-04T12:15:00.000Z", 6, 40_000)],
      },
      snapshots: [
        snapshot("ACME", { price: 12, previousClose: 10, regularVolume: 20_000 }),
        snapshot("IETF", { price: 6, previousClose: 5, regularVolume: 50_000 }),
        snapshot("FUNDX", { price: 9, previousClose: 7, regularVolume: 80_000 }),
        snapshot("OTCM", { price: 9, previousClose: 7, regularVolume: 80_000 }),
      ],
      tickers: [
        ticker("ACME", "Acme Corp", "CS", "stocks"),
        ticker("IETF", "Index ETF", "ETF", "stocks"),
        ticker("FUNDX", "Mutual Fund", "FUND", "stocks"),
        ticker("OTCM", "OTC Name", "CS", "otc"),
      ],
    });

    await expect(
      buildGappersSnapshot({
        now: new Date("2026-06-04T12:00:00.000Z"),
        provider,
      }),
    ).resolves.toEqual({
      error: null,
      loadedAt: "2026-06-04T12:00:00.000Z",
      mode: "extended",
      rows: [
        expect.objectContaining({
          activeDollarVolume: 240_000,
          activeVolume: 40_000,
          gapPercent: 20,
          price: 6,
          securityType: "ETF",
          symbol: "IETF",
        }),
        expect.objectContaining({
          activeDollarVolume: 156_000,
          activeVolume: 13_000,
          gapPercent: 20,
          price: 12,
          securityType: "Stock",
          symbol: "ACME",
        }),
      ],
    });
  });

  it("uses regular-session volume outside premarket and keeps sorting by dollar volume", async () => {
    const provider = providerWith({
      aggregateBars: {},
      snapshots: [
        snapshot("ACME", { price: 12, previousClose: 10, regularVolume: 20_000 }),
        snapshot("IETF", { price: 6, previousClose: 5, regularVolume: 50_000 }),
      ],
      tickers: [
        ticker("ACME", "Acme Corp", "CS", "stocks"),
        ticker("IETF", "Index ETF", "ETF", "stocks"),
      ],
    });

    const result = await buildGappersSnapshot({
      now: new Date("2026-06-04T21:00:00.000Z"),
      provider,
    });

    expect(result.mode).toBe("regular");
    expect(result.rows.map((row) => row.symbol)).toEqual(["IETF", "ACME"]);
    expect(result.rows.map((row) => row.activeDollarVolume)).toEqual([300_000, 240_000]);
    expect(provider.getAggregateBars).not.toHaveBeenCalled();
  });

  it("returns a configuration error when Massive is unavailable", async () => {
    await expect(
      buildGappersSnapshot({
        now: new Date("2026-06-04T12:00:00.000Z"),
        provider: null,
      }),
    ).resolves.toEqual({
      error: "Massive API key is not configured.",
      loadedAt: "2026-06-04T12:00:00.000Z",
      mode: "extended",
      rows: [],
    });
  });
});

function providerWith(input: {
  aggregateBars: Record<string, OhlcvBar[]>;
  snapshots: Record<string, unknown>[];
  tickers: Record<string, unknown>[];
}): GappersDataProvider {
  return {
    getActiveStockTickers: vi.fn(async () => input.tickers),
    getAggregateBars: vi.fn(async ({ symbol }) => input.aggregateBars[symbol] ?? []),
    getFullMarketSnapshot: vi.fn(async () => input.snapshots),
  };
}

function ticker(tickerSymbol: string, name: string, type: string, market: string) {
  return {
    active: true,
    locale: "us",
    market,
    name,
    ticker: tickerSymbol,
    type,
  };
}

function snapshot(
  tickerSymbol: string,
  input: { previousClose: number; price: number; regularVolume: number },
) {
  return {
    day: { v: input.regularVolume },
    min: { c: input.price },
    prevDay: { c: input.previousClose },
    ticker: tickerSymbol,
    updated: 1_780_000_000_000,
  };
}

function bar(symbol: string, barStartAt: string, close: number, volume: number): OhlcvBar {
  return {
    adjusted: false,
    barStartAt,
    close,
    high: close,
    low: close,
    open: close,
    provider: "test",
    rawPayload: {},
    symbol,
    timeframe: "5m",
    volume,
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/market-data/gappers.test.ts
```

Expected: fail because `src/lib/market-data/gappers.ts` does not exist.

- [ ] **Step 3: Implement server-side gappers logic**

Create `src/lib/market-data/gappers.ts`:

```ts
import type {
  MassiveReferenceTicker,
  MassiveSnapshotTicker,
} from "./massive";
import type { MarketDataRequest, OhlcvBar } from "./types";

export type GappersMode = "extended" | "regular";
export type GappersSecurityType = "ETF" | "Stock";

export type GappersRow = {
  activeDollarVolume: number;
  activeVolume: number;
  gapPercent: number;
  lastUpdatedAt: string | null;
  name: string;
  previousClose: number;
  price: number;
  securityType: GappersSecurityType;
  symbol: string;
};

export type GappersSnapshot = {
  error: string | null;
  loadedAt: string;
  mode: GappersMode;
  rows: GappersRow[];
};

export type GappersDataProvider = {
  getActiveStockTickers(): Promise<MassiveReferenceTicker[]>;
  getAggregateBars(request: MarketDataRequest): Promise<OhlcvBar[]>;
  getFullMarketSnapshot(): Promise<MassiveSnapshotTicker[]>;
};

type ExtendedHoursWindow = {
  from: Date;
  to: Date;
};

const EASTERN_TIME_ZONE = "America/New_York";
const MIN_SERVER_PRICE = 0.5;
const MIN_SERVER_GAP_PERCENT = 0;

export async function buildGappersSnapshot({
  now = new Date(),
  provider,
}: {
  now?: Date;
  provider: GappersDataProvider | null;
}): Promise<GappersSnapshot> {
  const mode = getGappersMode(now);
  const loadedAt = now.toISOString();

  if (!provider) {
    return {
      error: "Massive API key is not configured.",
      loadedAt,
      mode,
      rows: [],
    };
  }

  try {
    const [references, snapshots] = await Promise.all([
      provider.getActiveStockTickers(),
      provider.getFullMarketSnapshot(),
    ]);
    const universe = buildUniverse(references);
    const candidates = snapshots
      .map((snapshot) => normalizeCandidate(snapshot, universe.get(String(snapshot.ticker ?? "").toUpperCase())))
      .filter((row): row is GappersRow => row != null)
      .filter((row) => row.price > MIN_SERVER_PRICE && row.gapPercent >= MIN_SERVER_GAP_PERCENT);

    const rows =
      mode === "extended"
        ? await withExtendedHoursVolume(candidates, provider, now)
        : candidates.map((row) => ({
            ...row,
            activeDollarVolume: row.activeVolume * row.price,
          }));

    return {
      error: null,
      loadedAt,
      mode,
      rows: sortByDollarVolume(rows),
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      loadedAt,
      mode,
      rows: [],
    };
  }
}

export function getGappersMode(now: Date): GappersMode {
  const parts = easternDateParts(now);
  const minutes = parts.hour * 60 + parts.minute + parts.second / 60;

  return minutes >= 4 * 60 && minutes < 9 * 60 + 30 ? "extended" : "regular";
}

export function getExtendedHoursWindows(now: Date): ExtendedHoursWindow[] {
  const today = easternDateParts(now);
  const yesterdayNoon = new Date(Date.UTC(today.year, today.month - 1, today.day - 1, 12));
  const yesterday = easternDateParts(yesterdayNoon);

  return [
    {
      from: easternDateTimeToUtc(yesterday.year, yesterday.month, yesterday.day, 16, 0),
      to: easternDateTimeToUtc(yesterday.year, yesterday.month, yesterday.day, 20, 0),
    },
    {
      from: easternDateTimeToUtc(today.year, today.month, today.day, 4, 0),
      to: easternDateTimeToUtc(today.year, today.month, today.day, 9, 30),
    },
  ];
}

async function withExtendedHoursVolume(
  rows: GappersRow[],
  provider: GappersDataProvider,
  now: Date,
) {
  const windows = getExtendedHoursWindows(now);

  return Promise.all(
    rows.map(async (row) => {
      const bars = await Promise.all(
        windows.map((window) =>
          provider.getAggregateBars({
            adjusted: false,
            from: String(window.from.getTime()),
            symbol: row.symbol,
            timeframe: "5m",
            to: String(window.to.getTime()),
          }),
        ),
      );
      const activeVolume = bars
        .flat()
        .filter((bar) => isInAnyWindow(new Date(bar.barStartAt), windows))
        .reduce((sum, bar) => sum + bar.volume, 0);

      return {
        ...row,
        activeDollarVolume: activeVolume * row.price,
        activeVolume,
      };
    }),
  );
}

function buildUniverse(references: MassiveReferenceTicker[]) {
  const universe = new Map<string, { name: string; securityType: GappersSecurityType }>();

  for (const item of references) {
    const symbol = String(item.ticker ?? "").toUpperCase();
    const type = String(item.type ?? "").toUpperCase();
    const market = String(item.market ?? "").toLowerCase();
    const locale = String(item.locale ?? "").toLowerCase();

    if (!symbol || item.active === false || locale !== "us" || market !== "stocks") {
      continue;
    }

    if (type === "CS") {
      universe.set(symbol, { name: item.name ?? symbol, securityType: "Stock" });
    }
    if (type === "ETF") {
      universe.set(symbol, { name: item.name ?? symbol, securityType: "ETF" });
    }
  }

  return universe;
}

function normalizeCandidate(
  snapshot: MassiveSnapshotTicker,
  reference: { name: string; securityType: GappersSecurityType } | undefined,
): GappersRow | null {
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

  if (!symbol || !reference || price == null || previousClose == null || previousClose <= 0) {
    return null;
  }

  const activeVolume =
    firstFiniteNumber([getPath(snapshot, ["day", "v"]), getPath(snapshot, ["session", "volume"])]) ?? 0;
  const updated = firstFiniteNumber([snapshot.updated, snapshot.last_updated]);

  return {
    activeDollarVolume: activeVolume * price,
    activeVolume,
    gapPercent: ((price - previousClose) / previousClose) * 100,
    lastUpdatedAt: updated == null ? null : timestampToIso(updated),
    name: reference.name,
    previousClose,
    price,
    securityType: reference.securityType,
    symbol,
  };
}

function sortByDollarVolume(rows: GappersRow[]) {
  return [...rows].sort((a, b) => b.activeDollarVolume - a.activeDollarVolume || a.symbol.localeCompare(b.symbol));
}

function isInAnyWindow(value: Date, windows: ExtendedHoursWindow[]) {
  const time = value.getTime();

  return windows.some((window) => time >= window.from.getTime() && time < window.to.getTime());
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
  const milliseconds = value > 10_000_000_000_000 ? Math.floor(value / 1_000_000) : value;

  return new Date(milliseconds).toISOString();
}

function easternDateParts(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(value).map((part) => [part.type, part.value]),
  );

  return {
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    month: Number(parts.month),
    second: Number(parts.second),
    year: Number(parts.year),
  };
}

function easternDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) {
  let candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  for (let index = 0; index < 3; index += 1) {
    const parts = easternDateParts(candidate);
    const deltaMinutes =
      (Date.UTC(year, month - 1, day, hour, minute) -
        Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)) /
      60_000;

    candidate = new Date(candidate.getTime() + deltaMinutes * 60_000);
  }

  return candidate;
}
```

- [ ] **Step 4: Run tests to verify gappers logic passes**

Run:

```bash
npm test -- src/lib/market-data/gappers.test.ts
```

Expected: all tests in `gappers.test.ts` pass.

- [ ] **Step 5: Commit gappers server logic**

Run:

```bash
git add src/lib/market-data/gappers.ts src/lib/market-data/gappers.test.ts
git commit -m "Add gappers screening logic"
```

---

### Task 3: Implement Client-Side Filter Logic

**Files:**
- Create: `src/lib/market-data/gappers-client.test.ts`
- Create: `src/lib/market-data/gappers-client.ts`

- [ ] **Step 1: Write failing client filter tests**

Create `src/lib/market-data/gappers-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { DEFAULT_GAPPERS_FILTERS, filterGappersRows } from "./gappers-client";
import type { GappersRow } from "./gappers";

describe("filterGappersRows", () => {
  it("uses default price, gap, dollar volume, and type filters", () => {
    expect(
      filterGappersRows(
        [
          row("ACME", "Stock", 1, 6, 100_000),
          row("LOWP", "Stock", 0.5, 20, 200_000),
          row("LOWG", "Stock", 4, 5.9, 200_000),
          row("LOWD", "ETF", 4, 8, 99_999),
          row("IETF", "ETF", 4, 8, 250_000),
        ],
        DEFAULT_GAPPERS_FILTERS,
      ).map((item) => item.symbol),
    ).toEqual(["IETF", "ACME"]);
  });

  it("can hide stocks or ETFs independently", () => {
    const rows = [row("ACME", "Stock", 1, 6, 100_000), row("IETF", "ETF", 4, 8, 250_000)];

    expect(
      filterGappersRows(rows, {
        ...DEFAULT_GAPPERS_FILTERS,
        includeEtfs: false,
      }).map((item) => item.symbol),
    ).toEqual(["ACME"]);

    expect(
      filterGappersRows(rows, {
        ...DEFAULT_GAPPERS_FILTERS,
        includeStocks: false,
      }).map((item) => item.symbol),
    ).toEqual(["IETF"]);
  });
});

function row(
  symbol: string,
  securityType: GappersRow["securityType"],
  price: number,
  gapPercent: number,
  activeDollarVolume: number,
): GappersRow {
  return {
    activeDollarVolume,
    activeVolume: 10_000,
    gapPercent,
    lastUpdatedAt: null,
    name: symbol,
    previousClose: 1,
    price,
    securityType,
    symbol,
  };
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/market-data/gappers-client.test.ts
```

Expected: fail because `src/lib/market-data/gappers-client.ts` does not exist.

- [ ] **Step 3: Implement client filter helper**

Create `src/lib/market-data/gappers-client.ts`:

```ts
import type { GappersRow } from "./gappers";

export type GappersFilters = {
  includeEtfs: boolean;
  includeStocks: boolean;
  minDollarVolume: number;
  minGapPercent: number;
  minPrice: number;
};

export const DEFAULT_GAPPERS_FILTERS: GappersFilters = {
  includeEtfs: true,
  includeStocks: true,
  minDollarVolume: 100_000,
  minGapPercent: 6,
  minPrice: 0.5,
};

export function filterGappersRows(rows: GappersRow[], filters: GappersFilters) {
  return rows.filter((row) => {
    if (row.price <= filters.minPrice) {
      return false;
    }
    if (row.gapPercent < filters.minGapPercent) {
      return false;
    }
    if (row.activeDollarVolume < filters.minDollarVolume) {
      return false;
    }
    if (row.securityType === "ETF" && !filters.includeEtfs) {
      return false;
    }
    if (row.securityType === "Stock" && !filters.includeStocks) {
      return false;
    }

    return true;
  });
}
```

- [ ] **Step 4: Run tests to verify client filter helper passes**

Run:

```bash
npm test -- src/lib/market-data/gappers-client.test.ts
```

Expected: all tests in `gappers-client.test.ts` pass.

- [ ] **Step 5: Commit client filter logic**

Run:

```bash
git add src/lib/market-data/gappers-client.ts src/lib/market-data/gappers-client.test.ts
git commit -m "Add gappers client filters"
```

---

### Task 4: Build Gappers Page UI and Refresh Behavior

**Files:**
- Create: `src/components/gappers-table.tsx`
- Create: `src/app/gappers/page.tsx`
- Modify: `src/components/app-shell.tsx`

- [ ] **Step 1: Create the client table component**

Create `src/components/gappers-table.tsx`:

```tsx
"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { formatDateTime, formatMoney, formatPercent } from "@/components/format";
import type { GappersMode, GappersRow } from "@/lib/market-data/gappers";
import {
  DEFAULT_GAPPERS_FILTERS,
  filterGappersRows,
  type GappersFilters,
} from "@/lib/market-data/gappers-client";

const AUTO_REFRESH_MS = 15 * 60 * 1000;

export function GappersTable({
  error,
  loadedAt,
  mode,
  rows,
}: {
  error: string | null;
  loadedAt: string;
  mode: GappersMode;
  rows: GappersRow[];
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<GappersFilters>(DEFAULT_GAPPERS_FILTERS);
  const [isPending, startTransition] = useTransition();
  const visibleRows = useMemo(() => filterGappersRows(rows, filters), [filters, rows]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [router]);

  const refresh = () => {
    startTransition(() => router.refresh());
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Gappers</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {mode === "extended" ? "Extended-hours volume" : "Regular-session volume"} · Last updated:{" "}
            {formatDateTime(loadedAt)}
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

      <section className="mt-6 rounded-md border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <NumberInput
            label="Min price"
            min={0}
            step={0.01}
            value={filters.minPrice}
            onChange={(value) => setFilters((current) => ({ ...current, minPrice: value }))}
          />
          <NumberInput
            label="Min gap %"
            min={0}
            step={0.1}
            value={filters.minGapPercent}
            onChange={(value) => setFilters((current) => ({ ...current, minGapPercent: value }))}
          />
          <NumberInput
            label="Min dollar volume"
            min={0}
            step={10_000}
            value={filters.minDollarVolume}
            onChange={(value) => setFilters((current) => ({ ...current, minDollarVolume: value }))}
          />
          <Toggle
            checked={filters.includeStocks}
            label="Stocks"
            onChange={(checked) => setFilters((current) => ({ ...current, includeStocks: checked }))}
          />
          <Toggle
            checked={filters.includeEtfs}
            label="ETFs"
            onChange={(checked) => setFilters((current) => ({ ...current, includeEtfs: checked }))}
          />
        </div>
        <div className="mt-4 text-sm text-zinc-500">
          Showing {visibleRows.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")} loaded rows.
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-md border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
              <tr>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Gap</th>
                <th className="px-4 py-3 text-right">Volume</th>
                <th className="px-4 py-3 text-right">Dollar Volume</th>
                <th className="px-4 py-3 text-right">Prev Close</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleRows.map((row) => (
                <tr className="hover:bg-white/[0.03]" key={row.symbol}>
                  <td className="px-4 py-3 font-mono font-semibold text-cyan-200">{row.symbol}</td>
                  <td className="max-w-72 truncate px-4 py-3 text-zinc-300">{row.name}</td>
                  <td className="px-4 py-3">{row.securityType}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatMoney(row.price)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-300">
                    {formatPercent(row.gapPercent / 100)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatCompact(row.activeVolume)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    {formatMoney(row.activeDollarVolume)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatMoney(row.previousClose)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {row.lastUpdatedAt ? formatDateTime(row.lastUpdatedAt) : "--"}
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-zinc-500" colSpan={9}>
                    No gappers match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NumberInput({
  label,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  min: number;
  onChange(value: number): void;
  step: number;
  value: number;
}) {
  return (
    <label className="grid gap-1 text-xs text-zinc-500">
      {label}
      <input
        className="h-10 rounded-md border border-white/10 bg-black/20 px-3 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-300/60"
        min={min}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex h-10 items-center gap-2 self-end rounded-md border border-white/10 bg-black/20 px-3 text-sm text-zinc-300">
      <input
        checked={checked}
        className="h-4 w-4 accent-emerald-300"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}
```

- [ ] **Step 2: Create the server page**

Create `src/app/gappers/page.tsx`:

```tsx
import { AppShell } from "@/components/app-shell";
import { GappersTable } from "@/components/gappers-table";
import { requireUser } from "@/lib/auth/session";
import { buildGappersSnapshot } from "@/lib/market-data/gappers";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";

export const dynamic = "force-dynamic";

export default async function GappersPage() {
  const user = await requireUser();
  const snapshot = await buildGappersSnapshot({
    provider: createMassiveMarketDataProvider(),
  });

  return (
    <AppShell user={user}>
      <GappersTable
        error={snapshot.error}
        loadedAt={snapshot.loadedAt}
        mode={snapshot.mode}
        rows={snapshot.rows}
      />
    </AppShell>
  );
}
```

- [ ] **Step 3: Add Gappers navigation**

Modify the import and `navItems` in `src/components/app-shell.tsx`:

```tsx
import {
  Activity,
  BarChart3,
  BriefcaseBusiness,
  ListChecks,
  Settings,
  TrendingUp,
  WalletCards,
} from "lucide-react";
```

```tsx
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: WalletCards },
  { href: "/trades", label: "Trades", icon: BarChart3 },
  { href: "/positions", label: "Positions", icon: BriefcaseBusiness },
  { href: "/gappers", label: "Gappers", icon: TrendingUp },
  { href: "/market-breadth", label: "Breadth", icon: Activity },
  { href: "/jobs", label: "Jobs", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
];
```

- [ ] **Step 4: Run focused tests and lint**

Run:

```bash
npm test -- src/lib/market-data/gappers-client.test.ts src/lib/market-data/gappers.test.ts src/lib/market-data/massive.test.ts
npm run lint
```

Expected: focused tests pass and lint exits successfully.

- [ ] **Step 5: Commit page UI**

Run:

```bash
git add src/app/gappers/page.tsx src/components/app-shell.tsx src/components/gappers-table.tsx
git commit -m "Add gappers page UI"
```

---

### Task 5: Full Verification and Browser Smoke Test

**Files:**
- Add screenshot under `docs/screenshots/` only if the browser smoke test succeeds.

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

- [ ] **Step 3: Smoke-test `/gappers` in the browser**

Open the local `/gappers` URL. Verify:

- The page is inside the authenticated app shell.
- The nav includes `Gappers`.
- The mode label and last-updated timestamp are visible.
- The Refresh button is visible and can be pressed.
- Filter inputs and Stock/ETF toggles render without layout overlap.
- The table renders rows, an empty state, or a Massive configuration/error state.

- [ ] **Step 4: Capture screenshot**

Save a screenshot as:

```text
docs/screenshots/gappers-page.png
```

- [ ] **Step 5: Commit verification artifact if created**

Run:

```bash
git add docs/screenshots/gappers-page.png
git commit -m "Add gappers page screenshot"
```

Skip this commit if the environment cannot authenticate locally or cannot produce a meaningful screenshot.

---

## Self-Review Notes

- Spec coverage: the plan covers Massive server-only access, listed common stocks plus ETFs, OTC/fund exclusion, extended-hours windows, regular-session mode, configurable filters, manual refresh, 15-minute auto-refresh, navigation, UI states, tests, CI commands, and browser screenshot.
- Placeholder scan: this plan uses concrete file paths, commands, default values, and code snippets.
- Type consistency: `GappersMode`, `GappersRow`, `GappersSnapshot`, `GappersFilters`, and `GappersDataProvider` are introduced before use and reused consistently.
