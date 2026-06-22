import { AppShell } from "@/components/app-shell";
import { TradeHistoryTable } from "@/components/trade-history-table";
import { requireUser } from "@/lib/auth/session";
import { getTradeHistory } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const user = await requireUser();
  const trades = await getTradeHistory(user.id);

  return (
    <AppShell user={user}>
      <h1 className="text-2xl font-semibold">Trades</h1>
      <TradeHistoryTable items={trades} />
    </AppShell>
  );
}
