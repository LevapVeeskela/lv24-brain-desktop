import { describe, expect, it } from "vitest";
import { createFakeIdeasSource, fakeIdeas } from "@/pages/ideas/api/fakeIdeas";
import { IdeasStore } from "@/pages/ideas/model/IdeasStore";
import { renderPage } from "@/test/render";
import { IdeasTodayCard } from "./IdeasTodayCard";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

function store(seed = fakeIdeas(now)) {
  const ideas = new IdeasStore(createFakeIdeasSource({ now: () => now, ideas: seed }), {
    now: () => now,
  });
  ideas.items = seed;
  ideas.loaded = true;
  return ideas;
}

describe("IdeasTodayCard", () => {
  it("shows at most three overdue and today ideas with due chips", () => {
    const ideas = store();
    const html = renderPage(<IdeasTodayCard ideas={ideas} />);
    expect(html).toContain("Ideas today");
    expect(html).toContain("5 open");
    expect(html).toContain("Позвонить стоматологу");
    expect(html).toContain("! 2d");
    expect(html).toContain("Тёмная тема для календаря");
    expect(html).toContain("18:00");
    expect(html).toContain("Продлить страховку");
    expect(html.match(/idea-preview-row/g)).toHaveLength(3);
    expect(html).toContain("/ideas?focus=");
  });

  it("renders the empty state when nothing is due", () => {
    const ideas = store([
      fakeIdeas(now).find((idea) => idea.status === "someday")!,
    ]);
    const html = renderPage(<IdeasTodayCard ideas={ideas} />);
    expect(html).toContain("Nothing is due today.");
    expect(html).toContain("Open ideas");
  });
});
