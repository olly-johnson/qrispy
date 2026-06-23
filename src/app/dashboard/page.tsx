import Link from "next/link";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { formatDateTime, formatMoney, formatPercent } from "@/components/format";
import { MarketContextCard } from "@/components/market-context-card";
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
  createOpenAiMarketContextProvider,
  loadMarketContextBrief,
} from "@/lib/market-data/market-context";
import { getMarketContextConfig } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  dashboardOpenPositions,
  dashboardPositionTradeHref,
  dashboardPositionUnrealizedValue,
} from "@/lib/positions/display";
import { describeLatestSyncJob } from "@/lib/sync/job-status";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [data, breadth, marketContext] = await Promise.all([
    getDashboardData(user.id),
    loadDashboardBreadth(),
    loadDashboardMarketContext(),
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

      <MarketContextCard result={marketContext} variant="dashboard" />

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
        <DashboardExpectancyCard expectancy={data.expectancy} />
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

async function loadDashboardMarketContext() {
  const config = getMarketContextConfig();
  const client = createSupabaseAdminClient();
  return loadMarketContextBrief({
    client,
    provider: config ? createOpenAiMarketContextProvider(config) : null,
  });
}

function DashboardExpectancyCard({
  expectancy,
}: {
  expectancy: Awaited<ReturnType<typeof getDashboardData>>["expectancy"];
}) {
  const snapshots = [expectancy.all, expectancy.last30];

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.045] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Reward:Risk vs Batting Average
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Closed reconstructed trades
          </p>
        </div>
        <div className="font-mono text-xs text-zinc-500">
          Break-even curve
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <ExpectancyChart snapshots={snapshots} />
        <div className="grid gap-3">
          {snapshots.map((snapshot) => (
            <div
              className="rounded border border-white/10 bg-black/20 p-3"
              key={snapshot.label}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                  {snapshot.label}
                </div>
                <div className="font-mono text-xs text-zinc-500">
                  {snapshot.tradeCount} trades
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
                <ExpectancyStat
                  label="Batting avg"
                  value={formatPercent(snapshot.battingAverage)}
                />
                <ExpectancyStat
                  label="Avg gain"
                  value={formatMoney(snapshot.averageGain)}
                  valueClassName="text-emerald-300"
                />
                <ExpectancyStat
                  label="Avg loss"
                  value={formatMoney(snapshot.averageLoss)}
                  valueClassName="text-rose-300"
                />
                <ExpectancyStat
                  label="Gain/loss"
                  value={formatRatio(snapshot.gainLossRatio)}
                  valueClassName="text-cyan-200"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ExpectancyChart({
  snapshots,
}: {
  snapshots: Awaited<ReturnType<typeof getDashboardData>>["expectancy"][keyof Awaited<
    ReturnType<typeof getDashboardData>
  >["expectancy"]][];
}) {
  const width = 640;
  const height = 320;
  const padding = { top: 20, right: 22, bottom: 42, left: 54 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xMin = 0.2;
  const xMax = 0.7;
  const yMin = 0;
  const yMax = 4;
  const xTicks = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  const yTicks = [0, 1, 2, 3, 4];
  const points = Array.from({ length: 80 }, (_, index) => {
    const x = xMin + ((xMax - xMin) * index) / 79;
    return [xToPixel(x), yToPixel(breakEvenRewardRisk(x))] as const;
  });
  const curvePath = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const belowCurvePath = `${curvePath} L ${padding.left + plotWidth} ${
    padding.top + plotHeight
  } L ${padding.left} ${padding.top + plotHeight} Z`;
  const aboveCurvePath = `M ${padding.left} ${padding.top} L ${
    padding.left + plotWidth
  } ${padding.top} L ${points
    .toReversed()
    .map(([x, y]) => `${x} ${y}`)
    .join(" L ")} Z`;

  function xToPixel(value: number) {
    const clamped = clamp(value, xMin, xMax);
    return padding.left + ((clamped - xMin) / (xMax - xMin)) * plotWidth;
  }

  function yToPixel(value: number) {
    const clamped = clamp(value, yMin, yMax);
    return padding.top + plotHeight - ((clamped - yMin) / (yMax - yMin)) * plotHeight;
  }

  return (
    <div className="min-w-0 rounded border border-white/10 bg-black/20 p-3">
      <svg
        aria-label="Break-even reward:risk curve plotted against batting average"
        className="h-auto w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect fill="#09090b" height={height} rx="6" width={width} />
        <path d={aboveCurvePath} fill="#16a34a" opacity="0.12" />
        <path d={belowCurvePath} fill="#e11d48" opacity="0.09" />
        {xTicks.map((tick) => (
          <g key={tick}>
            <line
              stroke="#27272a"
              strokeWidth="1"
              x1={xToPixel(tick)}
              x2={xToPixel(tick)}
              y1={padding.top}
              y2={padding.top + plotHeight}
            />
            <text
              fill="#71717a"
              fontSize="12"
              textAnchor="middle"
              x={xToPixel(tick)}
              y={height - 16}
            >
              {Math.round(tick * 100)}%
            </text>
          </g>
        ))}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              stroke="#27272a"
              strokeWidth="1"
              x1={padding.left}
              x2={padding.left + plotWidth}
              y1={yToPixel(tick)}
              y2={yToPixel(tick)}
            />
            <text
              fill="#71717a"
              fontSize="12"
              textAnchor="end"
              x={padding.left - 10}
              y={yToPixel(tick) + 4}
            >
              {tick}
            </text>
          </g>
        ))}
        <line
          stroke="#3f3f46"
          strokeWidth="1.5"
          x1={padding.left}
          x2={padding.left}
          y1={padding.top}
          y2={padding.top + plotHeight}
        />
        <line
          stroke="#3f3f46"
          strokeWidth="1.5"
          x1={padding.left}
          x2={padding.left + plotWidth}
          y1={padding.top + plotHeight}
          y2={padding.top + plotHeight}
        />
        <path d={curvePath} fill="none" stroke="#38bdf8" strokeWidth="4" />
        <text fill="#22c55e" fontSize="18" fontWeight="700" x={width - 210} y="72">
          Profitable
        </text>
        <text fill="#fb7185" fontSize="18" fontWeight="700" x={padding.left + 28} y={height - 86}>
          Losing
        </text>
        {snapshots.map((snapshot, index) => (
          <ExpectancyMarker
            index={index}
            key={snapshot.label}
            snapshot={snapshot}
            xToPixel={xToPixel}
            yToPixel={yToPixel}
          />
        ))}
        <text fill="#a1a1aa" fontSize="12" textAnchor="middle" x={width / 2} y={height - 2}>
          Batting average
        </text>
        <text
          fill="#a1a1aa"
          fontSize="12"
          textAnchor="middle"
          transform={`rotate(-90 14 ${height / 2})`}
          x="14"
          y={height / 2}
        >
          Avg gain / avg loss
        </text>
      </svg>
    </div>
  );
}

function ExpectancyMarker({
  index,
  snapshot,
  xToPixel,
  yToPixel,
}: {
  index: number;
  snapshot: Awaited<ReturnType<typeof getDashboardData>>["expectancy"][keyof Awaited<
    ReturnType<typeof getDashboardData>
  >["expectancy"]];
  xToPixel: (value: number) => number;
  yToPixel: (value: number) => number;
}) {
  if (snapshot.battingAverage == null || snapshot.gainLossRatio == null) {
    return null;
  }

  const color = index === 0 ? "#facc15" : "#a78bfa";
  const x = xToPixel(snapshot.battingAverage);
  const y = yToPixel(snapshot.gainLossRatio);
  const labelY = y - 14 < 18 ? y + 24 : y - 14;

  return (
    <g>
      <circle cx={x} cy={y} fill={color} r="7" stroke="#09090b" strokeWidth="3" />
      <text
        fill={color}
        fontSize="12"
        fontWeight="700"
        textAnchor="middle"
        x={x}
        y={labelY}
      >
        {snapshot.label}
      </text>
    </g>
  );
}

function ExpectancyStat({
  label,
  value,
  valueClassName = "text-zinc-100",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className={`mt-1 font-mono text-sm font-semibold ${valueClassName}`}>
        {value}
      </div>
    </div>
  );
}

function breakEvenRewardRisk(winRate: number) {
  return (1 - winRate) / winRate;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatRatio(value: number | null) {
  if (value == null) {
    return "--";
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value)}:1`;
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
    <div className="grid grid-cols-[4rem_1fr] items-center gap-3 font-mono text-xs">
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
