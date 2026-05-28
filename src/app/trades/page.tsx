import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { formatDateTime, formatMoney } from "@/components/format";
import { requireUser } from "@/lib/auth/session";
import { getTradeHistory } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const user = await requireUser();
  const trades = await getTradeHistory(user.id);

  return (
    <AppShell user={user}>
      <h1 className="text-2xl font-semibold">Trades</h1>
      <div className="mt-4 overflow-hidden rounded-md border border-white/10">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Opened</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Direction</th>
              <th className="px-4 py-3 text-right">Realized</th>
              <th className="px-4 py-3 text-right">Fees</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td className="px-4 py-3">
                  <Link href={`/trades/${trade.id}`} className="font-mono text-cyan-200">
                    {trade.symbol}
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-400">{formatDateTime(trade.openedAt)}</td>
                <td className="px-4 py-3">{trade.status}</td>
                <td className="px-4 py-3">{trade.direction}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatMoney(trade.realizedPnl)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatMoney(trade.totalFees)}
                </td>
              </tr>
            ))}
            {trades.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-zinc-500" colSpan={6}>
                  Sync TradeZero to reconstruct trades.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
