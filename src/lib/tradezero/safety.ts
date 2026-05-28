const READ_ONLY_METHOD = "GET";

const READ_ONLY_PATH_ALLOWLIST = [
  /^\/v1\/api\/accounts$/,
  /^\/v1\/api\/account\/[^/]+$/,
  /^\/v1\/api\/accounts\/[^/]+\/pnl$/,
  /^\/v1\/api\/accounts\/[^/]+\/orders$/,
  /^\/v1\/api\/accounts\/[^/]+\/orders\/start-date\/\d{4}-\d{2}-\d{2}$/,
  /^\/v1\/api\/accounts\/[^/]+\/orders-with-pagination\/start-date\/\d{4}-\d{2}-\d{2}(?:\?limit=\d+&offset=\d+)?$/,
  /^\/v1\/api\/accounts\/[^/]+\/positions$/,
];

export type TradeZeroSafetyStatus = {
  canSync: boolean;
  readOnlyConfirmed: boolean;
  brokerTwoFactorConfirmed: boolean;
  missing: string[];
};

export function assertTradeZeroReadOnlyRequest(input: {
  method: string;
  path: string;
}) {
  const method = input.method.toUpperCase();

  if (method !== READ_ONLY_METHOD) {
    throw new Error("TradeZero write operations are disabled in Qrispy");
  }

  if (!READ_ONLY_PATH_ALLOWLIST.some((pattern) => pattern.test(input.path))) {
    throw new Error(
      `TradeZero endpoint is not on the read-only allowlist: ${input.path}`,
    );
  }
}

export function getTradeZeroSafetyStatus(): TradeZeroSafetyStatus {
  const readOnlyConfirmed = process.env.TRADEZERO_READ_ONLY_CONFIRMED === "true";
  const brokerTwoFactorConfirmed =
    process.env.TRADEZERO_BROKER_2FA_CONFIRMED === "true";
  const missing: string[] = [];

  if (!readOnlyConfirmed) {
    missing.push("TRADEZERO_READ_ONLY_CONFIRMED");
  }

  if (!brokerTwoFactorConfirmed) {
    missing.push("TRADEZERO_BROKER_2FA_CONFIRMED");
  }

  return {
    canSync: missing.length === 0,
    readOnlyConfirmed,
    brokerTwoFactorConfirmed,
    missing,
  };
}

export function assertTradeZeroSafetyConfirmed() {
  const status = getTradeZeroSafetyStatus();

  if (!status.canSync) {
    throw new Error(
      `TradeZero sync is blocked until safety confirmations are set: ${status.missing.join(", ")}`,
    );
  }
}
