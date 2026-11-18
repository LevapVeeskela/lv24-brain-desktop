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

/**
 * Index that Tab or Shift+Tab should focus inside the palette, or null when the
 * browser default (move to the next/previous focusable) keeps focus inside.
 *
 * `current` is the position of the focused element in the palette's focusable
 * list; -1 means focus sits on the container itself.
 */
export function wrappedFocusIndex(
  count: number,
  current: number,
  shiftKey: boolean,
): number | null {
  if (count <= 0) {
    return null;
  }
  if (count === 1) {
    return 0;
  }
  if (shiftKey && current <= 0) {
    return count - 1;
  }
  if (!shiftKey && current >= count - 1) {
    return 0;
  }
  return null;
}

/** Selector for the elements the focus trap cycles through. */
export const PALETTE_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
