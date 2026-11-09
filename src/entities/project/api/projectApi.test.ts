import { describe, expect, it } from "vitest";
import { parseProjects } from "./projectApi";

describe("project parser", () => {
  it("keeps id and name and rejects malformed entries", () => {
    expect(parseProjects([{ id: "lv24", name: "LV24" }])).toEqual([
      { id: "lv24", name: "LV24" },
    ]);
    expect(() => parseProjects({})).toThrow(/non-array/);
    expect(() => parseProjects([{ id: 1, name: "x" }])).toThrow(/invalid/);
  });
});
