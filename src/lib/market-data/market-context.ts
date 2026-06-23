import { isUsEquityTradingDay, type UsEquityCalendarDate } from "./us-equity-calendar";

export type MarketContextItem = {
  category: string;
  kind: "developing" | "scheduled";
  sourceIds: string[];
  summary: string;
  timeEt: string | null;
};

export type MarketContextSource = {
  id: string;
  publisher: string | null;
  title: string;
  url: string;
};

export type MarketContextBrief = {
  events: MarketContextItem[];
  generatedAt: string;
  headline: string;
  marketDate: string;
  notableNews: MarketContextItem[];
  sources: MarketContextSource[];
};

export type MarketContextLoadResult = {
  brief: MarketContextBrief | null;
  canRefresh: boolean;
  error: string | null;
  isStale: boolean;
};

export type MarketContextProvider = {
  generate(input: { marketDate: string }): Promise<Omit<MarketContextBrief, "generatedAt" | "marketDate">>;
};

type MarketContextClient = {
  from(table: "market_daily_briefs"): {
    select(columns: "*"): {
      lte(column: "market_date", value: string): {
        order(column: "market_date", options: { ascending: boolean }): {
          limit(count: number): Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
        };
      };
    };
    upsert(row: Record<string, unknown>, options: { onConflict: string }): Promise<{ error: unknown }>;
  };
};

export function marketContextWindow(now: Date) {
  const current = easternDate(now);
  const isTradingDay = isUsEquityTradingDay(current);
  const hour = easternHour(now);

  return {
    canRefresh: isTradingDay,
    shouldGenerateToday: isTradingDay && hour >= 7,
    tradingDate: formatDate(isTradingDay ? current : previousTradingDate(current)),
  };
}

export async function loadMarketContextBrief(input: {
  client: unknown;
  now?: Date;
  provider: MarketContextProvider | null;
}): Promise<MarketContextLoadResult> {
  const now = input.now ?? new Date();
  const window = marketContextWindow(now);
  const client = input.client as MarketContextClient;
  const existing = await readLatestBrief(client, window.tradingDate);

  if (!window.shouldGenerateToday || existing?.marketDate === window.tradingDate) {
    return { brief: existing, canRefresh: window.canRefresh, error: null, isStale: false };
  }

  if (!input.provider) {
    return {
      brief: existing,
      canRefresh: window.canRefresh,
      error: "OpenAI API key is not configured for market context.",
      isStale: existing != null,
    };
  }

  try {
    const generated = await input.provider.generate({ marketDate: window.tradingDate });
    const brief: MarketContextBrief = {
      ...generated,
      generatedAt: now.toISOString(),
      marketDate: window.tradingDate,
    };
    const result = await client.from("market_daily_briefs").upsert(toStoredBrief(brief), {
      onConflict: "market_date",
    });
    if (result.error) throw result.error;
    return { brief, canRefresh: window.canRefresh, error: null, isStale: false };
  } catch (error) {
    return {
      brief: existing,
      canRefresh: window.canRefresh,
      error: errorMessage(error),
      isStale: existing != null,
    };
  }
}

export async function refreshMarketContextBrief(input: {
  client: unknown;
  now?: Date;
  provider: MarketContextProvider | null;
}): Promise<MarketContextLoadResult> {
  const now = input.now ?? new Date();
  const window = marketContextWindow(now);

  if (!window.canRefresh) {
    return { brief: null, canRefresh: false, error: null, isStale: false };
  }

  if (!input.provider) {
    return {
      brief: null,
      canRefresh: true,
      error: "OpenAI API key is not configured for market context.",
      isStale: false,
    };
  }

  const client = input.client as MarketContextClient;
  try {
    const generated = await input.provider.generate({ marketDate: window.tradingDate });
    const brief: MarketContextBrief = {
      ...generated,
      generatedAt: now.toISOString(),
      marketDate: window.tradingDate,
    };
    const result = await client.from("market_daily_briefs").upsert(toStoredBrief(brief), {
      onConflict: "market_date",
    });
    if (result.error) throw result.error;
    return { brief, canRefresh: true, error: null, isStale: false };
  } catch (error) {
    return { brief: null, canRefresh: true, error: errorMessage(error), isStale: false };
  }
}

async function readLatestBrief(client: MarketContextClient, marketDate: string) {
  const { data, error } = await client
    .from("market_daily_briefs")
    .select("*")
    .lte("market_date", marketDate)
    .order("market_date", { ascending: false })
    .limit(1);
  if (error) throw error;
  const row = data?.[0];
  return row ? fromStoredBrief(row) : null;
}

function fromStoredBrief(row: Record<string, unknown>): MarketContextBrief {
  return {
    events: arrayOf(row.events),
    generatedAt: String(row.generated_at),
    headline: String(row.headline),
    marketDate: String(row.market_date),
    notableNews: arrayOf(row.notable_news),
    sources: arrayOf(row.sources),
  } as MarketContextBrief;
}

function toStoredBrief(brief: MarketContextBrief) {
  return {
    events: brief.events,
    generated_at: brief.generatedAt,
    headline: brief.headline,
    market_date: brief.marketDate,
    notable_news: brief.notableNews,
    sources: brief.sources,
    updated_at: brief.generatedAt,
  };
}

function arrayOf(value: unknown) { return Array.isArray(value) ? value : []; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : String(error); }

function easternDate(now: Date): UsEquityCalendarDate {
  const values = new Intl.DateTimeFormat("en-US", {
    day: "numeric", month: "numeric", timeZone: "America/New_York", year: "numeric",
  }).formatToParts(now);
  return {
    day: Number(values.find((part) => part.type === "day")?.value),
    month: Number(values.find((part) => part.type === "month")?.value),
    year: Number(values.find((part) => part.type === "year")?.value),
  };
}

function easternHour(now: Date) {
  return Number(new Intl.DateTimeFormat("en-US", {
    hour: "numeric", hourCycle: "h23", timeZone: "America/New_York",
  }).format(now));
}

function previousTradingDate(date: UsEquityCalendarDate) {
  const cursor = new Date(Date.UTC(date.year, date.month - 1, date.day - 1, 12));
  while (!isUsEquityTradingDay({ day: cursor.getUTCDate(), month: cursor.getUTCMonth() + 1, year: cursor.getUTCFullYear() })) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return { day: cursor.getUTCDate(), month: cursor.getUTCMonth() + 1, year: cursor.getUTCFullYear() };
}

function formatDate(date: UsEquityCalendarDate) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}
