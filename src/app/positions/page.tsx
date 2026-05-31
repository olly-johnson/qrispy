import { Fragment } from "react";

import { updateTradeStopLoss } from "@/app/actions";
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
              <Fragment key={position.id}>
                <tr>
                  <td className="px-4 py-3 font-mono text-cyan-200">
                    {position.symbol}
                  </td>
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
                {position.stopGroups.length > 0 ? (
                  <tr>
                    <td className="bg-black/20 px-4 pb-4" colSpan={5}>
                      <div className="overflow-hidden rounded-md border border-white/10">
                        <table className="w-full min-w-[760px] text-xs">
                          <thead className="bg-white/[0.035] uppercase tracking-[0.12em] text-zinc-500">
                            <tr>
                              <th className="px-3 py-2 text-left">Entry date</th>
                              <th className="px-3 py-2 text-left">Direction</th>
                              <th className="px-3 py-2 text-right">Quantity</th>
                              <th className="px-3 py-2 text-right">Entry</th>
                              <th className="px-3 py-2 text-right">Stop loss</th>
                              <th className="px-3 py-2 text-right">Unrealised at stop</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/10">
                            {position.stopGroups.map((group) => (
                              <tr key={group.tradeId}>
                                <td className="px-3 py-2 font-mono text-zinc-300">
                                  {formatEntryDate(group.entryDate)}
                                </td>
                                <td className="px-3 py-2 font-mono text-zinc-300">
                                  {group.direction}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {group.quantity ?? "--"}
                                </td>
                                <td className="px-3 py-2 text-right font-mono">
                                  {formatMoney(group.avgEntryPrice)}
                                </td>
                                <td className="px-3 py-2">
                                  <form
                                    action={updateTradeStopLoss.bind(null, group.tradeId)}
                                    className="ml-auto flex max-w-44 items-center justify-end gap-2"
                                  >
                                    <input
                                      aria-label={`${position.symbol} ${group.entryDate} stop loss`}
                                      className="h-8 w-24 rounded-md border border-white/10 bg-black/30 px-2 text-right font-mono text-sm text-zinc-100 outline-none focus:border-cyan-300"
                                      defaultValue={group.stopLossPrice ?? ""}
                                      inputMode="decimal"
                                      min="0"
                                      name="stopLoss"
                                      required
                                      step="0.0001"
                                      type="number"
                                    />
                                    <button
                                      className="h-8 rounded-md bg-cyan-300 px-3 text-xs font-semibold text-zinc-950 hover:bg-cyan-200"
                                      type="submit"
                                    >
                                      Save
                                    </button>
                                  </form>
                                </td>
                                <td
                                  className={`px-3 py-2 text-right font-mono ${pnlClass(group.stopUnrealizedPnl)}`}
                                >
                                  {formatMoney(group.stopUnrealizedPnl)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
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

function formatEntryDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function pnlClass(value: number | null) {
  if (value == null) {
    return "text-zinc-300";
  }

  return value >= 0 ? "text-emerald-300" : "text-rose-300";
}
