import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { formatDateTime, formatMoney } from "@/components/format";
import { requireUser } from "@/lib/auth/session";
import { getTradeDetail } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const trade = await getTradeDetail(user.id, id);

  if (!trade) {
    notFound();
  }

  return (
    <AppShell user={user}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-2xl font-semibold text-cyan-200">
            {trade.symbol}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {trade.direction} · {trade.status}
          </p>
        </div>
        <div className="text-right font-mono text-2xl text-emerald-300">
          {formatMoney(trade.realizedPnl)}
        </div>
      </div>
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Detail label="Opened" value={formatDateTime(trade.openedAt)} />
        <Detail label="Closed" value={formatDateTime(trade.closedAt)} />
        <Detail label="Fees" value={formatMoney(trade.totalFees)} />
      </section>
      <section className="mt-6 rounded-md border border-white/10 bg-white/[0.045] p-4">
        <h2 className="text-lg font-semibold">Notes</h2>
        <p className="mt-2 text-sm text-zinc-500">
          Evaluation, coaching, and richer trade notes are intentionally left for a later sprint.
        </p>
      </section>
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.045] p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">{label}</div>
      <div className="mt-3 font-mono text-sm text-zinc-100">{value}</div>
    </div>
  );
}
