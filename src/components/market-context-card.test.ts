import { describe, expect, it } from "vitest";

import {
  marketContextCardSections,
  sourcesForItem,
} from "./market-context-card";

const result = {
  brief: {
    events: [{ category: "inflation", kind: "scheduled" as const, sourceIds: ["web:1"], summary: "CPI at 8:30 AM ET", timeEt: "8:30 AM ET" }],
    generatedAt: "2026-06-23T11:00:00.000Z",
    headline: "Inflation is the market's main focus.",
    marketDate: "2026-06-23",
    notableNews: [{ category: "geopolitics", kind: "developing" as const, sourceIds: ["web:2"], summary: "Oil is rising on supply concerns.", timeEt: null }],
    sources: [
      { id: "web:1", publisher: "bls.gov", title: "CPI", url: "https://bls.gov/cpi" },
      { id: "web:2", publisher: "example.com", title: "Oil", url: "https://example.com/oil" },
    ],
  },
  canRefresh: true,
  error: null,
  isStale: false,
};

describe("marketContextCardSections", () => {
  it("keeps dashboard focused on the headline and events", () => {
    expect(marketContextCardSections(result, "dashboard")).toEqual({
      events: result.brief.events,
      headline: result.brief.headline,
      notableNews: [],
    });
  });

  it("shows notable market news on gappers", () => {
    expect(marketContextCardSections(result, "gappers")).toEqual({
      events: result.brief.events,
      headline: result.brief.headline,
      notableNews: result.brief.notableNews,
    });
  });
});

describe("sourcesForItem", () => {
  it("returns only declared sources", () => {
    expect(sourcesForItem(result.brief!, result.brief!.events[0]!)).toEqual([
      result.brief!.sources[0],
    ]);
  });
});
