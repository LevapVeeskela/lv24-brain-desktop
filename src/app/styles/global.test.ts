import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./global.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Selectors that no component renders anymore; the shell must not use them. */
const DEAD_SELECTORS = [
  ".shell-body",
  ".app-nav",
  ".app-nav__link",
  ".app-nav__icon",
  ".brand",
  ".brand-copy",
  ".wordmark",
];

/** Selectors that own the shell layout; their rule count is the class snapshot. */
const KEY_SELECTORS = [
  ".shell",
  ".shell-main",
  ".content",
  ".app-rail",
  ".rail-brand",
  ".rail-brand-copy",
  ".rail-brand-copy h1",
  ".rail-project",
  ".rail-nav",
  ".rail-link",
  ".rail-link.active",
  ".rail-icon",
  ".rail-badge",
  ".rail-footer",
  ".rail-versions",
  ".palette-backdrop",
  ".palette",
  ".palette-item",
];

/** Selector lists of every top-level rule, split on commas. */
function ruleSelectors(source: string): string[] {
  return [...source.matchAll(/([^{}]+)\{/g)]
    .flatMap((match) => match[1].split(","))
    .map((selector) => selector.trim().replace(/\s+/g, " "))
    .filter((selector) => selector.length > 0 && !selector.startsWith("@"));
}

function countSelector(selectors: string[], selector: string): number {
  return selectors.filter((candidate) => candidate === selector).length;
}

describe("global.css shell selectors", () => {
  const selectors = ruleSelectors(css);

  it("drops selectors that the shell no longer renders", () => {
    expect(
      DEAD_SELECTORS.filter((selector) => countSelector(selectors, selector) > 0),
    ).toEqual([]);
  });

  it("keeps every layout class the shell renders", () => {
    const counts = Object.fromEntries(
      KEY_SELECTORS.map((selector) => [selector, countSelector(selectors, selector)]),
    );
    expect(counts).toMatchInlineSnapshot(`
      {
        ".app-rail": 4,
        ".content": 2,
        ".palette": 1,
        ".palette-backdrop": 2,
        ".palette-item": 1,
        ".rail-badge": 1,
        ".rail-brand": 2,
        ".rail-brand-copy": 1,
        ".rail-brand-copy h1": 1,
        ".rail-footer": 5,
        ".rail-icon": 1,
        ".rail-link": 1,
        ".rail-link.active": 5,
        ".rail-nav": 5,
        ".rail-project": 4,
        ".rail-versions": 1,
        ".shell": 7,
        ".shell-main": 1,
      }
    `);
  });
});
