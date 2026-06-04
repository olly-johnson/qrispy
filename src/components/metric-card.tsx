import { Info } from "lucide-react";

import type { ProvenancedMetric } from "@/lib/portfolio/metrics";
import { provenanceLabel } from "@/components/format";

export function MetricCard({
  label,
  metric,
  value,
  accent = "cyan",
}: {
  label: string;
  value: string;
  accent?: "cyan" | "emerald" | "amber" | "rose";
  metric?: ProvenancedMetric;
}) {
  const accentClass = {
    cyan: "text-cyan-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  }[accent];

  return (
    <div className="rounded-md border border-white/10 bg-white/[0.045] p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-zinc-500">
        {label}
        {metric ? <ProvenanceIcon metric={metric} /> : null}
      </div>
      <div className={`mt-3 font-mono text-2xl font-semibold ${accentClass}`}>
        {value}
      </div>
    </div>
  );
}

export function ProvenanceIcon({ metric }: { metric: ProvenancedMetric }) {
  if (metric.provenance === "broker_reported") {
    return null;
  }

  return (
    <span title={provenanceLabel(metric)} className="inline-flex align-middle text-zinc-500">
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}
