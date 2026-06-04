import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { formatDateTime, formatMoney } from "@/components/format";
import { TradeChartPanel } from "@/components/trade-chart-panel";
import { requireUser } from "@/lib/auth/session";
import { getTradeDetail } from "@/lib/app-data";
import { tradeHeadlinePnlValue } from "@/lib/trades/display";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const trade = await getTradeDetail(user.id, id);

  if (!trade) {
    notFound();
  }

  const priceMove =
    trade.avgEntryPrice != null && trade.avgExitPrice != null
      ? trade.direction === "LONG"
        ? trade.avgExitPrice - trade.avgEntryPrice
        : trade.avgEntryPrice - trade.avgExitPrice
      : null;
  const pnlPerShare =
    trade.realizedPnl != null && trade.entryQuantity
      ? trade.realizedPnl / trade.entryQuantity
      : null;
  const headlinePnl = tradeHeadlinePnlValue(trade);

  return (
    <AppShell user={user}>
      <Link
        href="/trades"
        className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-cyan-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Trades
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-cyan-200">
            {trade.symbol}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {trade.direction} - {trade.status}
          </p>
        </div>
        <div className={`text-right font-mono text-2xl ${pnlClass(headlinePnl)}`}>
          {formatMoney(headlinePnl)}
        </div>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Detail label="Opened" value={formatDateTime(trade.openedAt)} />
        <Detail label="Closed" value={formatDateTime(trade.closedAt)} />
        <Detail label="Entry Qty" value={formatQuantity(trade.entryQuantity)} />
        <Detail label="Max Size" value={formatQuantity(trade.maxAbsQuantity)} />
        <Detail label="Avg Entry" value={formatPrice(trade.avgEntryPrice)} />
        <Detail label="Avg Exit" value={formatPrice(trade.avgExitPrice)} />
        <Detail label="Move / Share" value={formatPrice(priceMove)} />
        <Detail label="P&L / Share" value={formatPrice(pnlPerShare)} />
        <Detail label="Fees" value={formatMoney(trade.totalFees)} />
      </section>

      <TradeChartPanel charts={trade.charts} stopGroups={trade.stopGroups} />

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Fill Path</h2>
        <div className="mt-4 overflow-hidden rounded-md border border-white/10">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
              <tr>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3 text-right">Allocated</th>
                <th className="px-4 py-3 text-right">Fill Qty</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Fees</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {trade.fills.map((fill) => (
                <tr key={`${fill.id}:${fill.allocationRole}`}>
                  <td className="px-4 py-3 text-zinc-100">{fill.allocationRole}</td>
                  <td className="px-4 py-3 text-zinc-400">
                    {formatDateTime(fill.executedAt)}
                  </td>
                  <td className="px-4 py-3">{fill.side}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatQuantity(fill.allocatedQuantity)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatQuantity(fill.fillQuantity)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatPrice(fill.allocationPrice ?? fill.price)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatMoney(fill.commission + fill.fees)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                    {fill.sourceFillId ?? fill.id}
                  </td>
                </tr>
              ))}
              {trade.fills.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-zinc-500" colSpan={8}>
                    Sync TradeZero again to populate fill allocations for this trade.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 rounded-md border border-white/10 bg-white/[0.045] p-4">
        <h2 className="text-lg font-semibold">Analysis</h2>
        <p className="mt-2 text-sm text-zinc-500">
          This view is built from reconstructed fills, so it is the first place to audit
          odd P&L, partial exits, flips, and trades that carried over from earlier fills.
        </p>
      </section>
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.045] p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-3 font-mono text-sm text-zinc-100">{value}</div>
    </div>
  );
}

function pnlClass(value: number | null) {
  if (value == null) {
    return "text-zinc-300";
  }

  return value >= 0 ? "text-emerald-300" : "text-rose-300";
}

function formatQuantity(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
  }).format(value);
}

function formatPrice(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}
