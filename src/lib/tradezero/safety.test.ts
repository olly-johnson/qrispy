import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertTradeZeroReadOnlyRequest,
  getTradeZeroSafetyStatus,
} from "./safety";

describe("TradeZero safety guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows only known read-only TradeZero endpoints", () => {
    expect(() =>
      assertTradeZeroReadOnlyRequest({
        method: "GET",
        path: "/v1/api/accounts/TZ123/orders-with-pagination/start-date/2026-01-01?limit=100&offset=100",
      }),
    ).not.toThrow();

    expect(() =>
      assertTradeZeroReadOnlyRequest({
        method: "POST",
        path: "/v1/api/accounts/TZ123/orders",
      }),
    ).toThrow("TradeZero write operations are disabled");

    expect(() =>
      assertTradeZeroReadOnlyRequest({
        method: "GET",
        path: "/v1/api/accounts/TZ123/orders/new",
      }),
    ).toThrow("TradeZero endpoint is not on the read-only allowlist");
  });

  it("requires explicit read-only and broker 2FA confirmations before syncing", () => {
    vi.stubEnv("TRADEZERO_READ_ONLY_CONFIRMED", "true");
    vi.stubEnv("TRADEZERO_BROKER_2FA_CONFIRMED", "false");

    expect(getTradeZeroSafetyStatus()).toEqual({
      canSync: false,
      readOnlyConfirmed: true,
      brokerTwoFactorConfirmed: false,
      missing: ["TRADEZERO_BROKER_2FA_CONFIRMED"],
    });
  });
});
