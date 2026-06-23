import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  createOpenAiMarketContextProvider: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUser: vi.fn(),
  getMarketContextConfig: vi.fn(),
  refreshMarketContextBrief: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/env", () => ({ getMarketContextConfig: mocks.getMarketContextConfig }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));
vi.mock("@/lib/market-data/market-context", () => ({
  createOpenAiMarketContextProvider: mocks.createOpenAiMarketContextProvider,
  refreshMarketContextBrief: mocks.refreshMarketContextBrief,
}));

describe("POST /api/market-context/refresh", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1" });
    mocks.getMarketContextConfig.mockReturnValue({ apiKey: "openai-key", model: "gpt-4o-mini" });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: vi.fn() });
    mocks.createOpenAiMarketContextProvider.mockReturnValue({ generate: vi.fn() });
  });

  it("requires an authenticated user", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const response = await POST();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Sign in to refresh market context." });
  });

  it("returns a trading-day response without invoking OpenAI on a weekend", async () => {
    mocks.refreshMarketContextBrief.mockResolvedValue({ brief: null, canRefresh: false, error: null, isStale: false });
    const response = await POST();
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Market context refresh is available on US trading days only." });
  });

  it("returns the newly refreshed brief", async () => {
    mocks.refreshMarketContextBrief.mockResolvedValue({
      brief: { events: [], generatedAt: "2026-06-23T11:00:00.000Z", headline: "CPI", marketDate: "2026-06-23", notableNews: [], sources: [] },
      canRefresh: true,
      error: null,
      isStale: false,
    });
    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ brief: expect.objectContaining({ marketDate: "2026-06-23" }) });
  });
});
