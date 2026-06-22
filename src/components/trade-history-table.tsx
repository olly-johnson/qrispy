"use client";

import Link from "next/link";
import { BarChart3, FolderPlus } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { createTradeReviewGroup } from "@/app/actions";
import { formatDateTime, formatMoney } from "@/components/format";
import {
  getTradeReviewSelection,
  type TradeHistoryItem,
} from "@/lib/trade-review-groups";

export function TradeHistoryTable({ items }: { items: TradeHistoryItem[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const selection = useMemo(
    () => getTradeReviewSelection(items, selectedIds),
    [items, selectedIds],
  );

  function toggleTrade(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    );
  }

  function groupSelected() {
    if (selection.error) {
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      for (const tradeId of selection.selectedTradeIds) {
        formData.append("tradeId", tradeId);
      }
      await createTradeReviewGroup(formData);
      setSelectedIds([]);
    });
  }

  return (
    <section className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Select closed trades for the same ticker to review them as one campaign.
        </p>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-300 px-3 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-zinc-500"
          disabled={Boolean(selection.error) || isPending}
          onClick={groupSelected}
          type="button"
        >
          <FolderPlus className="h-3.5 w-3.5" />
          {isPending ? "Grouping…" : `Group selected (${selection.selectedTradeIds.length})`}
        </button>
      </div>
      {selection.error && selection.selectedTradeIds.length > 0 ? (
        <p className="mb-3 text-sm text-amber-300">{selection.error}</p>
      ) : null}
      <div className="overflow-hidden rounded-md border border-white/10">
        <table className="w-full min-w-[840px] text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="w-12 px-4 py-3"><span className="sr-only">Select</span></th>
              <th className="px-4 py-3">Symbol</th>
              <th className="px-4 py-3">Opened</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Direction</th>
              <th className="px-4 py-3 text-right">Realized</th>
              <th className="px-4 py-3 text-right">Fees</th>
              <th className="px-4 py-3 text-right">Analyse</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {items.map((item) =>
              item.kind === "group" ? (
                <GroupRow group={item.group} key={`group:${item.group.id}`} />
              ) : (
                <TradeRow
                  key={item.trade.id}
                  selected={selectedIds.includes(item.trade.id)}
                  onSelect={toggleTrade}
                  trade={item.trade}
                />
              ),
            )}
            {items.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-zinc-500" colSpan={8}>
                  Sync TradeZero to reconstruct trades.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TradeRow({
  onSelect,
  selected,
  trade,
}: {
  trade: Extract<TradeHistoryItem, { kind: "trade" }>["trade"];
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const selectable = trade.status === "CLOSED";

  return (
    <tr className="transition hover:bg-white/[0.035]">
      <td className="px-4 py-3">
        {selectable ? (
          <input
            aria-label={`Select ${trade.symbol} ${trade.id}`}
            checked={selected}
            className="h-4 w-4 accent-cyan-300"
            onChange={() => onSelect(trade.id)}
            type="checkbox"
          />
        ) : null}
      </td>
      <td className="px-4 py-3">
        <Link href={`/trades/${trade.id}`} className="font-mono text-cyan-200">
          {trade.symbol}
        </Link>
      </td>
      <td className="px-4 py-3 text-zinc-400">{formatDateTime(trade.openedAt)}</td>
      <td className="px-4 py-3">{trade.status}</td>
      <td className="px-4 py-3">{trade.direction}</td>
      <td className="px-4 py-3 text-right font-mono">{formatMoney(trade.realizedPnl)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatMoney(trade.totalFees)}</td>
      <td className="px-4 py-3 text-right">
        <TradeOpenLink href={`/trades/${trade.id}`} />
      </td>
    </tr>
  );
}

function GroupRow({ group }: { group: Extract<TradeHistoryItem, { kind: "group" }>["group"] }) {
  return (
    <tr className="bg-cyan-300/[0.035] transition hover:bg-cyan-300/[0.07]">
      <td className="px-4 py-3" />
      <td className="px-4 py-3">
        <Link href={`/trades/groups/${group.id}`} className="font-mono text-cyan-200">
          {group.label}
        </Link>
      </td>
      <td className="px-4 py-3 text-zinc-400">
        {formatDateTime(group.openedAt)} – {formatDateTime(group.closedAt)}
      </td>
      <td className="px-4 py-3"><span className="text-cyan-200">REVIEW GROUP</span></td>
      <td className="px-4 py-3">{group.tradeCount} trades</td>
      <td className="px-4 py-3 text-right font-mono">{formatMoney(group.realizedPnl)}</td>
      <td className="px-4 py-3 text-right font-mono">{formatMoney(group.totalFees)}</td>
      <td className="px-4 py-3 text-right">
        <TradeOpenLink href={`/trades/groups/${group.id}`} />
      </td>
    </tr>
  );
}

function TradeOpenLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 px-3 text-xs font-medium text-zinc-200 transition hover:border-cyan-300/50 hover:text-cyan-200"
    >
      <BarChart3 className="h-3.5 w-3.5" />
      Open
    </Link>
  );
}
