import { describe, expect, it } from "vitest";
import { EngineStore } from "@/entities/engine/model/EngineStore";
import { ReviewStore } from "@/entities/memory/model/ReviewStore";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { memorySource, projectsSource } from "@/test/api";
import {
  proposal,
  proposalDetail,
  project,
  reviewFixResult,
  reviewReport,
} from "@/test/fixtures";
import { renderPage } from "@/test/render";
import {
  InboxPage,
  isInboxActionBlocked,
  isTypingTarget,
} from "./InboxPage";

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

  it("shows a bounded proposal preview and the detail link", () => {
    const { projects, review, engine } = stores();
    review.loaded = true;
    review.report = reviewReport([proposal()]);
    review.preview = proposalDetail({
      body: "Prefer FTS5 because it ships with SQLite.",
      bodyTruncated: true,
      bodyTokens: 9,
      maxTokens: 8,
    });
    review.previewId = "prop-1";
    review.previewProjectId = "lv24";
    const html = renderPage(
      <InboxPage review={review} projects={projects} engine={engine} />,
    );
    expect(html).toContain("Proposal preview");
    expect(html).toContain("Prefer FTS5 because it ships with SQLite.");
    expect(html).toContain("Body truncated at 9 of 8 tokens.");
    expect(html).toContain("/inbox/proposal/lv24/prop-1");
    expect(html).toContain("Open proposal");
  });

  it("uses the include_body queue body without a detail request", () => {
    const { projects, review, engine } = stores();
    review.loaded = true;
    review.report = reviewReport([proposal()]);
    review.bodies = {
      "prop-1": proposal({
        body: "Queue body from include_body.",
        bodyOmitted: false,
      }),
    };
    const html = renderPage(
      <InboxPage review={review} projects={projects} engine={engine} />,
    );
    expect(html).toContain("Queue body from include_body.");
    expect(html).toContain("Open proposal");
  });

  it("previews safe fixes before offering an explicit apply", () => {
    const { projects, review, engine } = stores();
    review.loaded = true;
    review.report = reviewReport([]);
    review.fixPreview = reviewFixResult({
      dryRun: true,
      findings: [
        {
          kind: "stale-next",
          severity: "warn",
          message: "Next action is behind a later handoff",
          why: "A later handoff exists",
          next: "Adopt the later next action",
          confirm: "Is the later handoff authoritative?",
          fixable: true,
          fix: "set_next_action",
        },
      ],
      changes: [
        {
          kind: "stale-next",
          action: "set_next_action",
          field: "next_action",
          value: "Ship 1.2",
          evidence: "handoff-2",
        },
      ],
    });
    const html = renderPage(
      <InboxPage review={review} projects={projects} engine={engine} />,
    );
    expect(html).toContain("Safe fixes");
    expect(html).toContain("Planned changes: 1");
    expect(html).toContain("Next action is behind a later handoff");
    expect(html).toContain("set_next_action");
    expect(html).toContain("Ship 1.2");
    expect(html).toContain("Apply (1)");
    expect(html).toContain("This is a dry run. Nothing has been written.");
  });

  it("labels rows with their project in an all-projects review", () => {
    const { projects, review, engine } = stores();
    review.allProjects = true;
    review.loaded = true;
    review.report = reviewReport(
      [proposal({ projectId: "beta", id: "prop-b" })],
      { projectId: "*", projectIds: ["lv24", "beta"], allProjects: true },
    );
    const html = renderPage(
      <InboxPage review={review} projects={projects} engine={engine} />,
    );
    expect(html).toContain(">beta<");
    expect(html).toContain("Select one project to preview and apply safe fixes.");
  });

  it("blocks A/D on key repeat or a focused control", () => {
    const button = { tagName: "BUTTON", closest: () => null };
    expect(isInboxActionBlocked({ key: "a", repeat: true, target: button })).toBe(
      true,
    );
    expect(isInboxActionBlocked({ key: "D", target: button })).toBe(true);
    expect(
      isInboxActionBlocked({
        key: "d",
        target: { tagName: "DIV", closest: () => null },
      }),
    ).toBe(false);

    const dialogChild = {
      tagName: "SPAN",
      closest: (selector: string) =>
        selector.includes("[role='dialog']") ? {} : null,
    };
    expect(isInboxActionBlocked({ key: "a", target: dialogChild })).toBe(true);
    expect(isInboxActionBlocked({ key: "j", repeat: true, target: button })).toBe(
      false,
    );
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
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
