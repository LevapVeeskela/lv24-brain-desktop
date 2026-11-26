import { describe, expect, it } from "vitest";
import { fakeIdeas } from "../api/fakeIdeas";
import { renderPage } from "@/test/render";
import { IdeaDrawer } from "./IdeaDrawer";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);
const projects = [
  { id: "lv24", name: "LV24" },
  { id: "lv24-brain-desktop", name: "LV24 Brain Desktop" },
  { id: "personal", name: "Personal" },
];

function renderDrawer(index: number, overrides: { error?: string | null } = {}) {
  const idea = fakeIdeas(now)[index];
  return renderPage(
    <IdeaDrawer
      idea={idea}
      projects={projects}
      saving={false}
      error={overrides.error ?? null}
      onSave={() => undefined}
      onTrash={() => undefined}
      onClose={() => undefined}
    />,
  );
}

describe("IdeaDrawer", () => {
  it("renders every editable field with the idea values", () => {
    const html = renderDrawer(1);
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Тёмная тема для календаря");
    expect(html).toContain('id="idea-status"');
    expect(html).toContain('value="open" selected');
    expect(html).toContain('id="idea-priority"');
    expect(html).toContain('value="normal" selected');
    expect(html).toContain('id="idea-project"');
    expect(html).toContain('value="lv24-brain-desktop"');
    expect(html).toContain('id="idea-project-options"');
    expect(html).toContain('id="idea-due-date"');
    expect(html).toContain('value="2026-11-27"');
    expect(html).toContain('id="idea-due-time"');
    expect(html).toContain('value="18:00"');
    expect(html).toContain('id="idea-reminder"');
    expect(html).toContain('value="120"');
    expect(html).toContain('id="idea-tags"');
    expect(html).toContain('value="ui, calendar"');
    expect(html).toContain('id="idea-body"');
    expect(html).toContain("Проверить контраст и клавиатуру.");
    expect(html).toContain("session · opencode");
    expect(html).toContain("All changes saved.");
    expect(html).toContain("Delete");
    expect(html).toContain('for="idea-title"');
  });

  it("keeps an all-day idea on the date input only", () => {
    const html = renderDrawer(0);
    expect(html).toContain('value="2026-11-25"');
    expect(html).toContain('id="idea-due-time"');
    expect(html).not.toContain('value="09:00"');
    expect(html).toContain("Remind"); // the label, even without a lead
  });

  it("surfaces a save error inside the drawer", () => {
    const html = renderDrawer(1, { error: "write failed" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("write failed");
  });

  it("uses the transport-safe title limit and tag hint", () => {
    const html = renderDrawer(1);
    expect(html).toContain('maxLength="200"');
    expect(html).toContain("Comma-separated, up to 10.");
  });
});
