import type { GappersRow } from "./gappers";

export type GappersFilters = {
  includeEtfs: boolean;
  includeStocks: boolean;
  minDollarVolume: number;
  minGapPercent: number;
  minPrice: number;
};

export const DEFAULT_GAPPERS_FILTERS: GappersFilters = {
  includeEtfs: true,
  includeStocks: true,
  minDollarVolume: 100_000,
  minGapPercent: 6,
  minPrice: 0.5,
};

export function filterGappersRows(rows: GappersRow[], filters: GappersFilters) {
  return rows.filter((row) => {
    if (row.price <= filters.minPrice) {
      return false;
    }
    if (row.gapPercent < filters.minGapPercent) {
      return false;
    }
    if (row.activeDollarVolume < filters.minDollarVolume) {
      return false;
    }
    if (row.securityType === "ETF" && !filters.includeEtfs) {
      return false;
    }
    if (row.securityType === "Stock" && !filters.includeStocks) {
      return false;
    }

    return true;
  });
}
