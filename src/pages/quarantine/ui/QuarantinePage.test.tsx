import { describe, expect, it } from "vitest";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { QuarantineStore } from "@/entities/memory/model/QuarantineStore";
import { ReviewStore } from "@/entities/memory/model/ReviewStore";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { memorySource, projectsSource } from "@/test/api";
import { project, quarantineItem } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { QuarantinePage } from "./QuarantinePage";

function stores(items = [quarantineItem()]) {
  const projects = new ProjectsStore(projectsSource());
  projects.items = [project()];
  projects.loaded = true;
  projects.selectedId = "lv24";
  const quarantine = new QuarantineStore(memorySource());
  quarantine.projectId = "lv24";
  quarantine.loaded = true;
  quarantine.items = items;
  return {
    projects,
    quarantine,
    review: new ReviewStore(memorySource()),
    engine: new EngineStore(),
  };
}

describe("QuarantinePage", () => {
  it("renders the review inbox with reasons, age and trust controls", () => {
    const { projects, quarantine, review, engine } = stores([
      quarantineItem(),
      quarantineItem({
        id: "note-q2",
        title: "Unknown origin",
        reason: "unknown_origin",
        trust: undefined,
      }),
    ]);
    const html = renderPage(
      <QuarantinePage
        quarantine={quarantine}
        review={review}
        projects={projects}
        engine={engine}
      />,
    );
    expect(html).toContain("Unreviewed external writes and unknown origins.");
    expect(html).toContain("<table");
    expect(html).toContain("Quarantined records: 2");
    expect(html).toContain("Unreviewed");
    expect(html).toContain("Unknown origin");
    expect(html).toContain("1 hour ago");
    expect(html).toContain("/memory/note/note-q1?project=lv24");
    expect(html).toContain("Keep current");
    expect(html).toContain("Verified");
    expect(html).toContain("Stated");
    expect(html).toContain("Inferred");
    expect(html).toContain(">Review</button>");
    expect(html).toContain('aria-label="Review: External note"');
  });

  it("renders empty and error states", () => {
    const empty = stores([]);
    expect(
      renderPage(
        <QuarantinePage
          quarantine={empty.quarantine}
          review={empty.review}
          projects={empty.projects}
          engine={empty.engine}
        />,
      ),
    ).toContain("Quarantine is empty");

    const failed = stores();
    failed.quarantine.error = "denied";
    const html = renderPage(
      <QuarantinePage
        quarantine={failed.quarantine}
        review={failed.review}
        projects={failed.projects}
        engine={failed.engine}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("denied");
  });
});
