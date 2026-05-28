import { afterEach, describe, expect, it, vi } from "vitest";

import { TradeZeroClient } from "./client";

const config = {
  baseUrl: "https://webapi.tradezero.com",
  apiKeyId: "key-id",
  apiSecretKey: "secret-key",
};

describe("TradeZeroClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads accounts from the documented accounts envelope", async () => {
    vi.stubEnv("TRADEZERO_READ_ONLY_CONFIRMED", "true");
    vi.stubEnv("TRADEZERO_BROKER_2FA_CONFIRMED", "true");
    const fetcher = vi.fn().mockResolvedValue(
      jsonResponse({
        accounts: [
          {
            account: "TZP12345678",
            accountType: "Paper",
          },
        ],
      }),
    );

    const accounts = await new TradeZeroClient(config, fetcher).listAccounts();

    expect(accounts).toEqual([
      {
        account: "TZP12345678",
        accountType: "Paper",
      },
    ]);
  });
});

function jsonResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}
