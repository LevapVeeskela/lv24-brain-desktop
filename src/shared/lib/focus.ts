/** Selector for elements a modal cycles through on Tab. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Index that Tab or Shift+Tab should focus inside a modal, or null when the
 * browser default (move to the next/previous focusable) keeps focus inside.
 *
 * `current` is the position of the focused element in the modal's focusable
 * list; -1 means focus sits on the container itself.
 */
export function wrappedFocusableIndex(
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

interface FocusTargetLike {
  isConnected?: boolean;
  focus?: () => void;
}

/** Returns focus to the trigger unless the row it belonged to is gone. */
export function restoreFocusIfConnected(target: FocusTargetLike | null): void {
  if (target?.isConnected && typeof target.focus === "function") {
    target.focus();
  }
}
