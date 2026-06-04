import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth/session";
import {
  getMarketIndexBreadthSummaries,
  getStockbeeMarketBreadth,
  type MarketBreadthSnapshot,
  type MarketIndexBreadthSummary,
  type StockbeeBreadthRow,
} from "@/lib/market-data/breadth";
import { createMassiveMarketDataProvider } from "@/lib/market-data/massive";

export const dynamic = "force-dynamic";

const STOCKBEE_PAGE_URL = "https://stockbee.blogspot.com/p/mm.html";
const STOCKCHARTS_NYMO_IMAGE_URL = "/api/market-breadth/stockcharts/nymo";
const STOCKCHARTS_NASI_IMAGE_URL = "/api/market-breadth/stockcharts/nasi";

export default async function MarketBreadthPage() {
  const user = await requireUser();
  const [breadthResult, indexCards] = await Promise.all([
    loadBreadthSnapshot(),
    loadMarketIndexCards(),
  ]);

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Market Breadth</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Advance/decline pressure, momentum participation, and moving-average status
          </p>
        </div>
        <ExternalTextLink href={STOCKBEE_PAGE_URL}>
          Stockbee Market Monitor
        </ExternalTextLink>
      </div>

      {breadthResult.error ? (
        <section className="mt-6 rounded-md border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm text-amber-100">
          {breadthResult.error}
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indexCards.map((summary) => (
          <IndexStatusCard key={summary.symbol} summary={summary} />
        ))}
      </section>

      <BreadthCharts snapshot={breadthResult.snapshot} />
      <StockChartsPanels />
      <BreadthTable rows={breadthResult.snapshot.tableRows} />
    </AppShell>
  );
}

async function loadMarketIndexCards() {
  try {
    return await getMarketIndexBreadthSummaries({
      provider: createMassiveMarketDataProvider(),
    });
  } catch {
    return getMarketIndexBreadthSummaries({ provider: null });
  }
}

async function loadBreadthSnapshot() {
  try {
    return {
      snapshot: await getStockbeeMarketBreadth(),
      error: null,
    };
  } catch (error) {
    return {
      snapshot: { latest: null, tableRows: [], chartRows: [] } satisfies MarketBreadthSnapshot,
      error: `Stockbee Market Monitor unavailable: ${errorMessage(error)}`,
    };
  }
}

function IndexStatusCard({ summary }: { summary: MarketIndexBreadthSummary }) {
  return (
    <article className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="font-mono text-sm font-semibold text-white">{summary.symbol}</div>
      <div className="mt-3 font-mono text-2xl font-semibold">
        {formatMarketPrice(summary.price)}
      </div>
      <div className="mt-4 space-y-2 text-xs text-zinc-400 min-[1180px]:text-sm">
        <StatusRow label="Price > 10 SMA" value={summary.priceAboveSma10} />
        <StatusRow label="Price > 20 SMA" value={summary.priceAboveSma20} />
        <div className="border-t border-white/10 pt-2">
          <StatusRow label="10 SMA > 20 SMA" value={summary.sma10AboveSma20} />
        </div>
        <StatusRow label="50 SMA > 200 SMA" value={summary.sma50AboveSma200} />
      </div>
    </article>
  );
}

function StatusRow({ label, value }: { label: string; value: boolean | null }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="whitespace-nowrap">{label}</span>
      <span
        className={`inline-flex min-w-14 items-center justify-center rounded px-2 py-1 font-mono text-[11px] font-semibold ${
          value == null
            ? "bg-zinc-800 text-zinc-400"
            : value
              ? "bg-emerald-400/20 text-emerald-200"
              : "bg-rose-400/20 text-rose-200"
        }`}
      >
        {value == null ? "No data" : value ? "Above" : "Below"}
      </span>
    </div>
  );
}

