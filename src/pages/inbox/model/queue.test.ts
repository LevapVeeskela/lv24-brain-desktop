import { describe, expect, it } from "vitest";
import { proposal } from "@/test/fixtures";
import { isPromotableBulk } from "@/entities/memory/model/types";
import { nextSelection, sortProposals } from "./queue";

describe("inbox queue", () => {
  it("puts stale sources first, then low confidence, then the oldest", () => {
    const sorted = sortProposals([
      proposal({ id: "fresh", confidence: 0.9, createdAt: "2026-11-16T00:00:00Z" }),
      proposal({
        id: "stale",
        sourceStale: true,
        confidence: 0.95,
        createdAt: "2026-11-15T00:00:00Z",
      }),
      proposal({ id: "low", confidence: 0.2, createdAt: "2026-11-14T00:00:00Z" }),
      proposal({ id: "mid", confidence: 0.6, createdAt: "2026-11-13T00:00:00Z" }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual([
      "stale",
      "low",
      "mid",
      "fresh",
    ]);
  });

  it("moves selection with j/k bounds", () => {
    const items = [proposal({ id: "a" }), proposal({ id: "b" })];
    expect(nextSelection(items, "a", 1)).toBe("b");
    expect(nextSelection(items, "b", 1)).toBe("b");
    expect(nextSelection(items, "a", -1)).toBe("a");
    expect(nextSelection([], null, 1)).toBeNull();
  });

  it("allows bulk accept only for one kind without blockers", () => {
    expect(isPromotableBulk([])).toBe(false);
    expect(
      isPromotableBulk([
        proposal({ id: "a" }),
        proposal({ id: "b", confidence: 0.4 }),
      ]),
    ).toBe(true);
    expect(
      isPromotableBulk([
        proposal({ id: "a" }),
        proposal({ id: "b", kind: "note" }),
      ]),
    ).toBe(false);
    expect(
      isPromotableBulk([proposal({ id: "a", localOnly: true })]),
    ).toBe(false);
  });
});
