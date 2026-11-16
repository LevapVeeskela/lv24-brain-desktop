import { describe, expect, it } from "vitest";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { SearchStore } from "@/entities/memory/model/SearchStore";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { memorySource, projectsSource } from "@/test/api";
import { project, searchPage } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { SearchPage } from "./SearchPage";

function stores() {
  const projects = new ProjectsStore(projectsSource());
  projects.items = [project()];
  projects.loaded = true;
  projects.selectedId = "lv24";
  const search = new SearchStore(memorySource());
  search.setProject("lv24");
  return { projects, search, engine: new EngineStore() };
}

describe("SearchPage", () => {
  it("renders ranked results, filters and explain data", () => {
    const { projects, search, engine } = stores();
    const page = searchPage(
      [
        {
          id: "dec-1",
          projectId: "lv24",
          kind: "decision",
          title: "Use SQLite FTS5",
          preview: "Switched from LIKE queries.",
          score: 0.8,
          matchReasons: ["title"],
          explain: { bm25: 1, recency: 0.2, importance: 0.3, pin: 0, link: 0.1 },
        },
      ],
      { query: "sqlite" },
    );
    search.query = "sqlite";
    search.appliedQuery = "sqlite";
    search.searched = true;
    search.hits = page.hits;
    search.filters.explain = true;
    const html = renderPage(
      <SearchPage search={search} projects={projects} engine={engine} />,
    );
    expect(html).toContain('aria-label="Search records…"');
    expect(html).toContain("1 results");
    expect(html).toContain("Use SQLite FTS5");
    expect(html).toContain("/memory/decision/dec-1");
    expect(html).toContain("Score 0.80");
    expect(html).toContain("Ranking signals");
    expect(html).toContain("Explain ranking");
    expect(html).toContain(">Decision</label>");
  });

  it("renders the short-query and empty-result states", () => {
    const short = stores();
    short.search.query = "";
    expect(
      renderPage(
        <SearchPage
          search={short.search}
          projects={short.projects}
          engine={short.engine}
        />,
      ),
    ).toContain("Type at least 2 characters.");

    const empty = stores();
    empty.search.query = "nothing";
    empty.search.appliedQuery = "nothing";
    empty.search.searched = true;
    const html = renderPage(
      <SearchPage
        search={empty.search}
        projects={empty.projects}
        engine={empty.engine}
      />,
    );
    expect(html).toContain('No matches for &quot;nothing&quot;.');
  });

  it("shows search failures as an alert with retry", () => {
    const { projects, search, engine } = stores();
    search.query = "broken";
    search.appliedQuery = "broken";
    search.searched = true;
    search.error = "index down";
    const html = renderPage(
      <SearchPage search={search} projects={projects} engine={engine} />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("index down");
    expect(html).toContain("Retry");
  });
});
