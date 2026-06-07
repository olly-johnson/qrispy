import { afterEach, describe, expect, it, vi } from "vitest";

import { getNewsSummaryLlmConfig } from "./env";

describe("getNewsSummaryLlmConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to OpenAI and a structured-output capable model", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");

    expect(getNewsSummaryLlmConfig()).toEqual({
      apiKey: "openai-key",
      model: "gpt-4o-mini",
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
