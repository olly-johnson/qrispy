import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { formatDateTime, formatMoney, formatPercent } from "@/components/format";
import { MetricCard, ProvenanceIcon } from "@/components/metric-card";
import { SyncButton } from "@/components/sync-button";
import { requireUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/app-data";
import {
  dashboardPositionTradeHref,
  dashboardPositionUnrealizedValue,
} from "@/lib/positions/display";
import { describeLatestSyncJob } from "@/lib/sync/job-status";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getDashboardData(user.id);
  const { metrics } = data.summary;
  const latestJob = data.jobs[0];

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Portfolio</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Latest broker snapshot: {formatDateTime(data.latestSnapshotAt)}
          </p>
          {latestJob ? (
            <p className="mt-1 text-sm text-emerald-200">
              {describeLatestSyncJob(latestJob)}
            </p>
          ) : null}
        </div>
        <SyncButton />
      </div>

      {!data.hasData ? (
        <section className="mt-6 rounded-md border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm text-amber-100">
          TradeZero credentials are server-side. Run a sync once Supabase, Inngest,
          and TradeZero environment variables are configured.
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Equity"
          metric={metrics.equity}
          value={formatMoney(metrics.equity.value)}
          accent="emerald"
        />
        <MetricCard label="Cash" value={formatMoney(metrics.cash.value)} />
        <MetricCard
          label="Buying Power"
          value={formatMoney(metrics.buyingPower.value)}
          accent="amber"
        />
        <MetricCard
          label="Percent Invested"
          value={formatPercent(metrics.percentInvested.value)}
          accent="rose"
        />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Gross Exposure"
          value={formatMoney(metrics.grossExposure.value)}
        />
        <MetricCard
          label="Long Exposure"
          value={formatMoney(metrics.longExposure.value)}
          accent="emerald"
        />
        <MetricCard
          label="Short Exposure"
          value={formatMoney(metrics.shortExposure.value)}
          accent="rose"
        />
        <MetricCard
          label="Realized P&L"
          value={formatMoney(metrics.realizedPnl.value)}
          accent="amber"
        />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Open positions</h2>
            <ProvenanceIcon metric={metrics.grossExposure} />
          </div>
          <PositionsTable positions={data.positions.slice(0, 6)} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent trades</h2>
          <TradesTable trades={data.trades.slice(0, 6)} />
        </section>
      </div>
    </AppShell>
  );
}

function PositionsTable({
  positions,
}: {
  positions: Awaited<ReturnType<typeof getDashboardData>>["positions"];
}) {
  return (
    <div className="overflow-hidden rounded-md border border-white/10">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
          <tr>
            <th className="px-4 py-3">Symbol</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Avg</th>
            <th className="px-4 py-3 text-right">Unrealized</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {positions.map((position) => {
            const href = dashboardPositionTradeHref(position);
            const stopUnrealizedValue = dashboardPositionUnrealizedValue(position);

            return (
              <tr className={href ? "hover:bg-white/[0.03]" : undefined} key={position.id}>
                <td className="font-mono text-cyan-200">
                  <PositionCell href={href}>{position.symbol}</PositionCell>
                </td>
                <td className="text-right font-mono">
                  <PositionCell href={href}>{position.quantity}</PositionCell>
                </td>
                <td className="text-right font-mono">
                  <PositionCell href={href}>
                    {formatMoney(position.averagePrice)}
                  </PositionCell>
                </td>
                <td className={`text-right font-mono ${pnlClass(stopUnrealizedValue)}`}>
                  <PositionCell href={href}>{formatMoney(stopUnrealizedValue)}</PositionCell>
                </td>
              </tr>
            );
          })}
          {positions.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-zinc-500" colSpan={4}>
                No positions synced yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function PositionCell({
  children,
  href,
}: {
  children: ReactNode;
  href: string | null;
}) {
  const className = "block px-4 py-3";

  if (!href) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}

function pnlClass(value: number | null) {
  if (value == null) {
    return "text-zinc-300";
  }

  return value >= 0 ? "text-emerald-300" : "text-rose-300";
}

function TradesTable({
  trades,
}: {
  trades: Awaited<ReturnType<typeof getDashboardData>>["trades"];
}) {
  return (
    <div className="overflow-hidden rounded-md border border-white/10">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
          <tr>
            <th className="px-4 py-3">Symbol</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Direction</th>
            <th className="px-4 py-3 text-right">Realized</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {trades.map((trade) => (
            <tr key={trade.id}>
              <td className="px-4 py-3 font-mono text-cyan-200">{trade.symbol}</td>
              <td className="px-4 py-3">{trade.status}</td>
              <td className="px-4 py-3">{trade.direction}</td>
              <td className="px-4 py-3 text-right font-mono">
                {formatMoney(trade.realizedPnl)}
              </td>
            </tr>
          ))}
          {trades.length === 0 ? (
            <tr>
              <td className="px-4 py-6 text-zinc-500" colSpan={4}>
                No reconstructed trades yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
