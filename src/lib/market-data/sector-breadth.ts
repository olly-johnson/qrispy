import type { NormalizedMarketSnapshot } from "./market-universe";
import type {
  SectorName,
  StockClassification,
} from "./sector-classifications";
import type { OhlcvBar } from "./types";

export type SectorBreadthStock = {
  lastUpdatedAt: string | null;
  name: string;
  price: number;
  symbol: string;
  todayPercent: number;
  volume: number;
};

export type SectorBreadthIndustry = {
  averageTodayPercent: number;
  down: number;
  flat: number;
  medianTodayPercent: number;
  name: string;
  stocks: SectorBreadthStock[];
  up: number;
};

export type SectorBreadthSector = {
  averageTodayPercent: number;
  down: number;
  flat: number;
  industries: SectorBreadthIndustry[];
  medianTodayPercent: number;
  name: SectorName;
  stocks: SectorBreadthStock[];
  up: number;
};

export type HistoricalBreadthMetrics = {
  down13In34Days: number;
  ratio10Day: number | null;
  ratio5Day: number | null;
  t2108: number | null;
  t2108Covered: number;
  up13In34Days: number;
};

export type SectorBreadthSnapshot = {
  coverage: {
    mapped: number;
    totalCommonStocks: number;
    unmapped: number;
    withLiveSnapshot: number;
  };
  liveBreadth: {
    down13In34Days: number;
    down4Percent: number;
    flat: number;
    green: number;
    ratio10Day: number | null;
    ratio5Day: number | null;
    red: number;
    t2108: number | null;
    t2108Covered: number;
    up13In34Days: number;
    up4Percent: number;
  };
  loadedAt: string;
  sectors: SectorBreadthSector[];
};

export function buildSectorBreadthSnapshot(input: {
  classifications: StockClassification[];
  historicalMetrics: HistoricalBreadthMetrics;
  loadedAt: string;
  snapshots: NormalizedMarketSnapshot[];
  totalCommonStocks: number;
}): SectorBreadthSnapshot {
  const classificationByTicker = new Map(
    input.classifications.map((classification) => [
      classification.ticker.toUpperCase(),
      classification,
    ]),
  );
  const stocks: Array<SectorBreadthStock & { industry: string; sector: SectorName }> = [];

  for (const snapshot of input.snapshots) {
    const classification = classificationByTicker.get(snapshot.symbol);

    if (!classification) {
      continue;
    }

    stocks.push({
      industry: classification.industry,
      lastUpdatedAt: snapshot.lastUpdatedAt,
      name: classification.name,
      price: round(snapshot.price, 2),
      sector: classification.sector,
      symbol: snapshot.symbol,
      todayPercent: round(
        ((snapshot.price - snapshot.previousClose) / snapshot.previousClose) *
          100,
        2,
      ),
      volume: snapshot.volume,
    });
  }

  const sectors = groupSectors(stocks);
  const liveCounts = participationCounts(stocks);

  return {
    coverage: {
      mapped: input.classifications.length,
      totalCommonStocks: input.totalCommonStocks,
      unmapped: Math.max(0, input.totalCommonStocks - input.classifications.length),
      withLiveSnapshot: stocks.length,
    },
    liveBreadth: {
      down13In34Days: input.historicalMetrics.down13In34Days,
      down4Percent: stocks.filter((stock) => stock.todayPercent <= -4).length,
      flat: liveCounts.flat,
      green: liveCounts.up,
      ratio10Day: input.historicalMetrics.ratio10Day,
      ratio5Day: input.historicalMetrics.ratio5Day,
      red: liveCounts.down,
      t2108: input.historicalMetrics.t2108,
      t2108Covered: input.historicalMetrics.t2108Covered,
      up13In34Days: input.historicalMetrics.up13In34Days,
      up4Percent: stocks.filter((stock) => stock.todayPercent >= 4).length,
    },
    loadedAt: input.loadedAt,
    sectors,
  };
}

