import { describe, expect, it } from "vitest";
import { parseProjectState, parseProjects } from "./projectApi";

describe("project parser", () => {
  it("keeps id, name and machine path provenance", () => {
    expect(
      parseProjects([
        {
          id: "lv24",
          name: "LV24",
          paths: ["C:\\0project\\lv24"],
          path_provenance: { "C:\\0project\\lv24": "DESKTOP-F5INSH6" },
        },
        { id: "plain", name: "Plain" },
      ]),
    ).toEqual([
      {
        id: "lv24",
        name: "LV24",
        paths: ["C:\\0project\\lv24"],
        pathProvenance: { "C:\\0project\\lv24": "DESKTOP-F5INSH6" },
      },
      { id: "plain", name: "Plain", paths: [], pathProvenance: {} },
    ]);
    expect(() => parseProjects({})).toThrow(/non-array/);
    expect(() => parseProjects([{ id: 1, name: "x" }])).toThrow(/invalid/);
  });

  it("maps state to camelCase, strips unknown fields and requires a revision", () => {
    expect(
      parseProjectState({
        project_id: "lv24",
        goal: "Ship",
        next_action: "Test",
        active: ["memory"],
        blocked: [],
        open_questions: ["Which theme?"],
        revision: "rev-1",
        provenance: {
          origin: "human",
          trust: "verified",
          reviewed: true,
          quarantined: false,
          needs_review: false,
        },
        unknown: "dropped",
      }),
    ).toEqual({
      projectId: "lv24",
      goal: "Ship",
      nextAction: "Test",
      active: ["memory"],
      blocked: [],
      openQuestions: ["Which theme?"],
      revision: "rev-1",
      provenance: {
        origin: "human",
        trust: "verified",
        reviewed: true,
        quarantined: false,
        needsReview: false,
      },
    });
    expect(() => parseProjectState({ project_id: "lv24" })).toThrow(/revision/);
  });
});
