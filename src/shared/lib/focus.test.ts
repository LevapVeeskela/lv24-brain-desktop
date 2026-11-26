import { describe, expect, it, vi } from "vitest";
import {
  FOCUSABLE_SELECTOR,
  restoreFocusIfConnected,
  wrappedFocusableIndex,
} from "./focus";

describe("focus helpers", () => {
  it("wraps Tab at both ends of a modal", () => {
    expect(wrappedFocusableIndex(3, 2, false)).toBe(0);
    expect(wrappedFocusableIndex(3, 0, true)).toBe(2);
    expect(wrappedFocusableIndex(3, 1, false)).toBeNull();
    expect(wrappedFocusableIndex(1, 0, false)).toBe(0);
    expect(wrappedFocusableIndex(0, 0, false)).toBeNull();
    expect(FOCUSABLE_SELECTOR).toContain("button:not([disabled])");
  });

  it("restores focus only when the trigger is still connected", () => {
    const focus = vi.fn();
    restoreFocusIfConnected({ isConnected: true, focus });
    expect(focus).toHaveBeenCalledOnce();
    restoreFocusIfConnected({ isConnected: false, focus });
    expect(focus).toHaveBeenCalledOnce();
    restoreFocusIfConnected(null);
  });
});
