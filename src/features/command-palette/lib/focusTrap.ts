import {
  FOCUSABLE_SELECTOR,
  wrappedFocusableIndex,
} from "@/shared/lib/focus";

/** DOM id of the palette option rendered at `index`. */
export function paletteOptionId(index: number): string {
  return `palette-option-${index}`;
}

/**
 * Value for `aria-activedescendant` on the palette combobox: undefined when the
 * index points outside the rendered options.
 */
export function activeDescendantId(
  index: number,
  count: number,
): string | undefined {
  return index >= 0 && index < count ? paletteOptionId(index) : undefined;
}

export { wrappedFocusableIndex as wrappedFocusIndex };

/** Selector for the elements the focus trap cycles through. */
export const PALETTE_FOCUSABLE_SELECTOR = FOCUSABLE_SELECTOR;
