import { AppShell } from "@/components/app-shell";
import { SyncButton } from "@/components/sync-button";
import { getTradeZeroConfig } from "@/lib/env";
import { requireUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/app-data";
import { formatDateTime } from "@/components/format";
import { getTradeZeroSafetyStatus } from "@/lib/tradezero/safety";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const data = await getDashboardData(user.id);
  const tradeZeroConfigured = getTradeZeroConfig() != null;
  const safetyStatus = getTradeZeroSafetyStatus();

  return (
    <AppShell user={user}>
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="mt-4 rounded-md border border-white/10 bg-white/[0.045] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">TradeZero connection</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Status: {tradeZeroConfigured ? "server credentials configured" : "missing server credentials"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Safety: {safetyStatus.canSync ? "read-only key and broker 2FA confirmed" : `blocked until ${safetyStatus.missing.join(", ")} is set`}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Last snapshot: {formatDateTime(data.latestSnapshotAt)}
            </p>
          </div>
          <SyncButton />
        </div>
      </section>
    </AppShell>
  );
}
