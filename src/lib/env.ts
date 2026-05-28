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

export function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
