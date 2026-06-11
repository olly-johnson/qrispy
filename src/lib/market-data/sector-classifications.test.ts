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

  it("throws readable Supabase errors instead of raw objects", async () => {
    const client = fakeClassificationClient([], {
      readError: {
        code: "PGRST205",
        message: "Could not find the table 'public.stock_classifications'",
      },
    });

    await expect(readStockClassifications({ client })).rejects.toThrow(
      "PGRST205: Could not find the table 'public.stock_classifications'",
    );
  });

  it("reads past Supabase's default 1000 row page", async () => {
    const rows = Array.from({ length: 1005 }, (_, index) => ({
      industry: "Semiconductors",
      name: `Company ${index}`,
      sector: "Information Technology",
      source: "sic-derived",
      ticker: `T${String(index).padStart(4, "0")}`,
    }));
    const client = fakeClassificationClient(rows);

    await expect(readStockClassifications({ client })).resolves.toHaveLength(1005);
    expect(client.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

function fakeClassificationClient(
  storedRows: Record<string, unknown>[],
  options: { readError?: unknown } = {},
) {
  const client = {
    ranges: [] as Array<[number, number]>,
    upsertOptions: null as unknown,
    upsertedRows: [] as Record<string, unknown>[],
    from(table: string) {
      expect(table).toBe("stock_classifications");

      return {
        select: vi.fn(() => ({
          order: vi.fn(() => {
            const defaultPage = storedRows.slice(0, 1000);
            const query = {
              range: vi.fn((from: number, to: number) => {
                client.ranges.push([from, to]);
                return Promise.resolve({
                  data: options.readError ? null : storedRows.slice(from, to + 1),
                  error: options.readError ?? null,
                });
              }),
              then(resolve: (value: unknown) => unknown) {
                return Promise.resolve({
                  data: options.readError ? null : defaultPage,
                  error: options.readError ?? null,
                }).then(resolve);
              },
            };

            return query;
          }),
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
