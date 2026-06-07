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
