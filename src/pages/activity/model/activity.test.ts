import { describe, expect, it } from "vitest";
import type { Run } from "@/entities/connection/model/types";
import { memoryRecord } from "@/test/fixtures";
import {
  actorOfRecord,
  buildActivityDays,
  dayKey,
  isActivityFilter,
  type ActivityInput,
} from "./activity";

const run: Run = {
  id: "run-1",
  source: "github",
  connectionId: "github-main",
  status: "success",
  startedAt: "2026-11-16T12:00:00Z",
  finishedAt: "2026-11-16T12:00:02Z",
};

function input(overrides: Partial<ActivityInput> = {}): ActivityInput {
  return {
    runs: [run],
    records: [
      memoryRecord({
        id: "note-1",
        updatedAt: "2026-11-16T13:00:00Z",
        provenance: {
          origin: "human",
          trust: "verified",
          reviewed: true,
          quarantined: false,
          needsReview: false,
        },
      }),
      memoryRecord({
        id: "dec-1",
        kind: "decision",
        updatedAt: "2026-11-15T10:00:00Z",
        provenance: {
          origin: "agent",
          trust: "verified",
          reviewed: true,
          quarantined: false,
          needsReview: false,
        },
      }),
    ],
    connectionProjects: { "github-main": "lv24" },
    projectNames: { lv24: "LV24" },
    projectId: null,
    filter: "all",
    ...overrides,
  };
}

describe("activity grouping", () => {
  it("groups by day and project with newest first", () => {
    const days = buildActivityDays(input());
    expect(days.map((day) => day.day)).toEqual(["2026-11-16", "2026-11-15"]);
    expect(days[0].projects[0].projectName).toBe("LV24");
    expect(days[0].projects[0].rows.map((row) => row.key)).toEqual([
      "record-note-1",
      "run-run-1",
    ]);
  });

  it("filters by actor and project", () => {
    expect(
      buildActivityDays(input({ filter: "me" }))[0].projects[0].rows.map(
        (row) => row.key,
      ),
    ).toEqual(["record-note-1"]);
    expect(
      buildActivityDays(input({ filter: "connections" })).flatMap((day) =>
        day.projects.flatMap((group) => group.rows.map((row) => row.key)),
      ),
    ).toEqual(["run-run-1"]);
    expect(
      buildActivityDays(input({ projectId: "other" })),
    ).toEqual([]);
  });

  it("maps provenance and connection-free runs to actors", () => {
    expect(actorOfRecord("human")).toBe("me");
    expect(actorOfRecord("agent")).toBe("agents");
    expect(actorOfRecord("connector")).toBe("connections");
    expect(actorOfRecord("import")).toBe("other");
    const days = buildActivityDays({
      ...input({ records: [] }),
      runs: [{ ...run, connectionId: undefined, id: "agent-run" }],
    });
    expect(days[0].projects[0].rows[0].actor).toBe("agents");
  });

  it("prefers the run's own project ids over the connection catalogue", () => {
    const days = buildActivityDays({
      ...input({ records: [] }),
      connectionProjects: {},
      projectNames: { desktop: "Desktop" },
      runs: [{ ...run, connectionId: undefined, projectIds: ["desktop"] }],
    });
    expect(days[0].projects[0].projectName).toBe("Desktop");
    expect(days[0].projects[0].rows[0].projectId).toBe("desktop");
  });

  it("validates filters and day keys", () => {
    expect(isActivityFilter("me")).toBe(true);
    expect(isActivityFilter("nobody")).toBe(false);
    expect(isActivityFilter(null)).toBe(false);
    expect(dayKey("not-a-date")).toBe("unknown");
  });
});
