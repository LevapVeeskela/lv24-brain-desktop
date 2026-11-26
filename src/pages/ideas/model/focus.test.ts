import { describe, expect, it } from "vitest";
import { ideaFixture } from "@/test/fixtures";
import {
  dueTodayCount,
  filterIdeas,
  groupIdeas,
  matchesIdeaQuery,
  openIdeaCount,
  overdueCount,
  sortIdeas,
  todayPreview,
} from "./focus";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

const ideas = [
  ideaFixture({ id: "overdue", title: "Overdue", dueDate: "2026-11-25" }),
  ideaFixture({ id: "today", title: "Today", dueDate: "2026-11-27" }),
  ideaFixture({ id: "week", title: "Week", dueDate: "2026-11-29" }),
  ideaFixture({ id: "later", title: "Later", dueDate: "2026-12-10" }),
  ideaFixture({ id: "nodue", title: "No due", priority: "high" }),
  ideaFixture({
    id: "someday",
    title: "Someday",
    status: "someday",
    dueDate: "2026-11-28",
  }),
  ideaFixture({
    id: "done",
    title: "Done",
    status: "done",
    completedAt: "2026-11-27T08:00:00Z",
    dueDate: "2026-11-20",
  }),
  ideaFixture({
    id: "dropped",
    title: "Dropped",
    status: "dropped",
    completedAt: "2026-11-26T08:00:00Z",
  }),
];

describe("idea focus grouping", () => {
  it("buckets open ideas by the local due day", () => {
    const groups = groupIdeas(ideas, now);
    expect(groups.map((group) => group.key)).toEqual([
      "overdue",
      "today",
      "week",
      "later",
      "done",
    ]);
    const byKey = Object.fromEntries(
      groups.map((group) => [group.key, group.ideas.map((idea) => idea.id)]),
    );
    expect(byKey.overdue).toEqual(["overdue"]);
    expect(byKey.today).toEqual(["today"]);
    expect(byKey.week).toEqual(["week"]);
    expect(byKey.later).toEqual(["someday", "later", "nodue"]);
    expect(byKey.done).toEqual(["done", "dropped"]);
  });

  it("keeps a dated someday idea out of today and overdue", () => {
    const groups = groupIdeas(ideas, now);
    const someday = groups.find((group) => group.key === "later");
    expect(someday?.ideas.map((idea) => idea.id)).toContain("someday");
  });

  it("sorts open ideas by due day, then priority, and closed ideas last", () => {
    const sorted = sortIdeas(ideas);
    expect(sorted.at(-1)?.status === "done" || sorted.at(-1)?.status === "dropped").toBe(
      true,
    );
    expect(sorted[0].id).toBe("overdue");
    const noDueIndex = sorted.findIndex((idea) => idea.id === "nodue");
    const laterIndex = sorted.findIndex((idea) => idea.id === "later");
    expect(noDueIndex).toBeGreaterThan(laterIndex);
  });

  it("matches title, tag and project but not the body", () => {
    const idea = ideaFixture({
      title: "Dark calendar",
      tags: ["ui"],
      projectId: "lv24-brain-desktop",
      body: "contrast",
    });
    expect(matchesIdeaQuery(idea, "dark")).toBe(true);
    expect(matchesIdeaQuery(idea, "UI")).toBe(true);
    expect(matchesIdeaQuery(idea, "desktop")).toBe(true);
    expect(matchesIdeaQuery(idea, "contrast")).toBe(false);
    expect(matchesIdeaQuery(idea, "  ")).toBe(true);
  });

  it("filters by project scope and query", () => {
    const scoped = filterIdeas(
      [ideaFixture({ id: "a", projectId: "lv24" }), ideaFixture({ id: "b", projectId: "personal" })],
      { scope: "project", projectId: "personal", query: "" },
    );
    expect(scoped.map((idea) => idea.id)).toEqual(["b"]);
    const all = filterIdeas(
      [ideaFixture({ id: "a", projectId: "lv24" })],
      { scope: "all", projectId: "personal", query: "" },
    );
    expect(all).toHaveLength(1);
  });

  it("counts open, due-today and overdue ideas globally", () => {
    expect(openIdeaCount(ideas)).toBe(5);
    expect(dueTodayCount(ideas, now)).toBe(1);
    expect(overdueCount(ideas, now)).toBe(1);
  });

  it("previews at most three overdue and today ideas for the dashboard", () => {
    const many = [
      ...ideas,
      ideaFixture({ id: "today-2", title: "Today 2", dueDate: "2026-11-27" }),
      ideaFixture({ id: "today-3", title: "Today 3", dueDate: "2026-11-27" }),
      ideaFixture({ id: "overdue-2", title: "Overdue 2", dueDate: "2026-11-24" }),
    ];
    const preview = todayPreview(many, now, 3);
    expect(preview).toHaveLength(3);
    expect(preview[0].id).toBe("overdue-2");
    expect(preview.every((idea) => idea.status === "open")).toBe(true);
  });
});
