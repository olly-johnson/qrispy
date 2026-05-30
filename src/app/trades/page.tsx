import Link from "next/link";
import { BarChart3 } from "lucide-react";

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
              <th className="px-4 py-3 text-right">Analyse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {trades.map((trade) => (
              <tr key={trade.id} className="transition hover:bg-white/[0.035]">
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
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/trades/${trade.id}`}
                    className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-200 transition hover:border-cyan-300/50 hover:text-cyan-200"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {trades.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-zinc-500" colSpan={7}>
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
