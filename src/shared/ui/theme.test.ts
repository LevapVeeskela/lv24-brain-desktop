/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../app/styles/global.css", import.meta.url), "utf8");
const rootEnd = /\r?\n}\r?\n/.exec(css);
if (!rootEnd) throw new Error("global.css has no closing root token block");
const tokenBlock = css.slice(0, rootEnd.index);
const tokens = new Map([...tokenBlock.matchAll(/(--[\w-]+):\s*(#[a-f\d]{6});/gi)].map((match) => [match[1], match[2]]));
function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(first: string, second: string): number {
  const a = luminance(tokens.get(first)!); const b = luminance(tokens.get(second)!);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

describe("dark theme accessibility", () => {
  it("meets AA for ordinary text, semantic statuses and button text", () => {
    const pairs = [
      ["--text", "--canvas"], ["--text", "--surface"], ["--text-muted", "--surface"],
      ["--text-muted", "--surface-hover"], ["--text-code", "--inset"],
      ["--accent", "--accent-subtle"], ["--danger", "--danger-subtle"],
      ["--warning", "--warning-subtle"], ["--info", "--info-subtle"],
      ["--text-on-accent", "--accent"], ["--text-on-danger", "--danger"],
    ];
    for (const [text, surface] of pairs) expect(contrast(text, surface), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    expect(contrast("--border-strong", "--inset")).toBeGreaterThanOrEqual(3);
    expect(contrast("--accent", "--surface")).toBeGreaterThanOrEqual(3);
  });

  it("keeps raw theme colors, type sizes and radii inside the token block", () => {
    const body = css.slice(rootEnd.index + rootEnd[0].length);
    expect(body).not.toMatch(/#[a-f\d]{3,8}\b|rgba?\(/i);
    expect(body).not.toMatch(/font-size:\s*\d/);
    expect(body).not.toMatch(/border-radius:\s*\d+px/);
    expect(body).toContain("prefers-reduced-motion");
    expect(body).toContain("forced-colors");
  });
});
