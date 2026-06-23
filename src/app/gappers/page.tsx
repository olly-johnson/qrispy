import { AppShell } from "@/components/app-shell";
import { GappersTable } from "@/components/gappers-table";
import { MarketContextCard } from "@/components/market-context-card";
import { requireUser } from "@/lib/auth/session";
import { getMarketContextConfig } from "@/lib/env";
import { buildGappersSnapshot } from "@/lib/market-data/gappers";
import {
  parseGappersFiltersSearchParams,
  serializeGappersFiltersSearchParams,
} from "@/lib/market-data/gappers-client";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";
import {
  createOpenAiMarketContextProvider,
  loadMarketContextBrief,
} from "@/lib/market-data/market-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GappersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const filters = parseGappersFiltersSearchParams(await searchParams);
  const filtersKey = serializeGappersFiltersSearchParams(filters).toString();
  const [snapshot, marketContext] = await Promise.all([
    buildGappersSnapshot({
      filters,
      provider: createMassiveMarketDataProvider(),
    }),
    loadGappersMarketContext(),
  ]);

  return (
    <AppShell user={user}>
      <MarketContextCard result={marketContext} variant="gappers" />
      <GappersTable
        error={snapshot.error}
        initialFilters={filters}
        key={filtersKey}
        loadedAt={snapshot.loadedAt}
        mode={snapshot.mode}
        rows={snapshot.rows}
      />
    </AppShell>
  );
}

async function loadGappersMarketContext() {
  const config = getMarketContextConfig();
  return loadMarketContextBrief({
    client: createSupabaseAdminClient(),
    provider: config ? createOpenAiMarketContextProvider(config) : null,
  });
}
