import { AppShell } from "@/components/app-shell";
import { ChartExplorer } from "@/components/chart-explorer";
import { ChartExplorerForm } from "@/components/chart-explorer-form";
import { requireUser } from "@/lib/auth/session";
import {
  getChartExplorerDatasets,
  parseChartExplorerSearchParams,
} from "@/lib/market-data/chart-explorer";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const filters = parseChartExplorerSearchParams(await searchParams);
  const result = await getChartExplorerDatasets({
    client: createSupabaseAdminClient(),
    filters,
    provider: createMassiveMarketDataProvider(),
  });

  return (
    <AppShell user={user}>
      <div>
        <h1 className="text-2xl font-semibold">Charts</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Compare daily context with regular-session intraday price action.
        </p>
        <ChartExplorerForm initialFilters={filters} />
        <ChartExplorer result={result} />
      </div>
    </AppShell>
  );
}
