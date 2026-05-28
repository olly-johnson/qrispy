export function getTradeZeroAccountId(payload: Record<string, unknown>) {
  return stringFrom(payload, ["accountId", "id", "accountNumber", "account"]);
}

export function getTradeZeroAccountDisplayName(
  payload: Record<string, unknown>,
  fallback: string,
) {
  return stringFrom(payload, ["displayName", "name", "account"], fallback);
}

function stringFrom(
  payload: Record<string, unknown>,
  keys: string[],
  fallback?: string,
) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  if (fallback != null) {
    return fallback;
  }

  throw new Error(`Missing field: ${keys.join(" or ")}`);
}
