import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getMarketContextConfig,
  getNewsSummaryGrokConfig,
  getNewsSummaryLlmConfig,
  getNewsSummaryMarketauxConfig,
  getNewsSummaryWebSearchConfig,
  getNewsSummaryXConfig,
} from "./env";

describe("getMarketContextConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the existing OpenAI key and default model", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    expect(getMarketContextConfig()).toEqual({
      apiKey: "openai-key",
      model: "gpt-4o-mini",
    });
  });

  it("returns null when OpenAI is not configured", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(getMarketContextConfig()).toBeNull();
  });
});

describe("getNewsSummaryLlmConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to OpenAI and a structured-output capable model", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    expect(getNewsSummaryLlmConfig()).toEqual({
      apiKey: "openai-key",
      model: "gpt-5.5",
      provider: "openai",
    });
  });

  it("returns null when the selected OpenAI provider has no key", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("NEWS_SUMMARY_LLM_PROVIDER", "openai");

    expect(getNewsSummaryLlmConfig()).toBeNull();
  });

  it("preserves configured provider and model identifiers", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("NEWS_SUMMARY_LLM_MODEL", "gpt-4o-2024-08-06");
    vi.stubEnv("NEWS_SUMMARY_LLM_PROVIDER", "openai");

    expect(getNewsSummaryLlmConfig()).toEqual({
      apiKey: "openai-key",
      model: "gpt-4o-2024-08-06",
      provider: "openai",
    });
  });
});

describe("getNewsSummaryWebSearchConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables OpenAI web search when requested and OpenAI is configured", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("NEWS_SUMMARY_WEB_SEARCH_ENABLED", "true");

    expect(getNewsSummaryWebSearchConfig()).toEqual({
      apiKey: "openai-key",
      enabled: true,
      provider: "openai",
    });
  });

  it("disables web search by default", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    expect(getNewsSummaryWebSearchConfig()).toEqual({
      enabled: false,
      provider: "openai",
    });
  });
});

describe("getNewsSummaryMarketauxConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables Marketaux when requested with an API key", () => {
    vi.stubEnv("NEWS_SUMMARY_MARKETAUX_ENABLED", "true");
    vi.stubEnv("MARKETAUX_API_KEY", "marketaux-key");

    expect(getNewsSummaryMarketauxConfig()).toEqual({
      apiKey: "marketaux-key",
      baseUrl: "https://api.marketaux.com/v1",
      enabled: true,
    });
  });

  it("accepts MARKETAUX_API_TOKEN as an alias", () => {
    vi.stubEnv("NEWS_SUMMARY_MARKETAUX_ENABLED", "true");
    vi.stubEnv("MARKETAUX_API_TOKEN", "marketaux-token");

    expect(getNewsSummaryMarketauxConfig()).toEqual({
      apiKey: "marketaux-token",
      baseUrl: "https://api.marketaux.com/v1",
      enabled: true,
    });
  });

  it("skips Marketaux when disabled or missing a key", () => {
    vi.stubEnv("NEWS_SUMMARY_MARKETAUX_ENABLED", "true");
    vi.stubEnv("MARKETAUX_API_KEY", "");

    expect(getNewsSummaryMarketauxConfig()).toEqual({ enabled: false });
  });
});

describe("getNewsSummaryGrokConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables Grok when requested with an xAI key", () => {
    vi.stubEnv("NEWS_SUMMARY_GROK_ENABLED", "true");
    vi.stubEnv("XAI_API_KEY", "xai-key");

    expect(getNewsSummaryGrokConfig()).toEqual({
      apiKey: "xai-key",
      baseUrl: "https://api.x.ai/v1",
      enabled: true,
      model: "grok-4.3",
    });
  });

  it("preserves a configured Grok model and base URL", () => {
    vi.stubEnv("NEWS_SUMMARY_GROK_ENABLED", "true");
    vi.stubEnv("XAI_API_KEY", "xai-key");
    vi.stubEnv("XAI_API_BASE_URL", "https://example.x.ai/v1/");
    vi.stubEnv("NEWS_SUMMARY_GROK_MODEL", "grok-4.3-fast");

    expect(getNewsSummaryGrokConfig()).toEqual({
      apiKey: "xai-key",
      baseUrl: "https://example.x.ai/v1",
      enabled: true,
      model: "grok-4.3-fast",
    });
  });

  it("skips Grok when disabled or missing a key", () => {
    vi.stubEnv("NEWS_SUMMARY_GROK_ENABLED", "true");
    vi.stubEnv("XAI_API_KEY", "");

    expect(getNewsSummaryGrokConfig()).toEqual({ enabled: false });
  });
});

describe("getNewsSummaryXConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("enables X only when explicitly enabled with a bearer token", () => {
    vi.stubEnv("NEWS_SUMMARY_X_ENABLED", "true");
    vi.stubEnv("X_API_BEARER_TOKEN", "x-token");

    expect(getNewsSummaryXConfig()).toEqual({
      bearerToken: "x-token",
      enabled: true,
    });
  });

  it("skips X when the token is missing", () => {
    vi.stubEnv("NEWS_SUMMARY_X_ENABLED", "true");
    vi.stubEnv("X_API_BEARER_TOKEN", "");

    expect(getNewsSummaryXConfig()).toEqual({ enabled: false });
  });
});
