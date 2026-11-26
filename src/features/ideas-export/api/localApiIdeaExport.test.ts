import { describe, expect, it, vi } from "vitest";
import {
  createLocalApiIdeaExportSource,
  ideaExportScope,
  type IdeaIcalSource,
  type IdeasExportScopeState,
} from "./localApiIdeaExport";

const ics = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";

describe("local API idea export source", () => {
  it("exports the current project scope and returns the ical text", async () => {
    const ical = vi.fn(async () => ics);
    const api: IdeaIcalSource = { ical };
    let state: IdeasExportScopeState = { scope: "project", projectId: "lv24" };
    const source = createLocalApiIdeaExportSource(
      () => ideaExportScope(state),
      api,
    );

    await expect(source.fetchIcs()).resolves.toBe(ics);
    expect(ical).toHaveBeenLastCalledWith({
      projectId: "lv24",
      includeDone: false,
    });

    // The scope is read at call time, so a selector change reaches the route.
    state = { scope: "all", projectId: "lv24" };
    await source.fetchIcs();
    expect(ical).toHaveBeenLastCalledWith({
      projectId: undefined,
      includeDone: false,
    });
  });

  it("maps an unset project to a global export", () => {
    expect(ideaExportScope({ scope: "project", projectId: null })).toEqual({
      projectId: undefined,
    });
    expect(ideaExportScope({ scope: "all", projectId: "lv24" })).toEqual({
      projectId: undefined,
    });
  });

  it("propagates the API error so the export button can show it", async () => {
    const source = createLocalApiIdeaExportSource(
      () => ({}),
      {
        ical: async () => {
          throw new Error("engine offline");
        },
      },
    );
    await expect(source.fetchIcs()).rejects.toThrow("engine offline");
  });
});
