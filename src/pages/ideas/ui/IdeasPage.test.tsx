import { describe, expect, it } from "vitest";
import { createFakeIdeasSource, FAKE_IDEA_PROBLEMS, fakeIdeas } from "../api/fakeIdeas";
import { IdeasStore } from "../model/IdeasStore";
import { ProjectsStore } from "@/entities/project/model/ProjectsStore";
import { project } from "@/test/fixtures";
import { projectsSource } from "@/test/api";
import { renderPage } from "@/test/render";
import { createIdeasPageExportSource, IdeasPage } from "./IdeasPage";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

function stores() {
  const ideas = new IdeasStore(createFakeIdeasSource({ now: () => now }), {
    now: () => now,
  });
  ideas.items = fakeIdeas(now);
  ideas.problems = FAKE_IDEA_PROBLEMS;
  ideas.loaded = true;
  const projects = new ProjectsStore(projectsSource());
  projects.items = [
    project({ id: "lv24", name: "LV24" }),
    project({ id: "lv24-brain", name: "LV24 Brain" }),
    project({ id: "lv24-brain-desktop", name: "LV24 Brain Desktop" }),
    project({ id: "personal", name: "Personal" }),
  ];
  projects.loaded = true;
  projects.selectedId = "lv24";
  return { ideas, projects };
}

describe("IdeasPage", () => {
  it("renders the Focus groups, chips and the collapsed Done group", () => {
    const { ideas, projects } = stores();
    const html = renderPage(<IdeasPage ideas={ideas} projects={projects} />);

    expect(html).toContain("<h2>Ideas</h2>");
    expect(html).toContain("5 open");
    expect(html).toContain("2 due today");
    expect(html).toContain("Overdue");
    expect(html).toContain("Today");
    expect(html).toContain("This week");
    expect(html).toContain("Later");
    expect(html).toContain("Позвонить стоматологу");
    expect(html).toContain("! 2d");
    expect(html).toContain("18:00");
    expect(html).toContain("Remind 2 h");
    expect(html).toContain("All day");
    expect(html).toContain("lv24-brain-desktop");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Починить футер");
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
  });

  it("expands Done and strikes completed titles through", () => {
    const { ideas, projects } = stores();
    ideas.setShowDone(true);
    const html = renderPage(<IdeasPage ideas={ideas} projects={projects} />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("<s>Починить футер</s>");
    expect(html).toContain("Перейти на Tailwind");
    expect(html).toContain("Dropped");
  });

  it("switches to the flat All view with every status", () => {
    const { ideas, projects } = stores();
    ideas.setView("all");
    const html = renderPage(<IdeasPage ideas={ideas} projects={projects} />);
    expect(html).toContain("Починить футер");
    expect(html).toContain("Посмотреть курс по Rust");
    expect(html).toContain("Someday");
    expect(html).toContain("Doing");
  });

  it("opens the calendar tab with the grid, agenda and export", () => {
    const { ideas, projects } = stores();
    ideas.setView("calendar");
    const html = renderPage(<IdeasPage ideas={ideas} projects={projects} />);
    expect(html).toContain("Calendar");
    expect(html).toContain('role="grid"');
    expect(html).toContain("November 2026");
    expect(html).toContain("Export .ics");
    expect(html).toContain("Agenda");
    expect(html).toContain("Тёмная тема для календаря");
    expect(html).not.toContain("idea-groups");
    expect((html.match(/role="gridcell"/g) ?? []).length).toBe(42);
  });

  it("exports only the visible scope through the default source", async () => {
    const { ideas } = stores();
    const source = createIdeasPageExportSource(ideas);
    const all = await source.fetchIcs();
    expect(all).toContain("SUMMARY:Тёмная тема для календаря");
    expect(all).toContain("SUMMARY:Позвонить стоматологу");

    ideas.setQuery("стоматолог");
    const filtered = await source.fetchIcs();
    expect(filtered).toContain("SUMMARY:Позвонить стоматологу");
    expect(filtered).not.toContain("SUMMARY:Тёмная тема для календаря");
  });

  it("filters by search and shows the no-match state", () => {
    const { ideas, projects } = stores();
    ideas.setQuery("стоматолог");
    const filtered = renderPage(
      <IdeasPage ideas={ideas} projects={projects} />,
    );
    expect(filtered).toContain("Позвонить стоматологу");
    expect(filtered).not.toContain("Тёмная тема для календаря");

    ideas.setQuery("zzz");
    const empty = renderPage(<IdeasPage ideas={ideas} projects={projects} />);
    expect(empty).toContain("No ideas match the search.");
    expect(empty).toContain("Clear search");
  });

  it("renders the empty state for a fresh list", () => {
    const { ideas, projects } = stores();
    ideas.items = [];
    const html = renderPage(<IdeasPage ideas={ideas} projects={projects} />);
    expect(html).toContain("Ideas captured in chat appear here.");
    expect(html).toContain("Press n to capture one");
  });

  it("shows loading, load errors and problem rows", () => {
    const { ideas, projects } = stores();
    ideas.loaded = false;
    expect(
      renderPage(<IdeasPage ideas={ideas} projects={projects} />),
    ).toContain("Loading ideas…");

    ideas.loaded = true;
    ideas.error = "engine offline";
    const html = renderPage(<IdeasPage ideas={ideas} projects={projects} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("engine offline");
    expect(html).toContain("Unreadable idea files");
    expect(html).toContain(FAKE_IDEA_PROBLEMS[0].path);
    expect(html).toContain("git conflict markers");
  });

  it("offers undo after a completion and after a trash move", () => {
    const { ideas, projects } = stores();
    ideas.lastCompleted = ideas.items[0];
    ideas.lastTrashed = ideas.items[1];
    const html = renderPage(<IdeasPage ideas={ideas} projects={projects} />);
    expect(html).toContain("Позвонить стоматологу");
    expect(html).toContain("moved to trash.");
    expect(html).toContain("Undo");
  });

  it("renders the quick-add form and search box labels", () => {
    const { ideas, projects } = stores();
    const html = renderPage(<IdeasPage ideas={ideas} projects={projects} />);
    expect(html).toContain('for="ideas-quick-add"');
    expect(html).toContain("Capture an idea…");
    expect(html).toContain('type="submit"');
    expect(html).toContain(">Add</button>");
    expect(html).toContain('for="ideas-search"');
    expect(html).toContain("Search ideas…");
  });

  it("opens the drawer for the focused idea with editable fields", () => {
    const { ideas, projects } = stores();
    const target = ideas.items[1];
    ideas.drawerId = target.id;
    const html = renderPage(
      <IdeasPage ideas={ideas} projects={projects} />,
      "en",
      ["/ideas?focus=missing"],
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Idea details");
    expect(html).toContain('id="idea-title"');
    expect(html).toContain("Тёмная тема для календаря");
    expect(html).toContain('id="idea-project"');
    expect(html).toContain("All changes saved.");
    expect(html).toContain(">Delete</button>");
  });

  it("translates the headings and groups", () => {
    const { ideas, projects } = stores();
    const ru = renderPage(
      <IdeasPage ideas={ideas} projects={projects} />,
      "ru",
    );
    expect(ru).toContain("<h2>Идеи</h2>");
    expect(ru).toContain("Сегодня");
    expect(ru).toContain("На этой неделе");

    const zh = renderPage(
      <IdeasPage ideas={ideas} projects={projects} />,
      "zh",
    );
    expect(zh).toContain("<h2>想法</h2>");
    expect(zh).toContain("今天");
  });
});
