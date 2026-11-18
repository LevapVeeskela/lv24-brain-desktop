import { describe, expect, it } from "vitest";
import { adoptReport } from "@/test/fixtures";
import {
  parseAdoptReport,
  parseProject,
  parseProjectState,
  parseProjects,
} from "./projectApi";

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

  it("parses one project and drops unknown fields", () => {
    expect(
      parseProject({
        id: "lv24",
        name: "LV24",
        paths: ["/work/lv24"],
        path_provenance: { "/work/lv24": "MAC" },
        unknown: "dropped",
      }),
    ).toEqual({
      id: "lv24",
      name: "LV24",
      paths: ["/work/lv24"],
      pathProvenance: { "/work/lv24": "MAC" },
    });
    expect(() => parseProject({ id: "lv24" })).toThrow(/invalid/);
  });

  it("parses an adoption report with stamped, owned and missing paths", () => {
    expect(
      parseAdoptReport({
        machine: "DESKTOP-F5INSH6",
        applied: false,
        stamped: 1,
        owned: 1,
        missing: 1,
        projects: [
          {
            project_id: "lv24",
            paths: [
              {
                path: "C:\\0project\\lv24",
                machine: "DESKTOP-F5INSH6",
                state: "stamped",
              },
              {
                path: "C:\\0project\\lv24-brain",
                machine: "DESKTOP-F5INSH6",
                state: "owned",
              },
              { path: "C:\\0project\\missing", state: "missing" },
            ],
          },
        ],
      }),
    ).toEqual(adoptReport());
    expect(
      parseAdoptReport({
        machine: "m",
        applied: true,
        stamped: 0,
        owned: 0,
        missing: 0,
        projects: [],
      }),
    ).toEqual({
      machine: "m",
      applied: true,
      stamped: 0,
      owned: 0,
      missing: 0,
      projects: [],
    });
  });

  it("rejects an unknown path state and a non-numeric count", () => {
    expect(() =>
      parseAdoptReport({
        machine: "m",
        applied: false,
        stamped: 0,
        owned: 0,
        missing: 0,
        projects: [
          { project_id: "p", paths: [{ path: "/x", state: "somewhere" }] },
        ],
      }),
    ).toThrow(/state/);
    expect(() =>
      parseAdoptReport({
        machine: "m",
        applied: false,
        stamped: "one",
        owned: 0,
        missing: 0,
        projects: [],
      }),
    ).toThrow(/stamped/);
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
