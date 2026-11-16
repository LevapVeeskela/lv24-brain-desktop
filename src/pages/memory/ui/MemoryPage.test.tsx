import { describe, expect, it } from "vitest";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { MemoryStore } from "@/entities/memory/model/MemoryStore";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { memorySource, projectsSource } from "@/test/api";
import { memoryRecord, project } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { MemoryPage } from "./MemoryPage";

function stores() {
  const projects = new ProjectsStore(projectsSource());
  projects.items = [project()];
  projects.loaded = true;
  projects.selectedId = "lv24";
  const memory = new MemoryStore(memorySource());
  memory.projectId = "lv24";
  return { projects, memory, engine: new EngineStore() };
}

describe("MemoryPage", () => {
  it("renders the list, preview pane and pagination control", () => {
    const { projects, memory, engine } = stores();
    memory.loaded = true;
    memory.items = [
      memoryRecord({
        id: "dec-1",
        kind: "decision",
        title: "Use SQLite FTS5",
        review: { due: true },
      }),
    ];
    memory.hasMore = true;
    const html = renderPage(
      <MemoryPage memory={memory} projects={projects} engine={engine} />,
    );
    expect(html).toContain("Curated notes, decisions, attempts and handoffs.</caption>");
    expect(html).toContain("/memory/decision/dec-1");
    expect(html).toContain("Use SQLite FTS5");
    expect(html).toContain("Record preview");
    expect(html).toContain("Open record");
    expect(html).toContain("Load more");
    expect(html).toContain(">Kind</span>");
    expect(html).toContain(">Status</span>");
    expect(html).toContain(">Scope</span>");
    expect(html).toContain("Review due");
  });

  it("renders loading, empty and error states", () => {
    const loading = stores();
    loading.memory.loading = true;
    expect(
      renderPage(
        <MemoryPage
          memory={loading.memory}
          projects={loading.projects}
          engine={loading.engine}
        />,
      ),
    ).toContain('role="status"');

    const empty = stores();
    empty.memory.loaded = true;
    expect(
      renderPage(
        <MemoryPage
          memory={empty.memory}
          projects={empty.projects}
          engine={empty.engine}
        />,
      ),
    ).toContain("No records yet");

    const failed = stores();
    failed.memory.loaded = true;
    failed.memory.error = "denied";
    const html = renderPage(
      <MemoryPage
        memory={failed.memory}
        projects={failed.projects}
        engine={failed.engine}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("denied");
  });

  it("explains a filtered empty result and offers to clear filters", () => {
    const { projects, memory, engine } = stores();
    memory.loaded = true;
    memory.filters.status = "accepted";
    const html = renderPage(
      <MemoryPage memory={memory} projects={projects} engine={engine} />,
    );
    expect(html).toContain("No records match these filters.");
    expect(html).toContain("Clear filters");
  });
});
