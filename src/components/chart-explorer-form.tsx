import type { ChartExplorerFilters } from "@/lib/market-data/chart-explorer";
import { serializeChartExplorerSearchParams } from "@/lib/market-data/chart-explorer";

export function ChartExplorerForm({
  initialFilters,
}: {
  initialFilters: ChartExplorerFilters;
}) {
  return (
    <form action="/charts" className="mt-6 rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="grid gap-1 text-xs text-zinc-500">
          Ticker
          <input
            className="h-10 rounded-md border border-white/10 bg-black/20 px-3 font-mono text-sm uppercase text-zinc-100 outline-none focus:border-cyan-300/60"
            defaultValue={initialFilters.symbol}
            name="symbol"
            placeholder="NVDA"
            required
          />
        </label>
        <label className="grid gap-1 text-xs text-zinc-500">
          Start date
          <input
            className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-300/60"
            defaultValue={initialFilters.from}
            name="from"
            required
            type="date"
          />
        </label>
        <label className="grid gap-1 text-xs text-zinc-500">
          End date
          <input
            className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-300/60"
            defaultValue={initialFilters.to}
            name="to"
            required
            type="date"
          />
        </label>
        <button
          className="h-10 self-end rounded-md bg-cyan-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200"
          type="submit"
        >
          Build charts
        </button>
      </div>
    </form>
  );
}

export function chartExplorerHref(filters: ChartExplorerFilters) {
  return `/charts?${serializeChartExplorerSearchParams(filters).toString()}`;
}
