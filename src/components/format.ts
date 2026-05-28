import type { ProvenancedMetric } from "@/lib/portfolio/metrics";

export function formatMoney(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export function provenanceLabel(metric: ProvenancedMetric) {
  if (metric.provenance === "computed_from_positions") {
    return "Computed from latest positions";
  }
  if (metric.provenance === "computed_from_fills") {
    return "Computed from reconstructed fills";
  }
  if (metric.provenance === "missing") {
    return "Missing from latest sync";
  }

  return "Broker reported";
}
