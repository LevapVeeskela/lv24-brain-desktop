interface ShortcutTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
}

function asShortcutTarget(target: unknown): ShortcutTargetLike | null {
  return target && typeof target === "object"
    ? (target as ShortcutTargetLike)
    : null;
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Typing targets keep their keystrokes; no global shortcut should steal them. */
export function isTypingTarget(target: unknown): boolean {
  const element = asShortcutTarget(target);
  if (!element) {
    return false;
  }
  return (
    TYPING_TAGS.has(element.tagName?.toUpperCase() ?? "") ||
    Boolean(element.isContentEditable)
  );
}

/**
 * Native dialogs, the command palette and any explicit modal own the keyboard.
 * Page shortcuts must stand down until they close.
 */
const MODAL_SELECTOR = "dialog, [role='dialog'], [aria-modal='true']";

export function isInsideBlockingModal(target: unknown): boolean {
  const element = asShortcutTarget(target);
  return typeof element?.closest === "function"
    ? Boolean(element.closest(MODAL_SELECTOR))
    : false;
}
