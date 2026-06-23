"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatDateTime } from "@/components/format";
import type {
  MarketContextBrief,
  MarketContextItem,
  MarketContextLoadResult,
} from "@/lib/market-data/market-context";

export function marketContextCardSections(
  result: MarketContextLoadResult,
  variant: "dashboard" | "gappers",
) {
  return {
    events: result.brief?.events ?? [],
    headline: result.brief?.headline ?? null,
    notableNews: variant === "gappers" ? result.brief?.notableNews ?? [] : [],
  };
}

export function sourcesForItem(brief: MarketContextBrief, item: MarketContextItem) {
  const ids = new Set(item.sourceIds);
  return brief.sources.filter((source) => ids.has(source.id));
}

export function MarketContextCard({
  result,
  variant,
}: {
  result: MarketContextLoadResult;
  variant: "dashboard" | "gappers";
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const sections = marketContextCardSections(result, variant);

  const refresh = async () => {
    setError(null);
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/market-context/refresh", { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to refresh market context.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <section aria-label="Market context" className="mt-6 rounded-md border border-white/10 bg-white/[0.04] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">Market context</h2>
          {result.brief ? (
            <p className="mt-1 text-xs text-zinc-500">
              {result.isStale ? "Last successful brief: " : "Updated: "}
              {formatDateTime(result.brief.generatedAt)}
            </p>
          ) : null}
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-3 text-sm font-semibold text-zinc-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!result.canRefresh || isRefreshing}
          onClick={refresh}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {sections.headline ? <p className="mt-3 text-base font-semibold text-zinc-100">{sections.headline}</p> : <p className="mt-3 text-sm text-zinc-500">Market context is unavailable right now.</p>}
      {sections.notableNews.length > 0 ? <ContextList label="Notable news" brief={result.brief!} items={sections.notableNews} /> : null}
      {sections.events.length > 0 ? <ContextList label="Today’s events" brief={result.brief!} items={sections.events} /> : null}
      {error ?? result.error ? <p className="mt-3 text-sm text-amber-200">{error ?? result.error}</p> : null}
    </section>
  );
}

function ContextList({ brief, items, label }: { brief: MarketContextBrief; items: MarketContextItem[]; label: string }) {
  return <div className="mt-4"><h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</h3><ul className="mt-2 space-y-2 text-sm text-zinc-300">{items.map((item) => <li key={`${item.category}:${item.summary}`}><span>{item.summary}{item.timeEt ? ` · ${item.timeEt}` : ""}</span>{sourcesForItem(brief, item).map((source) => <a className="ml-2 text-xs text-cyan-300 hover:text-cyan-200" href={source.url} key={source.id} rel="noreferrer" target="_blank">{source.publisher ?? source.title}</a>)}</li>)}</ul></div>;
}
