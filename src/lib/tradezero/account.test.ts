import { describe, expect, it } from "vitest";

import { getTradeZeroAccountId } from "./account";

describe("getTradeZeroAccountId", () => {
  it("reads the documented account field from account list rows", () => {
    expect(getTradeZeroAccountId({ account: "TZP12345678" })).toBe("TZP12345678");
  });
});
