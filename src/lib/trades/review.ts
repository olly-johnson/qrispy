import {
  TRADE_GRADES,
  TRADE_SETUP_TYPES,
  type TradeGrade,
  type TradeSetupType,
} from "@/lib/trades/types";

export type TradeReviewInput = {
  userId: string;
  tradeId?: string | null;
  groupId?: string | null;
  setupType?: string | null;
  grade?: string | null;
  summary?: string | null;
  whatWentWell?: string | null;
  whatWentWrong?: string | null;
  lessonsLearned?: string | null;
};

export type TradeReviewRow = {
  trade_id: string | null;
  group_id: string | null;
  user_id: string;
  setup_type: TradeSetupType | null;
  grade: TradeGrade | null;
  summary: string | null;
  what_went_well: string | null;
  what_went_wrong: string | null;
  lessons_learned: string | null;
};

function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizeEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  field: string,
): T | null {
  if (value == null || value === "") return null;
  if (!allowed.includes(value as T)) {
    throw new Error(
      `Invalid ${field} "${value}". Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}

export function buildTradeReviewRow(input: TradeReviewInput): TradeReviewRow {
  if (!input.userId) throw new Error("userId is required.");

  const hasTrade = Boolean(input.tradeId);
  const hasGroup = Boolean(input.groupId);
  if (hasTrade === hasGroup) {
    throw new Error("Provide exactly one of tradeId or groupId.");
  }

  return {
    trade_id: input.tradeId ?? null,
    group_id: input.groupId ?? null,
    user_id: input.userId,
    setup_type: normalizeEnum(input.setupType, TRADE_SETUP_TYPES, "setup_type"),
    grade: normalizeEnum(input.grade, TRADE_GRADES, "grade"),
    summary: cleanText(input.summary),
    what_went_well: cleanText(input.whatWentWell),
    what_went_wrong: cleanText(input.whatWentWrong),
    lessons_learned: cleanText(input.lessonsLearned),
  };
}
