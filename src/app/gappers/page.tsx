import { AppShell } from "@/components/app-shell";
import { GappersTable } from "@/components/gappers-table";
import { requireUser } from "@/lib/auth/session";
import { buildGappersSnapshot } from "@/lib/market-data/gappers";
import {
  parseGappersFiltersSearchParams,
  serializeGappersFiltersSearchParams,
} from "@/lib/market-data/gappers-client";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";

export const dynamic = "force-dynamic";

export default async function GappersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const filters = parseGappersFiltersSearchParams(await searchParams);
  const filtersKey = serializeGappersFiltersSearchParams(filters).toString();
  const snapshot = await buildGappersSnapshot({
    filters,
    provider: createMassiveMarketDataProvider(),
  });

  return (
    <AppShell user={user}>
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
