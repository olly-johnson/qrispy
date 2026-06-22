import { buildTradeReviewRow } from "@/lib/trades/review";

describe("buildTradeReviewRow", () => {
  const base = { tradeId: "t1", userId: "u1" };

  it("maps a full trade review to a snake_case row", () => {
    expect(
      buildTradeReviewRow({
        ...base,
        setupType: "parabolic_short",
        grade: "F",
        summary: "Shorted CAR into strength.",
        whatWentWell: "Right stock to watch.",
        whatWentWrong: "Shorted before the dot; held overnight.",
        lessonsLearned: "Only short on a dot day or the day after.",
      }),
    ).toEqual({
      trade_id: "t1",
      group_id: null,
      user_id: "u1",
      setup_type: "parabolic_short",
      grade: "F",
      summary: "Shorted CAR into strength.",
      what_went_well: "Right stock to watch.",
      what_went_wrong: "Shorted before the dot; held overnight.",
      lessons_learned: "Only short on a dot day or the day after.",
    });
  });

  it("attaches to a group when given groupId", () => {
    const row = buildTradeReviewRow({ userId: "u1", groupId: "g1", grade: "F" });
    expect(row.group_id).toBe("g1");
    expect(row.trade_id).toBeNull();
    expect(row.grade).toBe("F");
  });

  it("trims text and turns blanks into null", () => {
    const row = buildTradeReviewRow({ ...base, summary: "  hi  ", whatWentWell: "   " });
    expect(row.summary).toBe("hi");
    expect(row.what_went_well).toBeNull();
  });

  it("defaults missing setup_type and grade to null", () => {
    const row = buildTradeReviewRow(base);
    expect(row.setup_type).toBeNull();
    expect(row.grade).toBeNull();
  });

  it("rejects an invalid grade", () => {
    expect(() => buildTradeReviewRow({ ...base, grade: "Z" })).toThrow(/Invalid grade/);
  });

  it("rejects an invalid setup_type", () => {
    expect(() =>
      buildTradeReviewRow({ ...base, setupType: "swing" }),
    ).toThrow(/Invalid setup_type/);
  });

  it("requires userId", () => {
    expect(() => buildTradeReviewRow({ tradeId: "t1", userId: "" })).toThrow(/userId/);
  });

  it("requires exactly one of tradeId or groupId", () => {
    expect(() => buildTradeReviewRow({ userId: "u1" })).toThrow(/exactly one/);
    expect(() =>
      buildTradeReviewRow({ userId: "u1", tradeId: "t1", groupId: "g1" }),
    ).toThrow(/exactly one/);
  });
});
