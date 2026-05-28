import { AppShell } from "@/components/app-shell";
import { formatMoney } from "@/components/format";
import { requireUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const user = await requireUser();
  const data = await getDashboardData(user.id);

  return (
    <AppShell user={user}>
      <h1 className="text-2xl font-semibold">Positions</h1>
      <div className="mt-4 overflow-hidden rounded-md border border-white/10">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3 text-right">Quantity</th>
              <th className="px-4 py-3 text-right">Average</th>
              <th className="px-4 py-3 text-right">Market Value</th>
              <th className="px-4 py-3 text-right">Unrealized</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {data.positions.map((position) => (
              <tr key={position.id}>
                <td className="px-4 py-3 font-mono text-cyan-200">{position.symbol}</td>
                <td className="px-4 py-3 text-right font-mono">{position.quantity}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatMoney(position.averagePrice)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatMoney(position.marketValue)}
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatMoney(position.unrealizedPnl)}
                </td>
              </tr>
            ))}
            {data.positions.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-zinc-500" colSpan={5}>
                  No current positions have been synced.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
