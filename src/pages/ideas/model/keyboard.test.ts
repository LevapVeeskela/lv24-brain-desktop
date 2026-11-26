import { describe, expect, it } from "vitest";
import { isInsideBlockingModal } from "@/shared/lib/shortcuts";
import { isTypingTarget, resolveIdeasShortcut } from "./keyboard";

describe("ideas keyboard shortcuts", () => {
  it("maps the page keys", () => {
    expect(resolveIdeasShortcut({ key: "n" })).toBe("capture");
    expect(resolveIdeasShortcut({ key: "/" })).toBe("search");
    expect(resolveIdeasShortcut({ key: "j" })).toBe("next");
    expect(resolveIdeasShortcut({ key: "k" })).toBe("previous");
    expect(resolveIdeasShortcut({ key: "x" })).toBe("toggle");
    expect(resolveIdeasShortcut({ key: "e" })).toBe("edit");
    expect(resolveIdeasShortcut({ key: "Delete" })).toBe("trash");
    expect(resolveIdeasShortcut({ key: "Escape" })).toBe("escape");
    expect(resolveIdeasShortcut({ key: "Enter" })).toBeNull();
  });

  it("never steals keys from a text field", () => {
    expect(resolveIdeasShortcut({ key: "n", typing: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "/", typing: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "Escape", typing: true })).toBe("escape");
  });

  it("stands down while the drawer is open or a modifier is held", () => {
    expect(resolveIdeasShortcut({ key: "x", drawerOpen: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "n", drawerOpen: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "Escape", drawerOpen: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "x", ctrlKey: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "j", metaKey: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "k", altKey: true })).toBeNull();
  });

  it("stands down while a dialog or the command palette owns the keyboard", () => {
    for (const key of ["n", "/", "x", "e", "Delete", "Escape"]) {
      expect(resolveIdeasShortcut({ key, modalOpen: true })).toBeNull();
    }
  });

  it("drops repeated action keys but keeps repeatable movement", () => {
    expect(resolveIdeasShortcut({ key: "x", repeat: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "e", repeat: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "Delete", repeat: true })).toBeNull();
    expect(resolveIdeasShortcut({ key: "j", repeat: true })).toBe("next");
  });

  it("detects text inputs, selects and contenteditable", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "SELECT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("detects a dialog, palette or aria-modal ancestor", () => {
    const inside = {
      tagName: "INPUT",
      closest: (selector: string) => (selector.includes("dialog") ? {} : null),
    };
    expect(isInsideBlockingModal(inside)).toBe(true);
    expect(
      isInsideBlockingModal({ tagName: "DIV", closest: () => null }),
    ).toBe(false);
    expect(isInsideBlockingModal({ tagName: "DIV" })).toBe(false);
    expect(isInsideBlockingModal(null)).toBe(false);
  });
});
