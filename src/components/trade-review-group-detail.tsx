"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";

import {
  deleteTradeReviewGroup,
  loadTradeReviewMemberCharts,
  removeTradeReviewGroupMember,
  renameTradeReviewGroup,
} from "@/app/actions";
import { TradeChartPanel } from "@/components/trade-chart-panel";
import { formatDateTime, formatMoney } from "@/components/format";
import type { TradeReviewGroupDetail as TradeReviewGroupDetailData } from "@/lib/app-data";
import type { TradeCharts } from "@/lib/market-data/trade-charts";

export function TradeReviewGroupDetail({ group }: { group: TradeReviewGroupDetailData }) {
  const router = useRouter();
  const [name, setName] = useState(group.customName ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [memberCharts, setMemberCharts] = useState<Record<string, TradeCharts>>({});
  const [expandedMemberKeys, setExpandedMemberKeys] = useState<Record<string, boolean>>({});
  const [loadingMemberKey, setLoadingMemberKey] = useState<string | null>(null);
  const [memberChartErrors, setMemberChartErrors] = useState<Record<string, string>>({});

  function rename() {
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.set("name", name);
        await renameTradeReviewGroup(group.id, formData);
      } catch (caught) {
        setError(messageFor(caught));
      }
    });
  }

  function removeMember(reconstructionKey: string) {
    startTransition(async () => {
      try {
        await removeTradeReviewGroupMember(group.id, reconstructionKey);
      } catch (caught) {
        setError(messageFor(caught));
      }
    });
  }

  function deleteGroup() {
    startTransition(async () => {
      try {
        await deleteTradeReviewGroup(group.id);
        router.replace("/trades");
      } catch (caught) {
        setError(messageFor(caught));
      }
    });
  }

  async function toggleMemberChart(reconstructionKey: string) {
    if (expandedMemberKeys[reconstructionKey]) {
      setExpandedMemberKeys((current) => ({ ...current, [reconstructionKey]: false }));
      return;
    }

    if (memberCharts[reconstructionKey]) {
      setExpandedMemberKeys((current) => ({ ...current, [reconstructionKey]: true }));
      return;
    }

    setLoadingMemberKey(reconstructionKey);
    setMemberChartErrors((current) => {
      const { [reconstructionKey]: _ignored, ...remaining } = current;
      return remaining;
    });
    try {
      const charts = await loadTradeReviewMemberCharts(group.id, reconstructionKey);
      setMemberCharts((current) => ({ ...current, [reconstructionKey]: charts }));
      setExpandedMemberKeys((current) => ({ ...current, [reconstructionKey]: true }));
    } catch (caught) {
      setMemberChartErrors((current) => ({
        ...current,
        [reconstructionKey]: messageFor(caught),
      }));
    } finally {
      setLoadingMemberKey((current) => (current === reconstructionKey ? null : current));
    }
  }

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Campaign totals</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {group.tradeCount} trades · {formatDateTime(group.openedAt)} – {formatDateTime(group.closedAt)}
          </p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-400/30 px-3 text-xs font-semibold text-rose-200 transition hover:border-rose-300 hover:bg-rose-300/10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isPending}
          onClick={deleteGroup}
          type="button"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete group
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Realized P&L" value={formatMoney(group.realizedPnl)} />
        <Metric label="Fees" value={formatMoney(group.totalFees)} />
        <Metric label="Trades" value={String(group.tradeCount)} />
        <Metric label="Ticker" value={group.symbol} />
      </div>

      <form
        className="mt-6 flex flex-wrap items-end gap-3 rounded-md border border-white/10 bg-white/[0.045] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          rename();
        }}
      >
        <label className="grid gap-2 text-sm text-zinc-300">
          Group name
          <input
            className="h-9 w-72 rounded-md border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:border-cyan-300"
            maxLength={120}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder={group.label}
            value={name}
          />
        </label>
        <button
          className="h-9 rounded-md bg-cyan-300 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          disabled={isPending}
          type="submit"
        >
          Save name
        </button>
        <p className="text-xs text-zinc-500">Leave blank to use {group.label}.</p>
      </form>
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

      <div className="mt-8">
        <h2 className="text-lg font-semibold">Trade timeline</h2>
        <div className="mt-4 grid gap-3">
          {group.timeline.map((trade, index) => (
            <article
              className="rounded-md border border-white/10 bg-white/[0.045] p-4"
              key={trade.reconstructionKey}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-sm text-cyan-200">T{index + 1} · {trade.direction}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {formatDateTime(trade.openedAt)} – {formatDateTime(trade.closedAt)} · {duration(trade.openedAt, trade.closedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="inline-flex h-8 items-center rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-200 transition hover:border-cyan-300/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={loadingMemberKey === trade.reconstructionKey}
                    onClick={() => void toggleMemberChart(trade.reconstructionKey)}
                    type="button"
                  >
                    {loadingMemberKey === trade.reconstructionKey
                      ? "Loading chart…"
                      : expandedMemberKeys[trade.reconstructionKey]
                        ? "Hide chart"
                        : "View chart"}
                  </button>
                  <Link
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-200 transition hover:border-cyan-300/50 hover:text-cyan-200"
                    href={`/trades/${trade.id}`}
                  >
                    Open trade <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    aria-label={`Remove ${trade.symbol} ${trade.id} from group`}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-300 transition hover:border-rose-300/50 hover:text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isPending}
                    onClick={() => removeMember(trade.reconstructionKey)}
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" /> Remove from group
                  </button>
                </div>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
                <TradeMetric label="Size" value={formatQuantity(trade.maxAbsQuantity ?? trade.entryQuantity)} />
                <TradeMetric label="P&L" value={formatMoney(trade.realizedPnl)} />
                <TradeMetric label="Fees" value={formatMoney(trade.totalFees)} />
                <TradeMetric label="Avg entry" value={formatPrice(trade.avgEntryPrice)} />
                <TradeMetric label="Avg exit" value={formatPrice(trade.avgExitPrice)} />
              </dl>
              {memberChartErrors[trade.reconstructionKey] ? (
                <p className="mt-4 text-sm text-rose-300">
                  {memberChartErrors[trade.reconstructionKey]}
                </p>
              ) : null}
              {expandedMemberKeys[trade.reconstructionKey] ? (
                <TradeChartPanel
                  charts={memberCharts[trade.reconstructionKey]}
                  title="Original trade chart"
                />
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.045] p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-3 font-mono text-sm text-zinc-100">{value}</div>
    </div>
  );
}

function TradeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
      <dd className="mt-1 font-mono text-zinc-100">{value}</dd>
    </div>
  );
}

function duration(openedAt: string, closedAt: string | null) {
  if (!closedAt) return "Open";
  const minutes = Math.max(0, Math.round((Date.parse(closedAt) - Date.parse(openedAt)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatQuantity(value: number | null | undefined) {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function formatPrice(value: number | null | undefined) {
  if (value == null) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Unable to update this review group.";
}
