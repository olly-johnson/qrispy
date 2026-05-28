import type { CanonicalFill, FillSide } from "@/lib/trades/types";

type TradeZeroFillPayload = Record<string, unknown>;

export function normalizeTradeZeroFill(input: {
  userId: string;
  accountId: string;
  brokerAccountId: string;
  payload: TradeZeroFillPayload;
}): CanonicalFill {
  const sourceFillId = stringField(input.payload, ["tradeId", "executionId", "id"]);
  const executedAt = dateField(input.payload, ["executedAt", "executionTime", "time"]);

  return {
    id: sourceFillId,
    userId: input.userId,
    accountId: input.accountId,
    broker: "tradezero",
    sourceType: "api",
    sourceFillId,
    idempotencyKey: buildIdempotencyKey(
      input.brokerAccountId,
      sourceFillId,
      input.payload,
      executedAt,
    ),
    symbol: stringField(input.payload, ["symbol"]).toUpperCase(),
    assetClass: "equity",
    side: normalizeSide(stringField(input.payload, ["side"])),
    quantity: numberField(input.payload, ["qty", "quantity"]),
    price: numberField(input.payload, ["price", "avgPrice"]),
    executedAt: executedAt.toISOString(),
    executedTz: "America/New_York",
    tradeDate: easternDate(executedAt),
    currency: stringField(input.payload, ["currency"], "USD"),
    commission: numberField(input.payload, ["commission", "comm"], 0),
    fees: numberField(input.payload, ["totalFees", "fees"], 0),
    grossProceeds: optionalNumberField(input.payload, ["grossProceeds"]),
    netProceeds: optionalNumberField(input.payload, ["netProceeds"]),
    rawPayload: input.payload,
  };
}

function stringField(
  payload: TradeZeroFillPayload,
  keys: string[],
  fallback?: string,
): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  if (fallback != null) {
    return fallback;
  }

  throw new Error(`Missing TradeZero field: ${keys.join(" or ")}`);
}

function numberField(
  payload: TradeZeroFillPayload,
  keys: string[],
  fallback?: number,
): number {
  const value = optionalNumberField(payload, keys);

  if (value != null) {
    return value;
  }

  if (fallback != null) {
    return fallback;
  }

  throw new Error(`Missing numeric TradeZero field: ${keys.join(" or ")}`);
}

function optionalNumberField(
  payload: TradeZeroFillPayload,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value.replaceAll(",", ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function dateField(payload: TradeZeroFillPayload, keys: string[]) {
  const raw = stringField(payload, keys);
  const date = new Date(raw);

  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid TradeZero execution timestamp: ${raw}`);
  }

  return date;
}

function normalizeSide(side: string): FillSide {
  const normalized = side.toUpperCase();
  if (normalized === "B" || normalized === "BUY") {
    return "BUY";
  }
  if (normalized === "S" || normalized === "SELL") {
    return "SELL";
  }

  throw new Error(`Unsupported TradeZero side: ${side}`);
}

function buildIdempotencyKey(
  brokerAccountId: string,
  sourceFillId: string,
  payload: TradeZeroFillPayload,
  executedAt: Date,
) {
  if (sourceFillId) {
    return `tradezero_api|${brokerAccountId}|${sourceFillId}`;
  }

  return [
    "tradezero_api",
    brokerAccountId,
    stringField(payload, ["symbol"]),
    stringField(payload, ["side"]),
    numberField(payload, ["qty", "quantity"]),
    numberField(payload, ["price", "avgPrice"]),
    executedAt.toISOString(),
  ].join("|");
}

function easternDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
