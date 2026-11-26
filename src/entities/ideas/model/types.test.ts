import { describe, expect, it } from "vitest";
import { IDEA_STATUSES, ideaStatusOptions } from "./types";

describe("idea status transitions", () => {
  it("keeps the current status first", () => {
    for (const status of IDEA_STATUSES) {
      expect(ideaStatusOptions(status)[0]).toBe(status);
    }
  });

  it("only reopens a completed or dropped idea", () => {
    expect(ideaStatusOptions("done")).toEqual(["done", "open"]);
    expect(ideaStatusOptions("dropped")).toEqual(["dropped", "open"]);
  });

  it("lets an active idea move to every non-closed state", () => {
    expect(ideaStatusOptions("open")).toEqual([
      "open",
      "doing",
      "done",
      "dropped",
      "someday",
    ]);
    expect(new Set(ideaStatusOptions("doing")).size).toBe(5);
  });

  it("never repeats a status", () => {
    for (const status of IDEA_STATUSES) {
      const options = ideaStatusOptions(status);
      expect(new Set(options).size).toBe(options.length);
    }
  });
});
