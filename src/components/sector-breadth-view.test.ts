import { describe, expect, it } from "vitest";

import {
  breadthCountTone,
  countBalanceTone,
  thresholdTone,
  visibleBreadthCardLabels,
} from "./sector-breadth-view";

describe("visibleBreadthCardLabels", () => {
  it("keeps only the live 4% breadth card above sectors", () => {
    expect(visibleBreadthCardLabels()).toEqual(["4% Today"]);
  });
});

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

describe("metric card tones", () => {
  it("colors paired count cards by the larger side", () => {
    expect(countBalanceTone({ down: 117, up: 195 })).toBe("up");
    expect(countBalanceTone({ down: 1040, up: 732 })).toBe("down");
    expect(countBalanceTone({ down: 10, up: 10 })).toBeUndefined();
  });

  it("colors threshold cards above or below their neutral line", () => {
    expect(thresholdTone(47.2, 50)).toBe("down");
    expect(thresholdTone(52.4, 50)).toBe("up");
    expect(thresholdTone(1.1, 1)).toBe("up");
    expect(thresholdTone(0.67, 1)).toBe("down");
    expect(thresholdTone(1, 1)).toBeUndefined();
    expect(thresholdTone(null, 1)).toBeUndefined();
  });
});
