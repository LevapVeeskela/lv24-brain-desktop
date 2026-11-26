export { isTypingTarget } from "@/shared/lib/shortcuts";

export type IdeasCommand =
  | "capture"
  | "search"
  | "next"
  | "previous"
  | "toggle"
  | "edit"
  | "trash"
  | "escape";

export interface IdeasKeyInput {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  typing?: boolean;
  /** A drawer or dialog owns the keyboard; the page stays passive. */
  drawerOpen?: boolean;
  /** A native dialog, the command palette or another modal has focus. */
  modalOpen?: boolean;
}

/**
 * Maps a keydown to one page command. Text fields keep their own keys, modals
 * own every key, and the drawer handles its own Escape, so the page never
 * steals typed input or acts behind a dialog.
 */
export function resolveIdeasShortcut(input: IdeasKeyInput): IdeasCommand | null {
  if (input.drawerOpen || input.modalOpen) {
    return null;
  }
  if (input.ctrlKey || input.metaKey || input.altKey) {
    return null;
  }
  if (input.typing) {
    return input.key === "Escape" ? "escape" : null;
  }
  switch (input.key) {
    case "n":
      return "capture";
    case "/":
      return "search";
    case "j":
      return "next";
    case "k":
      return "previous";
    case "x":
    case "e":
    case "Delete":
      // Repeated destructive/side-effecting keys would act on the next row
      // while the user still holds the key.
      if (input.repeat) {
        return null;
      }
      return input.key === "x" ? "toggle" : input.key === "e" ? "edit" : "trash";
    case "Escape":
      return "escape";
    default:
      return null;
  }
}
