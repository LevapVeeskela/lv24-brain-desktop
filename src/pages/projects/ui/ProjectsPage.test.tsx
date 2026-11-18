import { describe, expect, it } from "vitest";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { projectsSource } from "@/test/api";
import { adoptReport, project } from "@/test/fixtures";
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

  it("shows the adoption preview with stamped, owned and missing counts", () => {
    const projects = stores();
    projects.adoptPreview = adoptReport();
    const html = renderPage(<ProjectsPage projects={projects} />);
    expect(html).toContain("Adoption preview");
    expect(html).toContain("DESKTOP-F5INSH6");
    expect(html).toContain("1 to stamp");
    expect(html).toContain("1 already owned");
    expect(html).toContain("1 missing here");
    expect(html).toContain("C:\\0project\\lv24");
    expect(html).toContain("Adopt 1");
    expect(html).toContain("Adopt local paths?");
  });

  it("offers an absolute path field for the selected project", () => {
    const projects = stores();
    const html = renderPage(<ProjectsPage projects={projects} />);
    expect(html).toContain("Add path");
    expect(html).toContain('id="project-add-path"');
    expect(html).toContain("Checkout path");
    expect(html).toContain("Absolute path to an existing checkout on this machine.");
    expect(html).toMatch(/disabled=""[^>]*>Add path<\/button>/);
  });
});
