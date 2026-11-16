import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { MemoryStore } from "@/entities/memory/model/MemoryStore";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { memorySource, projectsSource } from "@/test/api";
import {
  memoryRecord,
  project,
  recordDetail,
} from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { RecordDetailPage } from "./RecordDetailPage";

function renderDetail(
  prepare?: (memory: MemoryStore) => void,
  detail = recordDetail({
    id: "dec-1",
    kind: "decision",
    title: "Use SQLite FTS5",
    body: "## Decision\n\nUse SQLite FTS5.",
    links: [
      {
        field: "supersedes",
        ref: "dec-0",
        state: "found",
        target: memoryRecord({ id: "dec-0", title: "Earlier decision" }),
      },
    ],
    relations: [
      {
        target: "dec-2",
        targetKind: "decision",
        relation: "supports",
        status: "accepted",
      },
    ],
    history: {
      records: [memoryRecord({ id: "dec-1", title: "Use SQLite FTS5" })],
      anchorIndex: 0,
      before: 0,
      after: 0,
      total: 1,
    },
  }),
): string {
  const projects = new ProjectsStore(projectsSource());
  projects.items = [project()];
  projects.loaded = true;
  projects.selectedId = "lv24";
  const memory = new MemoryStore(memorySource());
  memory.detailProjectId = "lv24";
  memory.detailId = "dec-1";
  memory.detail = detail;
  prepare?.(memory);
  return renderPage(
    <Routes>
      <Route
        path="/memory/:kind/:id"
        element={
          <RecordDetailPage
            memory={memory}
            projects={projects}
            engine={new EngineStore()}
          />
        }
      />
    </Routes>,
    "en",
    ["/memory/decision/dec-1"],
  );
}

describe("RecordDetailPage", () => {
  it("renders the body, provenance, links, relations and history", () => {
    const html = renderDetail();
    expect(html).toContain("Use SQLite FTS5");
    expect(html).toContain("<h3>Decision</h3>");
    expect(html).toContain("Provenance");
    expect(html).toContain("Human");
    expect(html).toContain("/memory/note/dec-0");
    expect(html).toContain("/memory/decision/dec-2?project=lv24");
    expect(html).toContain("This record");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Move to trash");
    expect(html).toContain("Edit");
  });

  it("renders the edit form with a dirty-state save and tag field", () => {
    const html = renderDetail((memory) => {
      if (memory.detail) {
        memory.editor.openFor({
          ...memory.detail,
          kind: "note",
          title: "A note",
          body: "Old body",
        });
        memory.editor.setBody("New body");
        memory.editor.setTags("one, two");
      }
    });
    expect(html).toContain("Edit record");
    expect(html).toContain("Unsaved changes.");
    expect(html).toContain("Title");
    expect(html).toContain("Body");
    expect(html).toContain("Tags");
    expect(html).toContain(">Save</button>");
    expect(html).toContain("Cancel");
  });

  it("hides the title field for a handoff", () => {
    const html = renderDetail(
      (memory) => {
        if (memory.detail) {
          memory.editor.openFor(memory.detail);
        }
      },
      recordDetail({
        id: "dec-1",
        kind: "handoff",
        title: "Summary",
        body: "Handoff body",
      }),
    );
    expect(html).toContain("A handoff has no title.");
    expect(html).toContain("Edit record");
  });
});
