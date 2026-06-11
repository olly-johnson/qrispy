import type { MassiveTickerDetails } from "./massive";

export type StockClassification = {
  industry: string;
  name: string;
  sector: SectorName;
  source: "sic-derived";
  ticker: string;
};

export type SectorName =
  | "Communication Services"
  | "Consumer Discretionary"
  | "Consumer Staples"
  | "Energy"
  | "Financials"
  | "Health Care"
  | "Industrials"
  | "Information Technology"
  | "Materials"
  | "Real Estate"
  | "Utilities";

type ClassificationClient = {
  from(table: "stock_classifications"): {
    select(columns: "*"): {
      order(
        column: "ticker",
        options: { ascending: boolean },
      ): Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
    upsert(
      rows: Record<string, unknown>[],
      options: { onConflict: "ticker" },
    ): Promise<{ error: unknown }>;
  };
};

export function classificationFromTickerDetails(
  details: MassiveTickerDetails,
): StockClassification | null {
  if (details.active === false) {
    return null;
  }

  const ticker = details.ticker.toUpperCase();
  const sector = sectorFromSicCode(details.sicCode);
  const industry = normalizeIndustry(details.sicDescription);
  const name = details.name?.trim();

  if (!ticker || !sector || !industry || !name) {
    return null;
  }

  return {
    industry,
    name,
    sector,
    source: "sic-derived",
    ticker,
  };
}

export function sectorFromSicCode(code: string | null): SectorName | null {
  const sic = Number(code);

  if (!Number.isInteger(sic)) {
    return null;
  }
  if (sic >= 1000 && sic <= 1499) {
    return "Energy";
  }
  if (sic >= 1500 && sic <= 1799) {
    return "Industrials";
  }
  if (sic >= 2000 && sic <= 2199) {
    return "Consumer Staples";
  }
  if (sic >= 2200 && sic <= 2399) {
    return "Consumer Discretionary";
  }
  if (sic >= 2400 && sic <= 2499) {
    return "Materials";
  }
  if (sic >= 2500 && sic <= 2599) {
    return "Consumer Discretionary";
  }
  if (sic >= 2600 && sic <= 2699) {
    return "Materials";
  }
  if (sic >= 2700 && sic <= 2799) {
    return "Communication Services";
  }
  if (sic >= 2800 && sic <= 2899) {
    return "Health Care";
  }
  if (sic >= 2900 && sic <= 2999) {
    return "Energy";
  }
  if (sic >= 3000 && sic <= 3499) {
    return "Materials";
  }
  if (sic >= 3500 && sic <= 3599) {
    return "Industrials";
  }
  if (sic >= 3600 && sic <= 3699) {
    return "Information Technology";
  }
  if (sic >= 3700 && sic <= 3799) {
    return "Industrials";
  }
  if (sic >= 3800 && sic <= 3899) {
    return "Health Care";
  }
  if (sic >= 3900 && sic <= 3999) {
    return "Consumer Discretionary";
  }
  if (sic >= 4000 && sic <= 4899) {
    return "Industrials";
  }
  if (sic >= 4900 && sic <= 4999) {
    return "Utilities";
  }
  if (sic >= 5000 && sic <= 5199) {
    return "Industrials";
  }
  if (sic >= 5200 && sic <= 5999) {
    return "Consumer Discretionary";
  }
  if (sic >= 6000 && sic <= 6499) {
    return "Financials";
  }
  if (sic >= 6500 && sic <= 6799) {
    return "Real Estate";
  }
  if (sic >= 7000 && sic <= 7369) {
    return "Consumer Discretionary";
  }
  if (sic >= 7370 && sic <= 7379) {
    return "Information Technology";
  }
  if (sic >= 7380 && sic <= 7999) {
    return "Industrials";
  }
  if (sic >= 8000 && sic <= 8099) {
    return "Health Care";
  }
  if (sic >= 8100 && sic <= 8999) {
    return "Industrials";
  }

  return null;
}

export function stockClassificationUpsertPayload(
  classification: StockClassification,
  fetchedAt: Date,
) {
  const timestamp = fetchedAt.toISOString();

  return {
    industry: classification.industry,
    name: classification.name,
    sector: classification.sector,
    source: classification.source,
    source_updated_at: timestamp,
    ticker: classification.ticker,
    updated_at: timestamp,
  };
}

export async function syncStockClassifications(input: {
  classifications: StockClassification[];
  client: unknown;
  fetchedAt: Date;
}) {
  if (input.classifications.length === 0) {
    return;
  }

  const client = input.client as ClassificationClient;
  const result = await client.from("stock_classifications").upsert(
    input.classifications.map((classification) =>
      stockClassificationUpsertPayload(classification, input.fetchedAt),
    ),
    { onConflict: "ticker" },
  );

  if (result.error) {
    throw new Error(errorMessage(result.error));
  }
}

export async function readStockClassifications(input: { client: unknown }) {
  const client = input.client as ClassificationClient;
  const { data, error } = await client
    .from("stock_classifications")
    .select("*")
    .order("ticker", { ascending: true });

  if (error) {
    throw new Error(errorMessage(error));
  }

  return (data ?? []).map(classificationFromStoredRow);
}

function classificationFromStoredRow(
  row: Record<string, unknown>,
): StockClassification {
  return {
    industry: String(row.industry),
    name: String(row.name),
    sector: String(row.sector) as SectorName,
    source: "sic-derived",
    ticker: String(row.ticker).toUpperCase(),
  };
}

function normalizeIndustry(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ");

  return normalized || null;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = stringValue(record.message);
    const code = stringValue(record.code);

    if (message && code) {
      return `${code}: ${message}`;
    }
    if (message) {
      return message;
    }
  }

  return String(error);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}
