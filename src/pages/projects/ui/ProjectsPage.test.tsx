import { describe, expect, it } from "vitest";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { projectsSource } from "@/test/api";
import { project } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { ProjectsPage } from "./ProjectsPage";

function stores(): ProjectsStore {
  const projects = new ProjectsStore(projectsSource());
  projects.items = [project(), project({ id: "beta", name: "Beta" })];
  projects.loaded = true;
  projects.selectedId = "lv24";
  return projects;
}

describe("ProjectsPage", () => {
  it("links each row to its detail route and keeps the project param", () => {
    const html = renderPage(<ProjectsPage projects={stores()} />, "en", [
      "/projects?project=lv24",
    ]);
    expect(html).toContain('href="/projects/lv24?project=lv24"');
    expect(html).toContain('href="/projects/beta?project=lv24"');
    expect(html).toContain('class="is-link-row"');
  });

  it("falls back to the selected project when the URL has no param", () => {
    const html = renderPage(<ProjectsPage projects={stores()} />, "en", [
      "/projects",
    ]);
    expect(html).toContain('href="/projects/beta?project=lv24"');
  });
});
