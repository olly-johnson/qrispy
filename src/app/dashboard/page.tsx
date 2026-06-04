import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { formatDateTime, formatMoney, formatPercent } from "@/components/format";
import { MetricCard, ProvenanceIcon } from "@/components/metric-card";
import { SyncButton } from "@/components/sync-button";
import { requireUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/app-data";
import {
  buildDashboardBreadthSnapshot,
  getMarketIndexBreadthSummaries,
  getStockbeeMarketBreadth,
  type DashboardBreadthSnapshot,
} from "@/lib/market-data/breadth";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";
import {
  dashboardOpenPositions,
  dashboardPositionTradeHref,
  dashboardPositionUnrealizedValue,
} from "@/lib/positions/display";
import { describeLatestSyncJob } from "@/lib/sync/job-status";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [data, breadth] = await Promise.all([
    getDashboardData(user.id),
    loadDashboardBreadth(),
  ]);
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

      <section className="mt-4">
        <DashboardBreadthCard breadth={breadth} />
      </section>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Open positions</h2>
            <ProvenanceIcon metric={metrics.grossExposure} />
          </div>
          <PositionsTable positions={dashboardOpenPositions(data.positions)} />
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent trades</h2>
          <TradesTable trades={data.trades.slice(0, 6)} />
        </section>
      </div>
    </AppShell>
  );
}

async function loadDashboardBreadth() {
  try {
    const [breadth, indexes] = await Promise.all([
      getStockbeeMarketBreadth({ rowLimit: 1 }),
      getMarketIndexBreadthSummaries({
        provider: createMassiveMarketDataProvider(),
        symbols: ["SPY", "QQQ"],
      }),
    ]);

    return buildDashboardBreadthSnapshot(breadth, indexes);
  } catch {
    return buildDashboardBreadthSnapshot(
      { latest: null, tableRows: [], chartRows: [] },
      await getMarketIndexBreadthSummaries({
        provider: null,
        symbols: ["SPY", "QQQ"],
      }),
    );
  }
}

function DashboardBreadthCard({
  breadth,
}: {
  breadth: DashboardBreadthSnapshot;
}) {
  return (
    <Link
      className="block rounded-md border border-white/10 bg-white/[0.04] p-4 transition hover:border-cyan-300/40 hover:bg-white/[0.06]"
      href="/market-breadth"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Market Breadth
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {breadth.date ? `Latest Stockbee row: ${formatShortDate(breadth.date)}` : "Latest breadth unavailable"}
          </p>
        </div>
        <div className="font-mono text-sm font-semibold text-cyan-200">View</div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1.5fr]">
        <div className="rounded border border-white/10 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">13% in 34 days</div>
          <div className="mt-2 flex items-baseline justify-between gap-3 font-mono">
            <span className="text-lg font-semibold text-emerald-300">
              {formatBreadthCount(breadth.up13In34Days)}
            </span>
            <span className="text-xs text-zinc-500">up</span>
            <span className="text-lg font-semibold text-rose-300">
              {formatBreadthCount(breadth.down13In34Days)}
            </span>
            <span className="text-xs text-zinc-500">down</span>
          </div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">T2108</div>
          <div className="mt-2 font-mono text-2xl font-semibold text-white">
            {formatBreadthPercent(breadth.t2108)}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {breadth.indexes.map((index) => (
              <div key={index.symbol}>
                <div className="font-mono text-sm font-semibold text-white">
                  {index.symbol}
                </div>
                <div className="mt-2 grid gap-1 text-xs text-zinc-400">
                  <MiniStatus label=">10" value={index.priceAboveSma10} />
                  <MiniStatus label=">20" value={index.priceAboveSma20} />
                  <MiniStatus label="10>20" value={index.sma10AboveSma20} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}

function MiniStatus({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className={value == null ? "text-zinc-500" : value ? "text-emerald-300" : "text-rose-300"}>
        {value == null ? "--" : value ? "Yes" : "No"}
      </span>
    </div>
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

function formatBreadthCount(value: number | null) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatBreadthPercent(value: number | null) {
  if (value == null) {
    return "--";
  }

  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatShortDate(value: string) {
  const [, month, day] = value.split("-");

  return `${Number(month)}/${Number(day)}`;
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
