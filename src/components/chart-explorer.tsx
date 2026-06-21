"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";

import type {
  ChartExplorerDataset,
  ChartExplorerResult,
  ChartExplorerTimeframe,
} from "@/lib/market-data/chart-explorer";

const UP_COLOR = "#34d399";
const DOWN_COLOR = "#fb7185";
const DISABLED_PRICE_LINE_OPTIONS = {
  lastValueVisible: false,
  priceLineVisible: false,
} as const;

export const INTRADAY_TABS: Array<{
  id: Exclude<ChartExplorerTimeframe, "1d">;
  label: string;
}> = [
  { id: "1h", label: "1 hour" },
  { id: "5m", label: "5 minute" },
  { id: "1m", label: "1 minute" },
];

export function ChartExplorer({ result }: { result: ChartExplorerResult }) {
  const [activeTimeframe, setActiveTimeframe] = useState<Exclude<ChartExplorerTimeframe, "1d">>(
    "1h",
  );

  if (result.error) {
    return (
      <section className="mt-6 rounded-md border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm text-amber-100">
        {result.error}
      </section>
    );
  }

  if (!result.daily || !result.intraday) {
    return null;
  }

  return (
    <section className="mt-6 grid gap-4 xl:grid-cols-2">
      <ChartCard dataset={result.daily} title="Daily" />
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Intraday</h2>
          <div className="flex gap-1 rounded-md border border-white/10 bg-white/[0.04] p-1">
            {INTRADAY_TABS.map((tab) => (
              <button
                className={`h-8 rounded px-3 text-xs font-medium transition ${
                  tab.id === activeTimeframe
                    ? "bg-cyan-300 text-zinc-950"
                    : "text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                }`}
                key={tab.id}
                onClick={() => setActiveTimeframe(tab.id)}
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <ChartCard dataset={result.intraday[activeTimeframe]} title={result.intraday[activeTimeframe].label} />
      </div>
    </section>
  );
}

export function initialLogicalRange({
  startIndex,
  visibleBars,
}: {
  startIndex: number;
  visibleBars: number;
}) {
  return { from: startIndex, to: startIndex + visibleBars };
}

function ChartCard({ dataset, title }: { dataset: ChartExplorerDataset; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || dataset.bars.length === 0) {
      return;
    }

    const chart: IChartApi = createChart(container, {
      autoSize: true,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: "#080b10" },
        fontSize: 13,
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
      timeScale: {
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: dataset.timeframe !== "1d",
      },
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      borderVisible: false,
      ...DISABLED_PRICE_LINE_OPTIONS,
    });
    candles.setData(
      dataset.bars.map((bar) => ({
        time: chartTime(bar.barStartAt, dataset.timeframe),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      })),
    );

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      ...DISABLED_PRICE_LINE_OPTIONS,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volume.setData(
      dataset.bars.map((bar) => ({
        time: chartTime(bar.barStartAt, dataset.timeframe),
        value: bar.volume,
        color: bar.close >= bar.open ? "rgba(52, 211, 153, 0.35)" : "rgba(251, 113, 133, 0.35)",
      })),
    );

    for (const overlay of dataset.overlays) {
      const line = chart.addSeries(LineSeries, {
        color: overlay.color,
        lineWidth: 2,
        ...DISABLED_PRICE_LINE_OPTIONS,
      });
      line.setData(
        overlay.points.map((point) => ({
          time: chartTime(point.time, dataset.timeframe),
          value: point.value,
        })),
      );
    }

    chart.timeScale().setVisibleLogicalRange(initialLogicalRange(dataset));

    return () => chart.remove();
  }, [dataset]);

  return (
    <section className="rounded-md border border-white/10 bg-[#080b10] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-400">
          {dataset.overlays.map((overlay) => (
            <span className="inline-flex items-center gap-1.5" key={overlay.id}>
              <span className="h-0.5 w-4" style={{ backgroundColor: overlay.color }} />
              {overlay.label}
            </span>
          ))}
        </div>
      </div>
      {dataset.bars.length === 0 ? (
        <div className="flex h-[500px] items-center justify-center text-sm text-zinc-500">
          No bars were returned for this chart window.
        </div>
      ) : (
        <div className="h-[500px] w-full" ref={containerRef} />
      )}
    </section>
  );
}

function chartTime(value: string, timeframe: ChartExplorerTimeframe): Time {
  if (timeframe === "1d") {
    return value.slice(0, 10);
  }

  return Math.floor(Date.parse(value) / 1000) as Time;
}
