import { describe, expect, it } from "vitest";

import { chartExplorerHref } from "./chart-explorer-form";

describe("chartExplorerHref", () => {
  it("builds an internal URL with normalized chart filters", () => {
    expect(
      chartExplorerHref({
        symbol: " acme ",
        from: "2026-01-05",
        to: "2026-01-09",
      }),
    ).toBe("/charts?symbol=ACME&from=2026-01-05&to=2026-01-09");
  });
});
