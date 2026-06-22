import type { DashboardTrade } from "@/lib/app-data";

export type TradeReviewGroupSource = {
  id: string;
  customName: string | null;
  symbol: string;
  createdAt: string;
  updatedAt: string;
};

export type TradeReviewGroupMemberSource = {
  groupId: string;
  reconstructionKey: string;
};

export type ReviewableTrade = DashboardTrade & {
  reconstructionKey: string;
};

export type TradeReviewGroupSummary = TradeReviewGroupSource & {
  label: string;
  openedAt: string;
  closedAt: string;
  tradeCount: number;
  realizedPnl: number | null;
  totalFees: number | null;
};

export type TradeHistoryItem =
  | { kind: "trade"; trade: ReviewableTrade }
  | { kind: "group"; group: TradeReviewGroupSummary };

type TradeReviewGroupLabelInput = Pick<
  TradeReviewGroupSource,
  "customName" | "symbol"
> & {
  openedAt: string;
  closedAt: string;
};

export function validateTradeReviewGroup(
  trades: readonly ReviewableTrade[],
): { symbol: string } {
  if (trades.length < 2) {
    throw new Error("Select at least two trades.");
  }

  const reconstructionKeys = new Set<string>();
  for (const trade of trades) {
    const reconstructionKey = trade.reconstructionKey.trim();
    if (!reconstructionKey) {
      throw new Error("Each selected trade must have a reconstruction key.");
    }
    if (reconstructionKeys.has(reconstructionKey)) {
      throw new Error("Each selected trade must be unique.");
    }
    reconstructionKeys.add(reconstructionKey);
  }

  if (trades.some((trade) => trade.status !== "CLOSED")) {
    throw new Error("Only closed trades can be grouped.");
  }

  const symbols = new Set(trades.map((trade) => trade.symbol.trim()));
  if (symbols.size !== 1 || symbols.has("")) {
    throw new Error("Selected trades must use the same symbol.");
  }

  return { symbol: [...symbols][0] };
}

export function formatTradeReviewGroupLabel(
  input: TradeReviewGroupLabelInput,
): string {
  const customName = input.customName?.trim();
  if (customName) {
    return customName;
  }

  return `${input.symbol} · ${formatDateRange(input.openedAt, input.closedAt)}`;
}

export function buildTradeHistoryItems(input: {
  trades: readonly ReviewableTrade[];
  groups: readonly TradeReviewGroupSource[];
  members: readonly TradeReviewGroupMemberSource[];
}): TradeHistoryItem[] {
  const tradesByReconstructionKey = new Map(
    input.trades.map((trade) => [trade.reconstructionKey, trade]),
  );
  const resolvedMemberKeys = new Set<string>();
  const items: TradeHistoryItem[] = [];

  for (const group of input.groups) {
    const activeMembers = input.members
      .filter((member) => member.groupId === group.id)
      .map((member) => tradesByReconstructionKey.get(member.reconstructionKey))
      .filter((trade): trade is ReviewableTrade => Boolean(trade));

    if (activeMembers.length === 0) {
      continue;
    }

    for (const member of activeMembers) {
      resolvedMemberKeys.add(member.reconstructionKey);
    }

    const openedAt = earliestDate(activeMembers.map((trade) => trade.openedAt));
    const closedAt = latestDate(
      activeMembers.map((trade) => trade.closedAt ?? trade.openedAt),
    );
    const summary: TradeReviewGroupSummary = {
      ...group,
      label: formatTradeReviewGroupLabel({ ...group, openedAt, closedAt }),
      openedAt,
      closedAt,
      tradeCount: activeMembers.length,
      realizedPnl: sumNullable(activeMembers.map((trade) => trade.realizedPnl)),
      totalFees: sumNullable(activeMembers.map((trade) => trade.totalFees)),
    };
    items.push({ kind: "group", group: summary });
  }

  for (const trade of input.trades) {
    if (!resolvedMemberKeys.has(trade.reconstructionKey)) {
      items.push({ kind: "trade", trade });
    }
  }

  return items.sort((left, right) => getItemOpenedAt(right).localeCompare(getItemOpenedAt(left)));
}

export function getTradeReviewSelection(
  items: readonly TradeHistoryItem[],
  selectedIds: readonly string[],
): { selectedTradeIds: string[]; error: string | null } {
  const selectedIdSet = new Set(selectedIds);
  const selectedTrades = items.flatMap((item) =>
    item.kind === "trade" && selectedIdSet.has(item.trade.id) ? [item.trade] : [],
  );

  try {
    validateTradeReviewGroup(selectedTrades);
    return {
      selectedTradeIds: selectedTrades.map((trade) => trade.id),
      error: null,
    };
  } catch (error) {
    return {
      selectedTradeIds: selectedTrades.map((trade) => trade.id),
      error: error instanceof Error ? error.message : "Unable to group selected trades.",
    };
  }
}

function getItemOpenedAt(item: TradeHistoryItem): string {
  return item.kind === "group" ? item.group.openedAt : item.trade.openedAt;
}

function earliestDate(dates: readonly string[]): string {
  return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

function latestDate(dates: readonly string[]): string {
  return dates.reduce((latest, date) => (date > latest ? date : latest));
}

function sumNullable(values: readonly (number | null)[]): number | null {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length === 0 ? null : numbers.reduce((total, value) => total + value, 0);
}

function formatDateRange(openedAt: string, closedAt: string): string {
  const opened = new Date(openedAt);
  const closed = new Date(closedAt);
  const openedDay = opened.getUTCDate();
  const closedDay = closed.getUTCDate();
  const openedMonth = opened.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const closedMonth = closed.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const openedYear = opened.getUTCFullYear();
  const closedYear = closed.getUTCFullYear();

  if (openedYear === closedYear && openedMonth === closedMonth) {
    return `${openedDay}${openedDay === closedDay ? "" : `–${closedDay}`} ${closedMonth} ${closedYear}`;
  }
  if (openedYear === closedYear) {
    return `${openedDay} ${openedMonth}–${closedDay} ${closedMonth} ${closedYear}`;
  }
  return `${openedDay} ${openedMonth} ${openedYear}–${closedDay} ${closedMonth} ${closedYear}`;
}
