"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type SeriesMarkersOptions,
  type Time,
} from "lightweight-charts";

import type { TradeCharts, TradeChartDataset } from "@/lib/market-data/trade-charts";

const UP_COLOR = "#34d399";
const DOWN_COLOR = "#fb7185";
export const CHART_FONT_SIZE = 14;
export const MARKER_SIZE = 1.8;
export const PRICE_LINE_DISABLED_OPTIONS = {
  lastValueVisible: false,
  priceLineVisible: false,
} as const;
export const MARKER_OPTIONS = {
  zOrder: "top",
} satisfies Partial<SeriesMarkersOptions>;

export function TradeChartPanel({ charts }: { charts?: TradeCharts }) {
  const availableCharts = charts?.charts ?? [];
  const [activeId, setActiveId] = useState(availableCharts[0]?.id ?? "daily");
  const activeChart =
    availableCharts.find((chart) => chart.id === activeId) ?? availableCharts[0] ?? null;

  if (charts?.error) {
    return (
      <section className="mt-8 rounded-md border border-white/10 bg-white/[0.045] p-4">
        <h2 className="text-lg font-semibold">Charts</h2>
        <p className="mt-2 text-sm text-zinc-500">{charts.error}</p>
      </section>
    );
  }

  if (!activeChart) {
    return (
      <section className="mt-8 rounded-md border border-white/10 bg-white/[0.045] p-4">
        <h2 className="text-lg font-semibold">Charts</h2>
        <p className="mt-2 text-sm text-zinc-500">
          No market data is available for this trade yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Charts</h2>
        <div className="flex flex-wrap gap-1 rounded-md border border-white/10 bg-white/[0.04] p-1">
          {availableCharts.map((chart) => (
            <button
              key={chart.id}
              type="button"
              onClick={() => setActiveId(chart.id)}
              className={`h-8 rounded px-3 text-xs font-medium transition ${
                chart.id === activeChart.id
                  ? "bg-cyan-300 text-zinc-950"
                  : "text-zinc-300 hover:bg-white/[0.08] hover:text-white"
              }`}
            >
              {chart.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-md border border-white/10 bg-[#080b10] p-3">
        <div className="mb-3 flex flex-wrap gap-3 text-xs text-zinc-400">
          {activeChart.overlays.map((overlay) => (
            <div key={overlay.id} className="flex items-center gap-2">
              <span
                className="h-0.5 w-5"
                style={{ backgroundColor: overlay.color }}
                aria-hidden="true"
              />
              {overlay.label}
            </div>
          ))}
        </div>
        <LightweightTradeChart key={activeChart.id} chart={activeChart} />
      </div>
    </section>
  );
}

function LightweightTradeChart({ chart }: { chart: TradeChartDataset }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const prepared = useMemo(() => prepareChartData(chart), [chart]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const api = createChart(container, {
      autoSize: true,
      height: 520,
      layout: {
        background: { type: ColorType.Solid, color: "#080b10" },
        fontSize: CHART_FONT_SIZE,
        textColor: "#a1a1aa",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.12)",
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.12)",
        timeVisible: chart.timeframe !== "1d" && chart.timeframe !== "1w",
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
      },
    });
    chartRef.current = api;

    const candleSeries = api.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      borderVisible: false,
      ...PRICE_LINE_DISABLED_OPTIONS,
    });
    candleSeries.setData(prepared.candles);
    createSeriesMarkers(candleSeries, prepared.markers, MARKER_OPTIONS);

    const volumeSeries = api.addSeries(HistogramSeries, {
      color: "rgba(148, 163, 184, 0.35)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
      ...PRICE_LINE_DISABLED_OPTIONS,
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeries.setData(prepared.volume);

    for (const overlay of prepared.overlays) {
      const line = api.addSeries(LineSeries, {
        color: overlay.color,
        lineWidth: 2,
        ...PRICE_LINE_DISABLED_OPTIONS,
      }) as ISeriesApi<"Line">;
      line.setData(overlay.points);
    }

    api.timeScale().fitContent();

    return () => {
      chartRef.current = null;
      api.remove();
    };
  }, [chart.timeframe, prepared]);

  if (chart.bars.length === 0) {
    return (
      <div className="flex h-[520px] items-center justify-center text-sm text-zinc-500">
        No bars were returned for this chart window.
      </div>
    );
  }

  return <div ref={containerRef} className="h-[520px] w-full" />;
}

export function prepareChartData(chart: TradeChartDataset) {
  return {
    candles: chart.bars.map((bar) => ({
      time: chartTime(bar.barStartAt, chart.timeframe),
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    })),
    volume: chart.bars.map((bar) => ({
      time: chartTime(bar.barStartAt, chart.timeframe),
      value: bar.volume,
      color: bar.close >= bar.open ? "rgba(52, 211, 153, 0.35)" : "rgba(251, 113, 133, 0.35)",
    })),
    overlays: chart.overlays.map((overlay) => ({
      ...overlay,
      points: overlay.points.map((point) => ({
        time: chartTime(point.time, chart.timeframe),
        value: point.value,
      })),
    })),
    markers: chart.markers.map(
      (marker): SeriesMarker<Time> => ({
        time: chartTime(marker.time, chart.timeframe),
        position: marker.role === "ENTRY" ? "belowBar" : "aboveBar",
        shape: marker.role === "ENTRY" ? "arrowUp" : "arrowDown",
        color: marker.role === "ENTRY" ? "#22d3ee" : "#fb7185",
        size: MARKER_SIZE,
        text: formatMarkerQuantity(marker.quantity),
      }),
    ),
  };
}

function formatMarkerQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function chartTime(value: string, timeframe: TradeChartDataset["timeframe"]): Time {
  if (timeframe === "1d" || timeframe === "1w") {
    return value.slice(0, 10);
  }

  return Math.floor(Date.parse(value) / 1000) as Time;
}
