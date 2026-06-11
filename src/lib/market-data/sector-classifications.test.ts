import { describe, expect, it, vi } from "vitest";

import {
  classificationFromTickerDetails,
  readStockClassifications,
  sectorFromSicCode,
  stockClassificationUpsertPayload,
  syncStockClassifications,
} from "./sector-classifications";

const fetchedAt = new Date("2026-06-10T12:00:00.000Z");

describe("sectorFromSicCode", () => {
  it("maps SIC codes into familiar sector labels", () => {
    expect(sectorFromSicCode("1311")).toBe("Energy");
    expect(sectorFromSicCode("2834")).toBe("Health Care");
    expect(sectorFromSicCode("3674")).toBe("Information Technology");
    expect(sectorFromSicCode("6021")).toBe("Financials");
    expect(sectorFromSicCode("6798")).toBe("Real Estate");
    expect(sectorFromSicCode("4911")).toBe("Utilities");
  });

  it("returns null for unsupported or missing SIC codes", () => {
    expect(sectorFromSicCode(null)).toBeNull();
    expect(sectorFromSicCode("9999")).toBeNull();
  });
});

describe("classificationFromTickerDetails", () => {
  it("builds an SIC-derived classification from ticker details", () => {
    expect(
      classificationFromTickerDetails({
        active: true,
        name: "Acme Semiconductors",
        sicCode: "3674",
        sicDescription: "Semiconductors and Related Devices",
        ticker: "acme",
      }),
    ).toEqual({
      industry: "Semiconductors and Related Devices",
      name: "Acme Semiconductors",
      sector: "Information Technology",
      source: "sic-derived",
      ticker: "ACME",
    });
  });

  it("skips inactive or unclassified details", () => {
    expect(
      classificationFromTickerDetails({
        active: false,
        name: "Inactive Corp",
        sicCode: "3674",
        sicDescription: "Semiconductors and Related Devices",
        ticker: "DEAD",
      }),
    ).toBeNull();
    expect(
      classificationFromTickerDetails({
        active: true,
        name: "Unknown Corp",
        sicCode: null,
        sicDescription: null,
        ticker: "UNKN",
      }),
    ).toBeNull();
  });
});

describe("stockClassificationUpsertPayload", () => {
  it("maps classification fields to Supabase columns", () => {
    expect(
      stockClassificationUpsertPayload(
        {
          industry: "Semiconductors",
          name: "Acme Corp",
          sector: "Information Technology",
          source: "sic-derived",
          ticker: "ACME",
        },
        fetchedAt,
      ),
    ).toEqual({
      industry: "Semiconductors",
      name: "Acme Corp",
      sector: "Information Technology",
      source: "sic-derived",
      source_updated_at: "2026-06-10T12:00:00.000Z",
      ticker: "ACME",
      updated_at: "2026-06-10T12:00:00.000Z",
    });
  });
});

describe("stock classification store", () => {
  it("upserts classifications by ticker and reads them back", async () => {
    const client = fakeClassificationClient([
      {
        industry: "Semiconductors",
        name: "Acme Corp",
        sector: "Information Technology",
        source: "sic-derived",
        ticker: "ACME",
      },
    ]);

    await syncStockClassifications({
      classifications: [
        {
          industry: "Banks",
          name: "Bank Corp",
          sector: "Financials",
          source: "sic-derived",
          ticker: "BANK",
        },
      ],
      client,
      fetchedAt,
    });

    expect(client.upsertedRows).toEqual([
      expect.objectContaining({ sector: "Financials", ticker: "BANK" }),
    ]);
    expect(client.upsertOptions).toEqual({ onConflict: "ticker" });
    await expect(readStockClassifications({ client })).resolves.toEqual([
      {
        industry: "Semiconductors",
        name: "Acme Corp",
        sector: "Information Technology",
        source: "sic-derived",
        ticker: "ACME",
      },
    ]);
  });
});

function fakeClassificationClient(storedRows: Record<string, unknown>[]) {
  const client = {
    upsertOptions: null as unknown,
    upsertedRows: [] as Record<string, unknown>[],
    from(table: string) {
      expect(table).toBe("stock_classifications");

      return {
        select: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: storedRows, error: null })),
        })),
        upsert: vi.fn((rows, options) => {
          client.upsertedRows.push(...rows);
          client.upsertOptions = options;
          return Promise.resolve({ error: null });
        }),
      };
    },
  };

  return client;
}