function BreadthCharts({ snapshot }: { snapshot: MarketBreadthSnapshot }) {
  const rows = snapshot.chartRows;

  return (
    <div className="mt-6 grid gap-4 xl:grid-cols-2">
      <ChartCard title="4% Breadth (Up vs Down)">
        <BarComparisonChart
          rows={rows}
          series={[
            { color: "#34d399", getValue: (row) => row.up4Percent, label: "Up 4%" },
            { color: "#fb7185", getValue: (row) => row.down4Percent, label: "Down 4%" },
          ]}
        />
      </ChartCard>
      <ChartCard title="Breadth Ratios (5d / 10d)">
        <LineComparisonChart
          rows={rows}
          thresholds={[
            { color: "#fb7185", label: "2.0", value: 2 },
            { color: "#94a3b8", label: "1.0", value: 1 },
            { color: "#34d399", label: "0.5", value: 0.5 },
          ]}
          series={[
            { color: "#3b82f6", getValue: (row) => row.ratio5Day, label: "5d" },
            { color: "#a78bfa", getValue: (row) => row.ratio10Day, label: "10d" },
          ]}
        />
      </ChartCard>
      <ChartCard title="T2108 (% Above 40d MA)">
        <LineComparisonChart
          rows={rows}
          fixedMax={100}
          thresholds={[
            { color: "#facc15", label: "85", value: 85 },
            { color: "#fb7185", label: "15", value: 15 },
          ]}
          series={[
            { color: "#3b82f6", getValue: (row) => row.t2108, label: "T2108" },
          ]}
        />
      </ChartCard>
      <ChartCard title="25% Quarter Breadth">
        <LineComparisonChart
          rows={rows}
          series={[
            { color: "#34d399", getValue: (row) => row.up25Quarter, label: "Up 25% Q" },
            { color: "#fb7185", getValue: (row) => row.down25Quarter, label: "Dn 25% Q" },
          ]}
        />
      </ChartCard>
      <div className="xl:col-span-2">
        <ChartCard title="13% in 34 Days (Up vs Down)">
          <BarComparisonChart
            rows={rows}
            series={[
              { color: "#34d399", getValue: (row) => row.up13In34Days, label: "Up 13/34" },
              { color: "#fb7185", getValue: (row) => row.down13In34Days, label: "Dn 13/34" },
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function BarComparisonChart({
  rows,
  series,
}: {
  rows: StockbeeBreadthRow[];
  series: ChartSeries[];
}) {
  if (rows.length === 0) {
    return <EmptyChart />;
  }

  const maxValue = Math.max(1, ...rows.flatMap((row) => series.map((item) => item.getValue(row))));
  const height = 220;
  const width = 900;
  const padding = { bottom: 28, left: 42, right: 12, top: 10 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const groupWidth = plotWidth / rows.length;
  const barWidth = Math.max(4, Math.min(14, (groupWidth - 4) / series.length));

  return (
    <ChartSvg height={height} series={series} width={width}>
      <ChartGrid height={plotHeight} left={padding.left} top={padding.top} width={plotWidth} />
      {rows.map((row, rowIndex) =>
        series.map((item, seriesIndex) => {
          const value = item.getValue(row);
          const barHeight = (value / maxValue) * plotHeight;
          const x =
            padding.left +
            rowIndex * groupWidth +
            (groupWidth - barWidth * series.length) / 2 +
            seriesIndex * barWidth;
          const y = padding.top + plotHeight - barHeight;

          return (
            <rect
              fill={item.color}
              height={barHeight}
              key={`${row.date}-${item.label}`}
              rx="2"
              width={barWidth}
              x={x}
              y={y}
            />
          );
        }),
      )}
      <DateTicks rows={rows} height={height} left={padding.left} plotWidth={plotWidth} />
    </ChartSvg>
  );
}

function LineComparisonChart({
  fixedMax,
  rows,
  series,
  thresholds = [],
}: {
  fixedMax?: number;
  rows: StockbeeBreadthRow[];
  series: ChartSeries[];
  thresholds?: Threshold[];
}) {
  if (rows.length === 0) {
    return <EmptyChart />;
  }

  const height = 220;
  const width = 900;
  const padding = { bottom: 28, left: 42, right: 16, top: 10 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxSeriesValue = Math.max(
    1,
    ...rows.flatMap((row) => series.map((item) => item.getValue(row))),
    ...thresholds.map((threshold) => threshold.value),
  );
  const maxValue = fixedMax ?? Math.ceil(maxSeriesValue * 1.1 * 10) / 10;
  const xFor = (index: number) =>
    padding.left + (rows.length === 1 ? plotWidth : (index / (rows.length - 1)) * plotWidth);
  const yFor = (value: number) => padding.top + plotHeight - (value / maxValue) * plotHeight;

  return (
    <ChartSvg height={height} series={series} width={width}>
      <ChartGrid height={plotHeight} left={padding.left} top={padding.top} width={plotWidth} />
      {thresholds.map((threshold) => {
        const y = yFor(threshold.value);

        return (
          <g key={threshold.label}>
            <line
              stroke={threshold.color}
              strokeDasharray="5 5"
              strokeOpacity="0.65"
              x1={padding.left}
              x2={padding.left + plotWidth}
              y1={y}
              y2={y}
            />
            <text fill={threshold.color} fontSize="11" x={padding.left + plotWidth - 22} y={y - 4}>
              {threshold.label}
            </text>
          </g>
        );
      })}
      {series.map((item) => (
        <path
          d={rows
            .map((row, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(item.getValue(row))}`)
            .join(" ")}
          fill="none"
          key={item.label}
          stroke={item.color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
      ))}
      <DateTicks rows={rows} height={height} left={padding.left} plotWidth={plotWidth} />
    </ChartSvg>
  );
}

function ChartSvg({
  children,
  height,
  series,
  width,
}: {
  children: React.ReactNode;
  height: number;
  series: ChartSeries[];
  width: number;
}) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-zinc-400">
        {series.map((item) => (
          <span className="inline-flex items-center gap-2" key={item.label}>
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
      <svg
        aria-hidden="true"
        className="h-auto w-full overflow-visible"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {children}
      </svg>
    </div>
  );
}

function ChartGrid({
  height,
  left,
  top,
  width,
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}) {
  return (
    <g>
      {Array.from({ length: 5 }, (_, index) => {
        const y = top + (height / 4) * index;

        return (
          <line
            key={index}
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="3 5"
            x1={left}
            x2={left + width}
            y1={y}
            y2={y}
          />
        );
      })}
    </g>
  );
}

function DateTicks({
  height,
  left,
  plotWidth,
  rows,
}: {
  height: number;
  left: number;
  plotWidth: number;
  rows: StockbeeBreadthRow[];
}) {
  const every = Math.max(1, Math.ceil(rows.length / 8));

  return (
    <g>
      {rows.map((row, index) => {
        if (index % every !== 0 && index !== rows.length - 1) {
          return null;
        }

        const x = left + (rows.length === 1 ? plotWidth : (index / (rows.length - 1)) * plotWidth);

        return (
          <text
            fill="#94a3b8"
            fontSize="11"
            key={row.date}
            textAnchor="middle"
            x={x}
            y={height - 8}
          >
            {shortDate(row.date)}
          </text>
        );
      })}
    </g>
  );
}

function StockChartsPanels() {
  return (
    <section className="mt-4 grid gap-4 xl:grid-cols-2">
      <StockChartPanel href="https://stockcharts.com/h-sc/ui?s=%24NYMO" imageUrl={STOCKCHARTS_NYMO_IMAGE_URL} title="NYMO (McClellan Oscillator)" />
      <StockChartPanel href="https://stockcharts.com/h-sc/ui?s=%24NASI" imageUrl={STOCKCHARTS_NASI_IMAGE_URL} title="NASI (McClellan Summation Index)" />
    </section>
  );
}

function StockChartPanel({
  href,
  imageUrl,
  title,
}: {
  href: string;
  imageUrl: string;
  title: string;
}) {
  return (
    <section className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <ExternalTextLink href={href}>StockCharts</ExternalTextLink>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={`${title} from StockCharts`}
        className="h-auto w-full rounded border border-white/10 bg-white"
        src={imageUrl}
      />
    </section>
  );
}

function BreadthTable({ rows }: { rows: StockbeeBreadthRow[] }) {
  return (
    <section className="mt-4 rounded-md border border-white/10 bg-white/[0.04] p-4">
      <h2 className="text-base font-semibold">Stockbee Market Monitor - Last 30 Days</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1160px] border-separate border-spacing-0 text-left text-sm">
          <thead className="text-xs text-zinc-400">
            <tr>
              {[
                "Date",
                "Up 4%",
                "Down 4%",
                "5d Ratio",
                "10d Ratio",
                "Up 25% Q",
                "Dn 25% Q",
                "Up 25% M",
                "Dn 25% M",
                "Up 50% M",
                "Dn 50% M",
                "Up 13/34",
                "Dn 13/34",
                "Worden",
                "T2108",
                "S&P 500",
              ].map((heading) => (
                <th className="px-3 py-2 font-medium" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {rows.map((row) => (
              <tr className="border-t border-white/10" key={row.date}>
                <td className="px-3 py-2 text-zinc-400">{dateForTable(row.date)}</td>
                <HeatCell intent={row.up4Percent >= row.down4Percent ? "up" : "down"} value={row.up4Percent} />
                <HeatCell intent={row.down4Percent > row.up4Percent ? "down" : "up"} value={row.down4Percent} />
                <td className={ratioClass(row.ratio5Day)}>{formatNumber(row.ratio5Day, 2)}</td>
                <td className={ratioClass(row.ratio10Day)}>{formatNumber(row.ratio10Day, 2)}</td>
                <HeatCell intent={row.up25Quarter >= row.down25Quarter ? "up" : "down"} value={row.up25Quarter} />
                <HeatCell intent={row.down25Quarter > row.up25Quarter ? "down" : "up"} value={row.down25Quarter} />
                <HeatCell intent={row.up25Month >= row.down25Month ? "up" : "down"} value={row.up25Month} />
                <HeatCell intent={row.down25Month > row.up25Month ? "down" : "up"} value={row.down25Month} />
                <HeatCell intent={row.up50Month >= row.down50Month ? "up" : "down"} value={row.up50Month} />
                <HeatCell intent={row.down50Month > row.up50Month ? "down" : "up"} value={row.down50Month} />
                <HeatCell intent={row.up13In34Days >= row.down13In34Days ? "up" : "down"} value={row.up13In34Days} />
                <HeatCell intent={row.down13In34Days > row.up13In34Days ? "down" : "up"} value={row.down13In34Days} />
                <td className="px-3 py-2 text-right text-zinc-400">{formatNumber(row.universeCount, 0)}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{formatNumber(row.t2108, 1)}</td>
                <td className="px-3 py-2 text-right font-semibold text-white">{formatNumber(row.sp500, 2)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-zinc-500" colSpan={16}>
                  No breadth rows are available right now.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function HeatCell({
  intent,
  value,
}: {
  intent: "down" | "up";
  value: number;
}) {
  return (
    <td
      className={`px-3 py-2 text-right font-semibold text-white ${
        intent === "up" ? "bg-emerald-500/70" : "bg-rose-600/70"
      }`}
    >
      {formatNumber(value, 0)}
    </td>
  );
}

function ExternalTextLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </Link>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-white/10 text-sm text-zinc-500">
      No chart data available.
    </div>
  );
}

type ChartSeries = {
  color: string;
  getValue(row: StockbeeBreadthRow): number;
  label: string;
};

type Threshold = {
  color: string;
  label: string;
  value: number;
};

function ratioClass(value: number) {
  const tone =
    value >= 2
      ? "text-emerald-300"
      : value <= 0.8
        ? "text-rose-300"
        : "text-white";

  return `px-3 py-2 text-right font-semibold ${tone}`;
}

function dateForTable(value: string) {
  const [year, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function formatNumber(value: number, decimals: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

function formatMarketPrice(value: number | null) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
