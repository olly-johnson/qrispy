import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { TradeChartPanel } from "@/components/trade-chart-panel";
import { TradeReviewGroupDetail } from "@/components/trade-review-group-detail";
import { getTradeReviewGroupDetail } from "@/lib/app-data";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function TradeReviewGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const group = await getTradeReviewGroupDetail(user.id, id);

  if (!group) {
    notFound();
  }

  return (
    <AppShell user={user}>
      <Link
        href="/trades"
        className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-cyan-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Trades
      </Link>

      <div className="mt-4">
        <p className="text-sm text-zinc-500">Trade review group</p>
        <h1 className="mt-1 font-mono text-2xl font-semibold text-cyan-200">
          {group.label}
        </h1>
      </div>

      <TradeChartPanel charts={group.charts} stopGroups={[]} title="Campaign chart" />
      <TradeReviewGroupDetail group={group} />
    </AppShell>
  );
}
