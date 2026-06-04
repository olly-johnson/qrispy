"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { formatDateTime, formatPercent } from "@/components/format";
import type { GappersMode, GappersRow } from "@/lib/market-data/gappers";
import {
  DEFAULT_GAPPERS_FILTERS,
  filterGappersRows,
  type GappersFilters,
} from "@/lib/market-data/gappers-client";

const AUTO_REFRESH_MS = 15 * 60 * 1000;

export function GappersTable({
  error,
  loadedAt,
  mode,
  rows,
}: {
  error: string | null;
  loadedAt: string;
  mode: GappersMode;
  rows: GappersRow[];
}) {
  const router = useRouter();
  const [filters, setFilters] = useState<GappersFilters>(DEFAULT_GAPPERS_FILTERS);
  const [isPending, startTransition] = useTransition();
  const visibleRows = useMemo(() => filterGappersRows(rows, filters), [filters, rows]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [router]);

  const refresh = () => {
    startTransition(() => router.refresh());
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Gappers</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {mode === "extended" ? "Extended-hours volume" : "Regular-session volume"} / Last updated:{" "}
            {formatDateTime(loadedAt)}
          </p>
        </div>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-200 disabled:cursor-wait disabled:opacity-60"
          disabled={isPending}
          onClick={refresh}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <section className="mt-6 rounded-md border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm text-amber-100">
          {error}
        </section>
      ) : null}

      <section className="mt-6 rounded-md border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <NumberInput
            label="Min price"
            min={0}
            onChange={(value) => setFilters((current) => ({ ...current, minPrice: value }))}
            step={0.01}
            value={filters.minPrice}
          />
          <NumberInput
            label="Min gap %"
            min={0}
            onChange={(value) => setFilters((current) => ({ ...current, minGapPercent: value }))}
            step={0.1}
            value={filters.minGapPercent}
          />
          <NumberInput
            label="Min dollar volume"
            min={0}
            onChange={(value) => setFilters((current) => ({ ...current, minDollarVolume: value }))}
            step={10_000}
            value={filters.minDollarVolume}
          />
          <Toggle
            checked={filters.includeStocks}
            label="Stocks"
            onChange={(checked) => setFilters((current) => ({ ...current, includeStocks: checked }))}
          />
          <Toggle
            checked={filters.includeEtfs}
            label="ETFs"
            onChange={(checked) => setFilters((current) => ({ ...current, includeEtfs: checked }))}
          />
        </div>
        <div className="mt-4 text-sm text-zinc-500">
          Showing {visibleRows.length.toLocaleString("en-US")} of{" "}
          {rows.length.toLocaleString("en-US")} loaded rows.
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-md border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
              <tr>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Gap</th>
                <th className="px-4 py-3 text-right">Volume</th>
                <th className="px-4 py-3 text-right">Dollar Volume</th>
                <th className="px-4 py-3 text-right">Prev Close</th>
                <th className="px-4 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleRows.map((row) => (
                <tr className="hover:bg-white/[0.03]" key={row.symbol}>
                  <td className="px-4 py-3 font-mono font-semibold text-cyan-200">{row.symbol}</td>
                  <td className="max-w-72 truncate px-4 py-3 text-zinc-300">{row.name}</td>
                  <td className="px-4 py-3">{row.securityType}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatPrice(row.price)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-emerald-300">
                    {formatPercent(row.gapPercent / 100)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatCompact(row.activeVolume)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">
                    {formatDollars(row.activeDollarVolume)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{formatPrice(row.previousClose)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {row.lastUpdatedAt ? formatDateTime(row.lastUpdatedAt) : "--"}
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-zinc-500" colSpan={9}>
                    No gappers match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NumberInput({
  label,
  min,
  onChange,
  step,
  value,
}: {
  label: string;
  min: number;
  onChange(value: number): void;
  step: number;
  value: number;
}) {
  return (
    <label className="grid gap-1 text-xs text-zinc-500">
      {label}
      <input
        className="h-10 rounded-md border border-white/10 bg-black/20 px-3 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-300/60"
        min={min}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        step={step}
        type="number"
        value={value}
      />
    </label>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="flex h-10 items-center gap-2 self-end rounded-md border border-white/10 bg-black/20 px-3 text-sm text-zinc-300">
      <input
        checked={checked}
        className="h-4 w-4 accent-emerald-300"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      {label}
    </label>
  );
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function formatDollars(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}
