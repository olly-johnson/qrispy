export type PublicSupabaseConfig = {
  url: string;
  anonKey: string;
};

export type ServerSupabaseConfig = PublicSupabaseConfig & {
  serviceRoleKey?: string;
};

export type TradeZeroConfig = {
  baseUrl: string;
  apiKeyId: string;
  apiSecretKey: string;
};

export type MassiveConfig = {
  apiKey: string;
  baseUrl: string;
};

export type NewsSummaryLlmProvider = "openai";

export type NewsSummaryLlmConfig = {
  apiKey: string;
  model: string;
  provider: NewsSummaryLlmProvider;
};

export type NewsSummaryWebSearchConfig =
  | { apiKey: string; enabled: true; provider: "openai" }
  | { enabled: false; provider: "openai" };

export type NewsSummaryMarketauxConfig =
  | { apiKey: string; baseUrl: string; enabled: true }
  | { enabled: false };

export type NewsSummaryGrokConfig =
  | { apiKey: string; baseUrl: string; enabled: true; model: string }
  | { enabled: false };

export type NewsSummaryXConfig =
  | { bearerToken: string; enabled: true }
  | { enabled: false };

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

export function getServerSupabaseConfig(): ServerSupabaseConfig | null {
  const publicConfig = getPublicSupabaseConfig();

  if (!publicConfig) {
    return null;
  }

  return {
    ...publicConfig,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

export function getOwnerUserId() {
  return process.env.QRISPY_OWNER_USER_ID;
}

export function getTradeZeroConfig(): TradeZeroConfig | null {
  const apiKeyId = process.env.TRADEZERO_API_KEY_ID;
  const apiSecretKey = process.env.TRADEZERO_API_SECRET_KEY;
  const baseUrl =
    process.env.TRADEZERO_API_BASE_URL ?? "https://api.tradezero.com";

  if (!apiKeyId || !apiSecretKey) {
    return null;
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKeyId,
    apiSecretKey,
  };
}

export function getMassiveConfig(): MassiveConfig | null {
  const apiKey = process.env.MASSIVE_API_KEY;
  const baseUrl = process.env.MASSIVE_API_BASE_URL ?? "https://api.massive.com";

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
  };
}

export function getNewsSummaryLlmConfig(): NewsSummaryLlmConfig | null {
  const provider = (
    process.env.NEWS_SUMMARY_LLM_PROVIDER ?? "openai"
  ).toLowerCase();

  if (provider !== "openai") {
    return null;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model: process.env.NEWS_SUMMARY_LLM_MODEL ?? "gpt-5.5",
    provider: "openai",
  };
}

export function getMarketContextConfig() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return null;
  }

  return {
    apiKey,
    model: process.env.NEWS_SUMMARY_LLM_MODEL ?? "gpt-4o-mini",
  };
}

export function getNewsSummaryWebSearchConfig(): NewsSummaryWebSearchConfig {
  const enabled =
    (process.env.NEWS_SUMMARY_WEB_SEARCH_ENABLED ?? "false").toLowerCase() ===
    "true";
  const apiKey = process.env.OPENAI_API_KEY;

  if (!enabled || !apiKey) {
    return { enabled: false, provider: "openai" };
  }

  return { apiKey, enabled: true, provider: "openai" };
}

export function getNewsSummaryMarketauxConfig(): NewsSummaryMarketauxConfig {
  const enabled =
    (process.env.NEWS_SUMMARY_MARKETAUX_ENABLED ?? "false").toLowerCase() ===
    "true";
  const apiKey = process.env.MARKETAUX_API_KEY ?? process.env.MARKETAUX_API_TOKEN;
  const baseUrl =
    process.env.MARKETAUX_API_BASE_URL ?? "https://api.marketaux.com/v1";

  if (!enabled || !apiKey) {
    return { enabled: false };
  }

  return { apiKey, baseUrl: baseUrl.replace(/\/$/, ""), enabled: true };
}

export function getNewsSummaryGrokConfig(): NewsSummaryGrokConfig {
  const enabled =
    (process.env.NEWS_SUMMARY_GROK_ENABLED ?? "false").toLowerCase() === "true";
  const apiKey = process.env.XAI_API_KEY;
  const baseUrl = process.env.XAI_API_BASE_URL ?? "https://api.x.ai/v1";

  if (!enabled || !apiKey) {
    return { enabled: false };
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    enabled: true,
    model: process.env.NEWS_SUMMARY_GROK_MODEL ?? "grok-4.3",
  };
}

export function getNewsSummaryXConfig(): NewsSummaryXConfig {
  const enabled =
    (process.env.NEWS_SUMMARY_X_ENABLED ?? "false").toLowerCase() === "true";
  const bearerToken = process.env.X_API_BEARER_TOKEN;

  if (!enabled || !bearerToken) {
    return { enabled: false };
  }

  return { bearerToken, enabled: true };
}

export function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
