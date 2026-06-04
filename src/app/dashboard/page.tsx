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
  t2108Color,
  type BreadthBias,
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
      <div className="mt-4 grid gap-3 md:grid-cols-[1.35fr_0.9fr_1.5fr]">
        <div className="rounded border border-white/10 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">Breadth pressure</div>
          <div className="mt-2 grid gap-2">
            <BreadthPressureRow
              bias={breadth.fourPercentBias}
              down={breadth.down4Percent}
              label="4% today"
              up={breadth.up4Percent}
            />
            <BreadthPressureRow
              bias={breadth.thirteenThirtyFourBias}
              down={breadth.down13In34Days}
              label="13/34"
              up={breadth.up13In34Days}
            />
          </div>
        </div>
        <div className="rounded border border-white/10 bg-black/20 p-3">
          <div className="text-xs text-zinc-500">T2108</div>
          <div
            className="mt-2 font-mono text-2xl font-semibold"
            style={{ color: t2108Color(breadth.t2108) }}
          >
            {formatBreadthPercent(breadth.t2108)}
          </div>
          <div
            aria-hidden="true"
            className="mt-3 h-1.5 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, #22c55e 0%, #eab308 55%, #f97316 75%, #ef4444 100%)",
            }}
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
            <span>Low</span>
            <span>High</span>
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

function BreadthPressureRow({
  bias,
  down,
  label,
  up,
}: {
  bias: BreadthBias;
  down: number | null;
  label: string;
  up: number | null;
}) {
  return (
    <div className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 font-mono text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={bias === "up" ? "text-base font-semibold text-emerald-300" : "text-zinc-300"}>
          {formatBreadthCount(up)}
        </span>
        <span className="text-zinc-500">up</span>
        <span className={bias === "down" ? "text-base font-semibold text-rose-300" : "text-zinc-300"}>
          {formatBreadthCount(down)}
        </span>
        <span className="text-zinc-500">down</span>
      </span>
      <span
        className={`rounded px-2 py-1 text-[10px] font-semibold ${
          bias === "up"
            ? "bg-emerald-400/15 text-emerald-200"
            : bias === "down"
              ? "bg-rose-400/15 text-rose-200"
              : "bg-zinc-800 text-zinc-400"
        }`}
      >
        {breadthBiasLabel(bias)}
      </span>
    </div>
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

function breadthBiasLabel(value: BreadthBias) {
  if (value === "up") {
    return "More up";
  }
  if (value === "down") {
    return "More down";
  }
  if (value === "flat") {
    return "Even";
  }

  return "--";
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
