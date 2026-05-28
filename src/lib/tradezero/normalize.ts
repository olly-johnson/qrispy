import type { CanonicalFill, FillSide } from "@/lib/trades/types";

type TradeZeroFillPayload = Record<string, unknown>;

export function isExecutableTradeZeroFillPayload(payload: TradeZeroFillPayload) {
  return !isCanceled(payload) && optionalNumberField(payload, ["qty", "quantity"]) != null;
}

export function normalizeTradeZeroFill(input: {
  userId: string;
  accountId: string;
  brokerAccountId: string;
  payload: TradeZeroFillPayload;
}): CanonicalFill {
  const sourceFillId = stringField(input.payload, ["tradeId", "executionId", "id"]);
  const executedAt = executionDate(input.payload);

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

function isCanceled(payload: TradeZeroFillPayload) {
  const value = payload.canceled;

  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }

  return false;
}

function executionDate(payload: TradeZeroFillPayload) {
  const direct = optionalStringField(payload, ["executedAt", "executionTime", "time"]);
  if (direct) {
    return parseDate(direct);
  }

  const tradeDate = optionalStringField(payload, ["tradeDate", "entryDate"]);
  const execTime = optionalStringField(payload, ["execTime"]);
  if (tradeDate && execTime) {
    return easternWallTimeToUtc(tradeDate, execTime);
  }

  throw new Error("Missing TradeZero execution timestamp");
}

function optionalStringField(payload: TradeZeroFillPayload, keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (typeof value === "number") {
      return String(value);
    }
  }

  return undefined;
}

function parseDate(raw: string) {
  const date = new Date(raw);

  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid TradeZero execution timestamp: ${raw}`);
  }

  return date;
}

function easternWallTimeToUtc(rawDate: string, rawTime: string) {
  const dateMatch = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const timeMatch = rawTime.match(/^(\d{2}):(\d{2}):(\d{2})/);

  if (!dateMatch || !timeMatch) {
    throw new Error(`Invalid TradeZero execution timestamp: ${rawDate} ${rawTime}`);
  }

  const [, year, month, day] = dateMatch;
  const [, hour, minute, second] = timeMatch;
  const wallTimeAsUtc = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  const offsetMs = getTimeZoneOffsetMs(wallTimeAsUtc, "America/New_York");

  return new Date(wallTimeAsUtc.getTime() - offsetMs);
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );

  return localAsUtc - date.getTime();
}

function normalizeSide(side: string): FillSide {
  const normalized = side
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  const compact = normalized.replaceAll(" ", "");

  if (["B", "BUY", "COVER", "BUY TO COVER", "BUYTOCOVER"].includes(normalized)) {
    return "BUY";
  }
  if (
    ["S", "SELL", "SHORT", "SELL SHORT", "SHORT SELL", "SELLSHORT", "SHORTSELL"].includes(
      normalized,
    ) ||
    ["BUYTOCOVER", "SELLSHORT", "SHORTSELL"].includes(compact)
  ) {
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
