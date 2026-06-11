import { describe, expect, it } from "vitest";

import { breadthCountTone } from "./sector-breadth-view";

describe("breadthCountTone", () => {
  it("only highlights the count that is greater", () => {
    expect(breadthCountTone({ down: 8, side: "up", up: 12 })).toBe("up");
    expect(breadthCountTone({ down: 8, side: "down", up: 12 })).toBeUndefined();
    expect(breadthCountTone({ down: 14, side: "up", up: 4 })).toBeUndefined();
    expect(breadthCountTone({ down: 14, side: "down", up: 4 })).toBe("down");
  });

  it("keeps tied counts neutral", () => {
    expect(breadthCountTone({ down: 5, side: "up", up: 5 })).toBeUndefined();
    expect(breadthCountTone({ down: 5, side: "down", up: 5 })).toBeUndefined();
  });
});
