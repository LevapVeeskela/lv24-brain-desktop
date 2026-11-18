import { describe, expect, it } from "vitest";
import {
  PALETTE_FOCUSABLE_SELECTOR,
  activeDescendantId,
  paletteOptionId,
  wrappedFocusIndex,
} from "./focusTrap";

describe("palette focus trap", () => {
  it("keeps focus inside the palette when Tab leaves an edge", () => {
    expect(wrappedFocusIndex(3, 2, false)).toBe(0);
    expect(wrappedFocusIndex(3, 0, true)).toBe(2);
  });

  it("lets the browser move focus in the middle of the palette", () => {
    expect(wrappedFocusIndex(3, 0, false)).toBeNull();
    expect(wrappedFocusIndex(3, 2, true)).toBeNull();
  });

  it("handles a single focusable element and an empty palette", () => {
    expect(wrappedFocusIndex(1, 0, false)).toBe(0);
    expect(wrappedFocusIndex(1, 0, true)).toBe(0);
    expect(wrappedFocusIndex(0, -1, false)).toBeNull();
    expect(wrappedFocusIndex(0, -1, true)).toBeNull();
  });

  it("wraps when focus starts on the container rather than an item", () => {
    expect(wrappedFocusIndex(4, -1, true)).toBe(3);
    expect(wrappedFocusIndex(4, -1, false)).toBeNull();
  });

  it("keeps the trap selector focused on interactive controls", () => {
    expect(PALETTE_FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
    expect(PALETTE_FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
    expect(PALETTE_FOCUSABLE_SELECTOR).not.toContain("tabindex='0'");
  });
});

describe("palette active descendant", () => {
  it("points at the rendered option for the active index", () => {
    expect(paletteOptionId(2)).toBe("palette-option-2");
    expect(activeDescendantId(0, 3)).toBe("palette-option-0");
    expect(activeDescendantId(2, 3)).toBe("palette-option-2");
  });

  it("has no target when nothing is selectable", () => {
    expect(activeDescendantId(-1, 3)).toBeUndefined();
    expect(activeDescendantId(3, 3)).toBeUndefined();
    expect(activeDescendantId(0, 0)).toBeUndefined();
  });
});
