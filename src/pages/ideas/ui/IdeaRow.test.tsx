import { describe, expect, it } from "vitest";
import { ideaFixture } from "@/test/fixtures";
import { renderPage } from "@/test/render";
import { IdeaRow } from "./IdeaRow";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

function renderRow(idea = ideaFixture()) {
  return renderPage(
    <ul>
      <IdeaRow
        idea={idea}
        now={now}
        locale="en"
        onOpen={() => undefined}
        onToggle={() => undefined}
      />
    </ul>,
  );
}

describe("IdeaRow", () => {
  it("shows the overdue and reminder chips for an open row", () => {
    const html = renderRow(
      ideaFixture({
        title: "Call the dentist",
        dueDate: "2026-11-25",
        remindBeforeMinutes: 120,
      }),
    );
    expect(html).toContain("! 2d");
    expect(html).toContain("Remind 2 h");
    expect(html).toContain("idea-due is-overdue");
  });

  it("hides overdue and reminder chips once the idea is closed", () => {
    const html = renderRow(
      ideaFixture({
        title: "Call the dentist",
        status: "done",
        dueDate: "2026-11-25",
        remindBeforeMinutes: 120,
        completedAt: "2026-11-26T08:00:00Z",
      }),
    );
    expect(html).toContain("<s>Call the dentist</s>");
    expect(html).not.toContain("! 2d");
    expect(html).not.toContain("Remind");
    expect(html).not.toContain("idea-due");
    expect(html).toContain('data-idea-id="idea-2026-11-27-fixture-01jcs0000000000000000000"');
  });

  it("marks the cursor row for keyboard navigation", () => {
    const html = renderPage(
      <ul>
        <IdeaRow
          idea={ideaFixture()}
          now={now}
          locale="en"
          cursor
          onOpen={() => undefined}
          onToggle={() => undefined}
        />
      </ul>,
    );
    expect(html).toContain("idea-row is-cursor");
  });
});
