"use client";

import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { formatDateTime } from "@/components/format";
import type { SectorBreadthSnapshot } from "@/lib/market-data/sector-breadth";

export function SectorBreadthView({
  error,
  snapshot,
}: {
  error: string | null;
  snapshot: SectorBreadthSnapshot | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [openIndustries, setOpenIndustries] = useState<Set<string>>(
    () => new Set(),
  );
  const [openSectors, setOpenSectors] = useState<Set<string>>(() => new Set());

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sector Breadth</h1>
          <p className="mt-1 text-sm text-zinc-500">
            SIC-derived common-stock sectors
            {snapshot ? ` / Last updated: ${formatDateTime(snapshot.loadedAt)}` : ""}
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

      {snapshot ? (
        <>
          <BreadthCards snapshot={snapshot} />
          <CoverageNote snapshot={snapshot} />
          <section className="mt-4 overflow-hidden rounded-md border border-white/10 bg-white/[0.04]">
            {snapshot.sectors.map((sector) => {
              const sectorOpen = openSectors.has(sector.name);

              return (
                <div className="border-b border-white/10 last:border-b-0" key={sector.name}>
                  <button
                    className="grid w-full grid-cols-[1fr_auto] gap-3 px-4 py-4 text-left transition hover:bg-white/[0.04] md:grid-cols-[1fr_8rem_8rem_8rem_auto]"
                    onClick={() =>
                      setOpenSectors((current) => toggleSetValue(current, sector.name))
                    }
                    type="button"
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      {sectorOpen ? (
                        <ChevronDown className="h-4 w-4 text-cyan-300" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-cyan-300" />
                      )}
                      {sector.name}
                    </span>
                    <Metric value={formatPercentValue(sector.averageTodayPercent)} />
                    <Metric
                      value={`${sector.up} up`}
                      tone={breadthCountTone({
                        down: sector.down,
                        side: "up",
                        up: sector.up,
                      })}
                    />
                    <Metric
                      value={`${sector.down} down`}
                      tone={breadthCountTone({
                        down: sector.down,
                        side: "down",
                        up: sector.up,
                      })}
                    />
                    <Metric value={`${sector.industries.length} industries`} />
                  </button>
                  {sectorOpen ? (
                    <div className="bg-black/20 px-4 pb-4">
                      {sector.industries.map((industry) => {
                        const industryKey = `${sector.name}:${industry.name}`;
                        const industryOpen = openIndustries.has(industryKey);

                        return (
                          <div className="border-t border-white/10" key={industry.name}>
                            <button
                              className="grid w-full grid-cols-[1fr_auto] gap-3 py-3 text-left text-sm transition hover:text-white md:grid-cols-[1fr_8rem_8rem_8rem_auto]"
                              onClick={() =>
                                setOpenIndustries((current) =>
                                  toggleSetValue(current, industryKey),
                                )
                              }
                              type="button"
                            >
                              <span className="flex items-center gap-2 text-zinc-200">
                                {industryOpen ? (
                                  <ChevronDown className="h-4 w-4 text-cyan-300" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-cyan-300" />
                                )}
                                {industry.name}
                              </span>
                              <Metric value={formatPercentValue(industry.averageTodayPercent)} />
                              <Metric
                                value={`${industry.up} up`}
                                tone={breadthCountTone({
                                  down: industry.down,
                                  side: "up",
                                  up: industry.up,
                                })}
                              />
                              <Metric
                                value={`${industry.down} down`}
                                tone={breadthCountTone({
                                  down: industry.down,
                                  side: "down",
                                  up: industry.up,
                                })}
                              />
                              <Metric value={`${industry.stocks.length} stocks`} />
                            </button>
                            {industryOpen ? <StocksTable stocks={industry.stocks} /> : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        </>
      ) : !error ? (
        <section className="mt-6 rounded-md border border-white/10 bg-white/[0.04] p-6 text-sm text-zinc-500">
          No sector breadth data is available.
        </section>
      ) : null}
    </div>
  );
}

function BreadthCards({ snapshot }: { snapshot: SectorBreadthSnapshot }) {
  return (
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card label="T2108" value={formatNullablePercent(snapshot.liveBreadth.t2108)} />
      <Card
        label="4% Today"
        value={`${snapshot.liveBreadth.up4Percent} up / ${snapshot.liveBreadth.down4Percent} down`}
      />
      <Card
        label="13% in 34 Days"
        value={`${snapshot.liveBreadth.up13In34Days} up / ${snapshot.liveBreadth.down13In34Days} down`}
      />
      <Card label="5d Ratio" value={formatNullableNumber(snapshot.liveBreadth.ratio5Day)} />
      <Card label="10d Ratio" value={formatNullableNumber(snapshot.liveBreadth.ratio10Day)} />
    </section>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</div>
      <div className="mt-3 font-mono text-xl font-semibold text-white">{value}</div>
    </article>
  );
}

function CoverageNote({ snapshot }: { snapshot: SectorBreadthSnapshot }) {
  return (
    <section className="mt-4 rounded-md border border-white/10 bg-black/20 p-3 text-sm text-zinc-500">
      {snapshot.coverage.mapped.toLocaleString("en-US")} classified /{" "}
      {snapshot.coverage.totalCommonStocks.toLocaleString("en-US")} common stocks.{" "}
      {snapshot.coverage.unmapped.toLocaleString("en-US")} unclassified excluded from sector totals.{" "}
      T2108 coverage: {snapshot.liveBreadth.t2108Covered.toLocaleString("en-US")} stocks.
    </section>
  );
}

function StocksTable({
  stocks,
}: {
  stocks: SectorBreadthSnapshot["sectors"][number]["stocks"];
}) {
  return (
    <div className="overflow-x-auto pb-3">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-2 pr-3">Symbol</th>
            <th className="px-3 py-2">Name</th>
            <th className="px-3 py-2 text-right">Today</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Volume</th>
            <th className="px-3 py-2">Updated</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => (
            <tr className="border-t border-white/10" key={stock.symbol}>
              <td className="py-2 pr-3 font-mono font-semibold text-cyan-200">{stock.symbol}</td>
              <td className="max-w-80 truncate px-3 py-2 text-zinc-300">{stock.name}</td>
              <td className={`px-3 py-2 text-right font-mono font-semibold ${toneClass(stock.todayPercent)}`}>
                {formatPercentValue(stock.todayPercent)}
              </td>
              <td className="px-3 py-2 text-right font-mono">{formatMoney(stock.price)}</td>
              <td className="px-3 py-2 text-right font-mono">{formatCompact(stock.volume)}</td>
              <td className="px-3 py-2 text-zinc-500">
                {stock.lastUpdatedAt ? formatDateTime(stock.lastUpdatedAt) : "--"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({
  tone,
  value,
}: {
  tone?: "down" | "up";
  value: string;
}) {
  return (
    <span
      className={`text-right font-mono text-sm ${
        tone === "up"
          ? "text-emerald-300"
          : tone === "down"
            ? "text-rose-300"
            : "text-zinc-300"
      }`}
    >
      {value}
    </span>
  );
}

export function breadthCountTone({
  down,
  side,
  up,
}: {
  down: number;
  side: "down" | "up";
  up: number;
}) {
  if (up > down && side === "up") {
    return "up";
  }
  if (down > up && side === "down") {
    return "down";
  }

  return undefined;
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);

  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }

  return next;
}

function toneClass(value: number) {
  if (value > 0) {
    return "text-emerald-300";
  }
  if (value < 0) {
    return "text-rose-300";
  }

  return "text-zinc-300";
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatNullableNumber(value: number | null) {
  return value == null ? "--" : value.toFixed(2);
}

function formatNullablePercent(value: number | null) {
  return value == null ? "--" : `${value.toFixed(1)}%`;
}

function formatPercentValue(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}
