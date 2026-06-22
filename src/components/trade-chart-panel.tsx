"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type CreatePriceLineOptions,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type SeriesMarker,
  type SeriesMarkersOptions,
  type Time,
} from "lightweight-charts";

import { updateTradeStopLoss } from "@/app/actions";
import { formatMoney } from "@/components/format";
import type { PositionStopGroup } from "@/lib/app-data";
import type { TradeCharts, TradeChartDataset } from "@/lib/market-data/trade-charts";

type StopPriceLineOptions = CreatePriceLineOptions & { id: string };

const UP_COLOR = "#34d399";
const DOWN_COLOR = "#fb7185";
export const STOP_LINE_COLOR = "249, 115, 22";
export const STOP_LINE_OPACITY = 0.5;
export const STOP_PRICE_LINE_STYLE = LineStyle.Dashed;
const STOP_LINE_RGBA = `rgba(${STOP_LINE_COLOR}, ${STOP_LINE_OPACITY})`;
const STOP_DRAG_HIT_TOLERANCE_PX = 10;
export const CHART_FONT_SIZE = 12;
export const MARKER_SIZE = 1.8;
export const PRICE_LINE_DISABLED_OPTIONS = {
  lastValueVisible: false,
  priceLineVisible: false,
} as const;
export const MARKER_OPTIONS = {
  zOrder: "top",
} satisfies Partial<SeriesMarkersOptions>;

export function TradeChartPanel({
  charts,
  stopGroups = [],
  title = "Charts",
}: {
  charts?: TradeCharts;
  stopGroups?: PositionStopGroup[];
  title?: string;
}) {
  const availableCharts = charts?.charts ?? [];
  const [activeId, setActiveId] = useState(availableCharts[0]?.id ?? "daily");
  const [stopPriceValues, setStopPriceValues] = useState(() =>
    initialStopPriceValues(stopGroups),
  );
  const activeChart =
    availableCharts.find((chart) => chart.id === activeId) ?? availableCharts[0] ?? null;
  const editableStopGroups = useMemo(
    () =>
      stopGroups.map((group) => {
        const stopLossPrice = numberFromInput(stopPriceValues[group.id]);

        return {
          ...group,
          stopLossPrice,
          stopUnrealizedPnl: stopUnrealizedPnl({
            ...group,
            stopLossPrice,
          }),
        };
      }),
    [stopGroups, stopPriceValues],
  );

  const updateStopPriceValue = (id: string, value: string) => {
    setStopPriceValues((current) => ({ ...current, [id]: value }));
  };

  if (charts?.error) {
    return (
      <section className="mt-8 rounded-md border border-white/10 bg-white/[0.045] p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-zinc-500">{charts.error}</p>
      </section>
    );
  }

  if (!activeChart) {
    return (
      <section className="mt-8 rounded-md border border-white/10 bg-white/[0.045] p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-zinc-500">
          No market data is available for this trade yet.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
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
        <StopLossControls
          stopGroups={editableStopGroups}
          stopPriceValues={stopPriceValues}
          onStopPriceChange={updateStopPriceValue}
        />
        <LightweightTradeChart
          key={activeChart.id}
          chart={activeChart}
          stopGroups={editableStopGroups}
          onStopPriceChange={updateStopPriceValue}
        />
      </div>
    </section>
  );
}

function StopLossControls({
  onStopPriceChange,
  stopGroups,
  stopPriceValues,
}: {
  onStopPriceChange: (id: string, value: string) => void;
  stopGroups: PositionStopGroup[];
  stopPriceValues: Record<string, string>;
}) {
  if (stopGroups.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 grid gap-2 border-y border-white/10 py-3">
      {stopGroups.map((group) => (
        <form
          action={updateTradeStopLoss.bind(null, group.id)}
          className="flex flex-wrap items-center gap-3 text-xs"
          key={group.id}
        >
          <span className="flex items-center gap-2 font-mono text-zinc-300">
            <span
              aria-hidden="true"
              className="h-0.5 w-5"
              style={{ backgroundColor: STOP_LINE_RGBA }}
            />
            {group.entryDate} stop
          </span>
          <input
            aria-label={`${group.entryDate} stop loss`}
            className="h-8 w-28 rounded-md border border-white/10 bg-black/30 px-2 text-right font-mono text-sm text-zinc-100 outline-none focus:border-cyan-300"
            inputMode="decimal"
            min="0"
            name="stopLoss"
            onChange={(event) => onStopPriceChange(group.id, event.currentTarget.value)}
            required
            step="0.0001"
            type="number"
            value={stopPriceValues[group.id] ?? ""}
          />
          <span className="font-mono text-zinc-400">
            {formatMoney(group.stopUnrealizedPnl)}
          </span>
          <button
            className="h-8 rounded-md bg-cyan-300 px-3 text-xs font-semibold text-zinc-950 hover:bg-cyan-200"
            type="submit"
          >
            Save
          </button>
        </form>
      ))}
    </div>
  );
}

function LightweightTradeChart({
  chart,
  onStopPriceChange,
  stopGroups,
}: {
  chart: TradeChartDataset;
  onStopPriceChange: (id: string, value: string) => void;
  stopGroups: PositionStopGroup[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const draggingStopIdRef = useRef<string | null>(null);
  const onStopPriceChangeRef = useRef(onStopPriceChange);
  const stopGroupsRef = useRef(stopGroups);
  const stopLineRefs = useRef(new Map<string, IPriceLine>());

  const prepared = useMemo(() => prepareChartData(chart), [chart]);

  useEffect(() => {
    onStopPriceChangeRef.current = onStopPriceChange;
  }, [onStopPriceChange]);

  useEffect(() => {
    stopGroupsRef.current = stopGroups;
  }, [stopGroups]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const stopLineMap = stopLineRefs.current;

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
    candleSeriesRef.current = candleSeries;
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
      candleSeriesRef.current = null;
      stopLineMap.clear();
      api.remove();
    };
  }, [chart.timeframe, prepared]);

  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) {
      return;
    }

    const activeStopLines = prepareStopPriceLines(stopGroups);
    const activeStopIds = new Set(activeStopLines.map((line) => line.id));

    for (const [id, line] of stopLineRefs.current.entries()) {
      if (!activeStopIds.has(id)) {
        candleSeries.removePriceLine(line);
        stopLineRefs.current.delete(id);
      }
    }

    for (const stopLine of activeStopLines) {
      const existingLine = stopLineRefs.current.get(stopLine.id);
      if (existingLine) {
        existingLine.applyOptions(stopLine);
      } else {
        stopLineRefs.current.set(stopLine.id, candleSeries.createPriceLine(stopLine));
      }
    }
  }, [stopGroups]);

  useEffect(() => {
    const container = containerRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!container || !candleSeries) {
      return;
    }

    const stopAtPointer = (clientY: number) => {
      const y = clientY - container.getBoundingClientRect().top;

      return stopGroupsRef.current
        .filter((group) => group.stopLossPrice != null)
        .map((group) => ({
          group,
          distance: Math.abs((candleSeries.priceToCoordinate(group.stopLossPrice as number) ?? -9999) - y),
        }))
        .sort((left, right) => left.distance - right.distance)[0];
    };

    const handlePointerDown = (event: PointerEvent) => {
      const candidate = stopAtPointer(event.clientY);

      if (!candidate || candidate.distance > STOP_DRAG_HIT_TOLERANCE_PX) {
        return;
      }

      draggingStopIdRef.current = candidate.group.id;
      container.setPointerCapture(event.pointerId);
      container.style.cursor = "ns-resize";
      event.preventDefault();
    };

    const handlePointerMove = (event: PointerEvent) => {
      const y = event.clientY - container.getBoundingClientRect().top;
      const draggingStopId = draggingStopIdRef.current;

      if (!draggingStopId) {
        const candidate = stopAtPointer(event.clientY);
        container.style.cursor =
          candidate && candidate.distance <= STOP_DRAG_HIT_TOLERANCE_PX
            ? "ns-resize"
            : "";
        return;
      }

      const price = candleSeries.coordinateToPrice(y);
      if (price == null) {
        return;
      }

      const roundedPrice = roundStopPrice(price);
      stopLineRefs.current.get(draggingStopId)?.applyOptions({ price: roundedPrice });
      onStopPriceChangeRef.current(draggingStopId, formatStopInputValue(roundedPrice));
      event.preventDefault();
    };

    const stopDragging = (event: PointerEvent) => {
      if (!draggingStopIdRef.current) {
        return;
      }

      draggingStopIdRef.current = null;
      container.style.cursor = "";
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId);
      }
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", stopDragging);
    container.addEventListener("pointercancel", stopDragging);
    container.addEventListener("pointerleave", handlePointerMove);

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", stopDragging);
      container.removeEventListener("pointercancel", stopDragging);
      container.removeEventListener("pointerleave", handlePointerMove);
    };
  }, []);

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
    overlays: [
      ...chart.overlays.map((overlay) => ({
        ...overlay,
        points: overlay.points.map((point) => ({
          time: chartTime(point.time, chart.timeframe),
          value: point.value,
        })),
      })),
    ],
    markers: chart.markers.map(
      (marker): SeriesMarker<Time> => ({
        time: chartTime(marker.time, chart.timeframe),
        position: marker.role === "ENTRY" ? "belowBar" : "aboveBar",
        shape: marker.role === "ENTRY" ? "arrowUp" : "arrowDown",
        color: marker.role === "ENTRY" ? "#22d3ee" : "#fb7185",
        size: MARKER_SIZE,
        text: marker.label ?? formatMarkerQuantity(marker.quantity),
      }),
    ),
  };
}

