import { AppShell } from "@/components/app-shell";
import { SectorBreadthView } from "@/components/sector-breadth-view";
import { requireUser } from "@/lib/auth/session";
import { getCachedOrFetchBars } from "@/lib/market-data/cache";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";
import {
  buildCommonStockUniverse,
  normalizeMarketSnapshotTicker,
  type NormalizedMarketSnapshot,
} from "@/lib/market-data/market-universe";
import {
  buildSectorBreadthSnapshot,
  calculateHistoricalBreadthMetrics,
} from "@/lib/market-data/sector-breadth";
import { readStockClassifications } from "@/lib/market-data/sector-classifications";
import type { OhlcvBar } from "@/lib/market-data/types";
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
      error:
        "Supabase service role is not configured, so stock classifications cannot be read.",
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
      .filter(
        (snapshot): snapshot is NormalizedMarketSnapshot => snapshot != null,
      )
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
          ((snapshot.price - snapshot.previousClose) / snapshot.previousClose) *
          100;
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
  const barsBySymbol = new Map<string, OhlcvBar[]>();

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
