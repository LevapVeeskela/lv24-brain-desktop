import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { MemoryStore } from "@/entities/memory/model/MemoryStore";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { memorySource, projectsSource } from "@/test/api";
import {
  memoryRecord,
  project,
  projectState,
} from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { ProjectDetailPage } from "./ProjectDetailPage";

function stores() {
  const projects = new ProjectsStore(projectsSource());
  projects.items = [project()];
  projects.loaded = true;
  projects.selectedId = "lv24";
  projects.state = projectState();
  projects.stateProjectId = "lv24";
  projects.stateLoaded = true;
  const memory = new MemoryStore(memorySource());
  memory.recentProjectId = "lv24";
  memory.recentItems = [
    memoryRecord({ id: "dec-1", kind: "decision", title: "Use SQLite FTS5" }),
  ];
  memory.latestHandoff = memoryRecord({
    id: "handoff-1",
    kind: "handoff",
    title: "Session handoff",
  });
  return { projects, memory, engine: new EngineStore() };
}

function render(
  storesValue: ReturnType<typeof stores>,
): string {
  return renderPage(
    <Routes>
      <Route
        path="/projects/:projectId"
        element={
          <ProjectDetailPage
            projects={storesValue.projects}
            memory={storesValue.memory}
            engine={storesValue.engine}
          />
        }
      />
    </Routes>,
    "en",
    ["/projects/lv24"],
  );
}

describe("ProjectDetailPage", () => {
  it("renders the state form, handoff, CLI hint and recent records", () => {
    const html = render(stores());
    expect(html).toContain("Ship 1.2");
    expect(html).toContain("Write tests");
    expect(html).toContain("Revision rev-1");
    expect(html).toContain("Session handoff");
    expect(html).toContain("/memory/handoff/handoff-1");
    expect(html).toContain("brain open lv24");
    expect(html).toContain("Use SQLite FTS5");
    expect(html).toContain(">Goal</span>");
    expect(html).toContain(">Blocked</span>");
    expect(html).toContain(">Open questions</span>");
  });

  it("explains a CAS conflict and offers dismissal", () => {
    const value = stores();
    value.projects.stateConflict = true;
    value.projects.conflictRevision = "rev-2";
    value.projects.saveError = "state changed";
    const html = render(value);
    expect(html).toContain("revision rev-2");
    expect(html).toContain("reapply your changes and save again");
    expect(html).toContain("latest revision was loaded");
  });
});
