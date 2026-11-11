import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

describe("Neuro brand compositing", () => {
  it("gives each mark its own cutout mask when multiple headers are rendered", () => {
    const html = renderToStaticMarkup(<><BrandMark /><BrandMark /></>);
    const ids = [...html.matchAll(/<mask id="([^"]+)"/g)].map((match) => match[1]);
    const references = [...html.matchAll(/mask="url\(#([^)]+)\)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(references).toEqual(ids);
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('class="brand-mask"');
  });
});