export function prepareStopPriceLines(
  stopGroups: PositionStopGroup[],
): StopPriceLineOptions[] {
  return stopGroups
    .filter((group) => group.stopLossPrice != null)
    .map((group) => ({
      id: group.id,
      price: group.stopLossPrice as number,
      color: STOP_LINE_RGBA,
      lineWidth: 2,
      lineStyle: STOP_PRICE_LINE_STYLE,
      lineVisible: true,
      axisLabelVisible: true,
      axisLabelColor: STOP_LINE_RGBA,
      axisLabelTextColor: "#ffffff",
      title: `Stop ${formatStopInputValue(group.stopLossPrice as number)}`,
    }));
}

function formatMarkerQuantity(value: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function initialStopPriceValues(stopGroups: PositionStopGroup[]) {
  return Object.fromEntries(
    stopGroups.map((group) => [
      group.id,
      group.stopLossPrice == null ? "" : formatStopInputValue(group.stopLossPrice),
    ]),
  );
}

function numberFromInput(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stopUnrealizedPnl(group: PositionStopGroup) {
  if (
    group.quantity == null ||
    group.avgEntryPrice == null ||
    group.stopLossPrice == null
  ) {
    return null;
  }

  const value =
    group.direction === "LONG"
      ? (group.stopLossPrice - group.avgEntryPrice) * group.quantity
      : (group.avgEntryPrice - group.stopLossPrice) * group.quantity;

  return roundStopPrice(value);
}

function roundStopPrice(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function formatStopInputValue(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 4,
    useGrouping: false,
  }).format(value);
}

function chartTime(value: string, timeframe: TradeChartDataset["timeframe"]): Time {
  if (timeframe === "1d" || timeframe === "1w") {
    return value.slice(0, 10);
  }

  return Math.floor(Date.parse(value) / 1000) as Time;
}