export function calculateHistoricalBreadthMetrics(input: {
  barsBySymbol: Map<string, OhlcvBar[]>;
  todayDown4Percent: number;
  todayUp4Percent: number;
}): HistoricalBreadthMetrics {
  let above40 = 0;
  let t2108Covered = 0;
  let up13In34Days = 0;
  let down13In34Days = 0;
  const dailyCounts = new Map<string, { down4: number; up4: number }>();

  for (const bars of input.barsBySymbol.values()) {
    const sorted = bars
      .filter((bar) => Number.isFinite(bar.close))
      .sort((left, right) => left.barStartAt.localeCompare(right.barStartAt));
    const latest = sorted.at(-1);

    if (!latest) {
      continue;
    }

    const sma40 = averageTail(
      sorted
        .slice(0, -1)
        .map((bar) => bar.close)
        .concat(latest.close),
      40,
    );

    if (sma40 != null) {
      t2108Covered += 1;
      if (latest.close > sma40) {
        above40 += 1;
      }
    }

    const anchor34 = sorted.at(-35);
    if (anchor34 && anchor34.close > 0) {
      const move = ((latest.close - anchor34.close) / anchor34.close) * 100;
      if (move >= 13) {
        up13In34Days += 1;
      }
      if (move <= -13) {
        down13In34Days += 1;
      }
    }

    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (!previous || !current || previous.close <= 0) {
        continue;
      }
      const move = ((current.close - previous.close) / previous.close) * 100;
      const date = current.barStartAt.slice(0, 10);
      const counts = dailyCounts.get(date) ?? { down4: 0, up4: 0 };
      if (move >= 4) {
        counts.up4 += 1;
      }
      if (move <= -4) {
        counts.down4 += 1;
      }
      dailyCounts.set(date, counts);
    }
  }

  const orderedCounts = [...dailyCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, counts]) => counts);
  const withToday = [
    ...orderedCounts,
    { down4: input.todayDown4Percent, up4: input.todayUp4Percent },
  ];

  return {
    down13In34Days,
    ratio10Day: ratioForTail(withToday, 10),
    ratio5Day: ratioForTail(withToday, 5),
    t2108:
      t2108Covered === 0 ? null : round((above40 / t2108Covered) * 100, 2),
    t2108Covered,
    up13In34Days,
  };
}

function groupSectors(
  stocks: Array<SectorBreadthStock & { industry: string; sector: SectorName }>,
) {
  const bySector = new Map<SectorName, typeof stocks>();

  for (const stock of stocks) {
    bySector.set(stock.sector, [...(bySector.get(stock.sector) ?? []), stock]);
  }

  return [...bySector.entries()]
    .map(([name, sectorStocks]) => {
      const byIndustry = new Map<string, typeof stocks>();
      for (const stock of sectorStocks) {
        byIndustry.set(stock.industry, [
          ...(byIndustry.get(stock.industry) ?? []),
          stock,
        ]);
      }
      const industries = [...byIndustry.entries()]
        .map(([industryName, industryStocks]) =>
          summarizeIndustry(industryName, industryStocks),
        )
        .sort((left, right) => right.averageTodayPercent - left.averageTodayPercent);
      const summary = summarizeStocks(sectorStocks);

      return {
        ...summary,
        industries,
        name,
        stocks: sortStocks(sectorStocks),
      };
    })
    .sort((left, right) => right.averageTodayPercent - left.averageTodayPercent);
}

function summarizeIndustry(
  name: string,
  stocks: Array<SectorBreadthStock & { industry: string; sector: SectorName }>,
): SectorBreadthIndustry {
  return {
    ...summarizeStocks(stocks),
    name,
    stocks: sortStocks(stocks),
  };
}

function summarizeStocks(stocks: SectorBreadthStock[]) {
  const counts = participationCounts(stocks);
  const values = stocks.map((stock) => stock.todayPercent);

  return {
    averageTodayPercent: round(average(values), 2),
    down: counts.down,
    flat: counts.flat,
    medianTodayPercent: round(median(values), 2),
    up: counts.up,
  };
}

function participationCounts(stocks: SectorBreadthStock[]) {
  return stocks.reduce(
    (counts, stock) => {
      if (stock.todayPercent > 0) {
        counts.up += 1;
      } else if (stock.todayPercent < 0) {
        counts.down += 1;
      } else {
        counts.flat += 1;
      }
      return counts;
    },
    { down: 0, flat: 0, up: 0 },
  );
}

function sortStocks<T extends SectorBreadthStock>(stocks: T[]) {
  return [...stocks].sort(
    (left, right) =>
      right.todayPercent - left.todayPercent ||
      left.symbol.localeCompare(right.symbol),
  );
}

function ratioForTail(values: Array<{ down4: number; up4: number }>, period: number) {
  if (values.length < period) {
    return null;
  }

  const tail = values.slice(-period);
  const up = tail.reduce((sum, item) => sum + item.up4, 0);
  const down = tail.reduce((sum, item) => sum + item.down4, 0);

  if (down === 0) {
    return up === 0 ? null : round(up, 2);
  }

  return round(up / down, 2);
}

function averageTail(values: number[], period: number) {
  if (values.length < period) {
    return null;
  }

  return average(values.slice(-period));
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function round(value: number, decimals: number) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
