"use client";

import { RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { formatDateTime, formatPercent } from "@/components/format";
import type { GappersMode, GappersRow } from "@/lib/market-data/gappers";
import {
  buildGappersSummaryRequests,
  clearGappersNewsSummaryCache,
  filterGappersRows,
  getCachedGappersSummaryResults,
  getLastGappersSummaryResults,
  hasGappersSummaryEarningsOrGuidance,
  saveGappersSummaryResults,
  saveLastGappersSummaryResults,
  serializeGappersFiltersSearchParams,
  type GappersFilters,
  type GappersNewsSummaryResult,
} from "@/lib/market-data/gappers-client";

const AUTO_REFRESH_MS = 15 * 60 * 1000;
const NEWS_SUMMARY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NEWS_SUMMARY_MODELS = ["gpt-4o-mini", "gpt-4o-2024-08-06"] as const;

export function GappersTable({
  error,
  initialFilters,
  loadedAt,
  mode,
  rows,
}: {
  error: string | null;
  initialFilters: GappersFilters;
  loadedAt: string;
  mode: GappersMode;
  rows: GappersRow[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [filters, setFilters] = useState<GappersFilters>(initialFilters);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [newsModel, setNewsModel] = useState<(typeof NEWS_SUMMARY_MODELS)[number]>("gpt-4o-mini");
  const [newsProvider, setNewsProvider] = useState("openai");
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(() => new Set());
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryResults, setSummaryResults] = useState<GappersNewsSummaryResult[]>(
    () => {
      if (typeof window === "undefined") {
        return [];
      }

      return getLastGappersSummaryResults({
        maxAgeMs: NEWS_SUMMARY_CACHE_MAX_AGE_MS,
        storage: window.localStorage,
      });
    },
  );
  const [isPending, startTransition] = useTransition();
  const visibleRows = useMemo(() => filterGappersRows(rows, filters), [filters, rows]);
  const selectedVisibleRows = useMemo(
    () => buildGappersSummaryRequests(visibleRows, selectedSymbols),
    [selectedSymbols, visibleRows],
  );
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((row) => selectedSymbols.has(row.symbol));

  useEffect(() => {
    const timer = window.setInterval(() => {
      startTransition(() => router.refresh());
    }, AUTO_REFRESH_MS);

    return () => window.clearInterval(timer);
  }, [router]);

  const refresh = () => {
    startTransition(() => router.refresh());
  };

  const updateFilters = (nextFilters: GappersFilters) => {
    setFilters(nextFilters);

    const params = serializeGappersFiltersSearchParams(nextFilters);

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  };

  const updateFilter = <Key extends keyof GappersFilters>(
    key: Key,
    value: GappersFilters[Key],
  ) => {
    updateFilters({ ...filters, [key]: value });
  };

  const toggleSymbol = (symbol: string, checked: boolean) => {
    setSelectedSymbols((current) => {
      const next = new Set(current);

      if (checked) {
        next.add(symbol);
      } else {
        next.delete(symbol);
      }

      return next;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    setSelectedSymbols((current) => {
      const next = new Set(current);

      for (const row of visibleRows) {
        if (checked) {
          next.add(row.symbol);
        } else {
          next.delete(row.symbol);
        }
      }

      return next;
    });
  };

  const summarizeSelected = async () => {
    const tickers = buildGappersSummaryRequests(visibleRows, selectedSymbols);

    if (tickers.length === 0) {
      setSummaryError("Select at least one visible ticker.");
      return;
    }

    setIsSummarizing(true);
    setSummaryError(null);

    try {
      const { cachedResults, missingRequests } = getCachedGappersSummaryResults({
        maxAgeMs: NEWS_SUMMARY_CACHE_MAX_AGE_MS,
        model: newsModel,
        provider: newsProvider,
        requests: tickers,
        storage: window.localStorage,
      });

      let fetchedResults: GappersNewsSummaryResult[] = [];

      if (missingRequests.length > 0) {
        const response = await fetch("/api/gappers/news-summaries", {
          body: JSON.stringify({
            model: newsModel,
            provider: newsProvider,
            tickers: missingRequests,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        });
        const payload = (await response.json()) as {
          error?: string;
          results?: GappersNewsSummaryResult[];
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "News summary request failed.");
        }

        fetchedResults = payload.results ?? [];
        saveGappersSummaryResults({
          model: newsModel,
          provider: newsProvider,
          requests: missingRequests,
          results: fetchedResults,
          storage: window.localStorage,
        });
      }

      const resultsBySymbol = new Map(
        [...cachedResults, ...fetchedResults].map((result) => [
          result.symbol,
          result,
        ]),
      );
      const orderedResults = tickers
        .map((ticker) => resultsBySymbol.get(ticker.symbol))
        .filter((result): result is GappersNewsSummaryResult => result != null);

      saveLastGappersSummaryResults({
        results: orderedResults,
        storage: window.localStorage,
      });
      setSummaryResults(orderedResults);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSummarizing(false);
    }
  };

  const clearCachedNews = () => {
    clearGappersNewsSummaryCache({ storage: window.localStorage });
    setSummaryError(null);
    setSummaryResults([]);
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
            onChange={(value) => updateFilter("minPrice", value)}
            step={0.01}
            value={filters.minPrice}
          />
          <NumberInput
            label="Min gap %"
            min={0}
            onChange={(value) => updateFilter("minGapPercent", value)}
            step={0.1}
            value={filters.minGapPercent}
          />
          <NumberInput
            label="Min dollar volume"
            min={0}
            onChange={(value) => updateFilter("minDollarVolume", value)}
            step={10_000}
            value={filters.minDollarVolume}
          />
          <Toggle
            checked={filters.includeStocks}
            label="Stocks"
            onChange={(checked) => updateFilter("includeStocks", checked)}
          />
          <Toggle
            checked={filters.includeEtfs}
            label="ETFs"
            onChange={(checked) => updateFilter("includeEtfs", checked)}
          />
        </div>
        <div className="mt-4 text-sm text-zinc-500">
          Showing {visibleRows.length.toLocaleString("en-US")} of{" "}
          {rows.length.toLocaleString("en-US")} loaded rows.
        </div>
      </section>

      <section className="mt-4 rounded-md border border-white/10 bg-white/[0.04] p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
          <label className="grid gap-1 text-xs text-zinc-500">
            LLM provider
            <select
              className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-300/60"
              onChange={(event) => setNewsProvider(event.target.value)}
              value={newsProvider}
            >
              <option value="openai">OpenAI</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-zinc-500">
            Model
            <select
              className="h-10 rounded-md border border-white/10 bg-black/20 px-3 font-mono text-sm text-zinc-100 outline-none focus:border-cyan-300/60"
              onChange={(event) =>
                setNewsModel(event.target.value as (typeof NEWS_SUMMARY_MODELS)[number])
              }
              value={newsModel}
            >
              {NEWS_SUMMARY_MODELS.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md bg-cyan-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={selectedVisibleRows.length === 0 || isSummarizing}
            onClick={summarizeSelected}
            type="button"
          >
            <Sparkles className={`h-4 w-4 ${isSummarizing ? "animate-pulse" : ""}`} />
            Summarise selected
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 self-end rounded-md border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSummarizing}
            onClick={clearCachedNews}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
            Clear cached news
          </button>
        </div>
        <div className="mt-4 text-sm text-zinc-500">
          {selectedVisibleRows.length.toLocaleString("en-US")} selected for news summaries.
        </div>
        {summaryError ? (
          <div className="mt-3 rounded-md border border-rose-300/20 bg-rose-300/[0.08] p-3 text-sm text-rose-100">
            {summaryError}
          </div>
        ) : null}
        {summaryResults.length > 0 ? (
          <div className="mt-4 grid gap-3">
            {summaryResults.map((result) => (
              <article
                className="rounded-md border border-white/10 bg-black/20 p-4"
                key={result.symbol}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="font-mono text-sm font-semibold text-cyan-200">
                    {result.symbol}
                  </h2>
                  <span
                    className={`rounded-sm px-2 py-1 text-xs ${
                      result.status === "success"
                        ? "bg-emerald-300/10 text-emerald-200"
                        : result.status === "no_news"
                          ? "bg-zinc-300/10 text-zinc-300"
                        : "bg-rose-300/10 text-rose-200"
                    }`}
                  >
                    {summaryStatusLabel(result)}
                  </span>
                </div>
                {result.status === "success" ? (
                  <div className="grid gap-3">
                    <p className="text-sm font-medium leading-6 text-zinc-100">
                      {result.headline}
                    </p>
                    {result.catalysts.length > 0 ? (
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                          Catalysts
                        </h3>
                        <ul className="mt-2 grid gap-1 text-sm leading-6 text-zinc-300">
                          {result.catalysts.map((catalyst) => (
                            <li key={`${result.symbol}-${catalyst.type}-${catalyst.summary}`}>
                              <span className="text-zinc-100">{catalyst.type}:</span>{" "}
                              {catalyst.summary}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {hasGappersSummaryEarningsOrGuidance(result) ? (
                      <SummaryEarningsBlock result={result} />
                    ) : null}
                    {result.sources.length > 0 ? (
                      <SummarySources sources={result.sources} />
                    ) : null}
                  </div>
                ) : result.status === "no_news" ? (
                  <p className="text-sm text-zinc-400">{result.message}</p>
                ) : (
                  <p className="text-sm text-rose-200">{result.error}</p>
                )}
              </article>
            ))}
          </div>
        ) : null}
      </section>

      <section className="mt-4 overflow-hidden rounded-md border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
              <tr>
                <th className="px-4 py-3">
                  <input
                    aria-label="Select all visible gappers"
                    checked={allVisibleSelected}
                    className="h-4 w-4 accent-cyan-300"
                    onChange={(event) => toggleAllVisible(event.target.checked)}
                    type="checkbox"
                  />
                </th>
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
                  <td className="px-4 py-3">
                    <input
                      aria-label={`Select ${row.symbol}`}
                      checked={selectedSymbols.has(row.symbol)}
                      className="h-4 w-4 accent-cyan-300"
                      onChange={(event) => toggleSymbol(row.symbol, event.target.checked)}
                      type="checkbox"
                    />
                  </td>
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
                  <td className="px-4 py-8 text-zinc-500" colSpan={10}>
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

function SummarySources({
  sources,
}: {
  sources: Extract<GappersNewsSummaryResult, { status: "success" }>["sources"];
}) {
  return (
    <div className="border-t border-white/10 pt-3 text-xs leading-5 text-zinc-500">
      {sources.map((source) => (
        <div key={source.id}>
          {source.url ? (
            <a
              className="hover:text-zinc-300"
              href={source.url}
              rel="noreferrer"
              target="_blank"
            >
              {source.publisher ? `${source.publisher}: ` : ""}
              {source.title}
            </a>
          ) : (
            <span>
              {source.publisher ? `${source.publisher}: ` : ""}
              {source.title}
            </span>
          )}
          {source.publishedUtc ? ` - ${formatDateTime(source.publishedUtc)}` : ""}
        </div>
      ))}
    </div>
  );
}

function SummaryEarningsBlock({
  result,
}: {
  result: Extract<GappersNewsSummaryResult, { status: "success" }>;
}) {
  const rows = [
    result.earnings.adjustedEps.actual != null
      ? `Adjusted EPS ${formatSummaryCurrency(result.earnings.adjustedEps.actual, 2)}`
      : null,
    result.earnings.revenue.actual != null
      ? `Revenue ${formatSummaryLargeCurrency(result.earnings.revenue.actual)}`
      : null,
    result.nextQuarterGuidance.eps
      ? `Next quarter EPS ${result.nextQuarterGuidance.eps}`
      : null,
    result.nextQuarterGuidance.revenue
      ? `Next quarter revenue ${result.nextQuarterGuidance.revenue}`
      : null,
    result.fullYearGuidance.eps
      ? `Full year EPS ${result.fullYearGuidance.eps}`
      : null,
    result.fullYearGuidance.revenue
      ? `Full year revenue ${result.fullYearGuidance.revenue}`
      : null,
  ].filter((row): row is string => row != null);

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
        Earnings / Guidance
      </h3>
      <ul className="mt-2 grid gap-1 text-sm leading-6 text-zinc-300">
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}

function summaryStatusLabel(result: GappersNewsSummaryResult) {
  if (result.status === "success") {
    return `${result.sourceLayer} / ${result.confidence}`;
  }

  return result.status === "no_news" ? "no news" : "error";
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

function formatSummaryCurrency(value: number, decimals: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
    style: "currency",
  }).format(value);
}

function formatSummaryLargeCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000_000) {
    return `$${trimSummaryNumber(value / 1_000_000_000)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `$${trimSummaryNumber(value / 1_000_000)}M`;
  }

  return formatSummaryCurrency(value, 0);
}

function trimSummaryNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value);
}
