import { describe, expect, it } from "vitest";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { ReviewStore } from "@/entities/memory/model/ReviewStore";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { memorySource, projectsSource } from "@/test/api";
import { proposal, project, reviewReport } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { InboxPage } from "./InboxPage";

function stores() {
  const projects = new ProjectsStore(projectsSource());
  projects.items = [project()];
  projects.loaded = true;
  projects.selectedId = "lv24";
  const review = new ReviewStore(memorySource());
  review.projectId = "lv24";
  return { projects, review, engine: new EngineStore() };
}

describe("InboxPage", () => {
  it("renders the queue, source-health badges and guarded actions", () => {
    const { projects, review, engine } = stores();
    review.loaded = true;
    review.report = reviewReport([
      proposal({
        localOnly: true,
        confidence: 0.82,
        title: "Use SQLite FTS5",
      }),
    ]);
    const html = renderPage(
      <InboxPage review={review} projects={projects} engine={engine} />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Proposals (1)");
    expect(html).toContain("High confidence");
    expect(html).toContain("local only");
    expect(html).toContain('aria-label="Select Use SQLite FTS5"');
    expect(html).toContain("This candidate came from a local-only source.");
    expect(html).toContain("Resolve the source-health checkboxes first.");
    expect(html).toMatch(/disabled=""[^>]*>Accept<\/button>/);
    expect(html).toMatch(/disabled=""[^>]*>Accept 0<\/button>/);
  });

  it("requires force for a stale source", () => {
    const { projects, review, engine } = stores();
    review.loaded = true;
    review.report = reviewReport([proposal({ sourceStale: true })]);
    const html = renderPage(
      <InboxPage review={review} projects={projects} engine={engine} />,
    );
    expect(html).toContain("stale source");
    expect(html).toContain("Promote a stale or orphaned source");
  });

  it("renders inbox zero and load errors", () => {
    const empty = stores();
    empty.review.loaded = true;
    empty.review.report = reviewReport([]);
    expect(
      renderPage(
        <InboxPage
          review={empty.review}
          projects={empty.projects}
          engine={empty.engine}
        />,
      ),
    ).toContain("Inbox zero");

    const failed = stores();
    failed.review.loaded = true;
    failed.review.error = "denied";
    const html = renderPage(
      <InboxPage
        review={failed.review}
        projects={failed.projects}
        engine={failed.engine}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("denied");
  });
});
