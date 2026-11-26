import { describe, expect, it } from "vitest";
import { ideaFixture } from "@/test/fixtures";
import { createFakeIdeasSource } from "../api/fakeIdeas";
import { IdeasStore } from "./IdeasStore";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

function makeStore() {
  const source = createFakeIdeasSource({ now: () => now });
  const ideas = new IdeasStore(source, { now: () => now });
  return { source, ideas };
}

describe("IdeasStore", () => {
  it("loads every project once and keeps the problem rows", async () => {
    const { source, ideas } = makeStore();
    let calls = 0;
    const list = source.list.bind(source);
    source.list = (filter) => {
      calls += 1;
      return list(filter);
    };

    await ideas.load();
    expect(ideas.loaded).toBe(true);
    expect(ideas.items).toHaveLength(8);
    expect(ideas.problems).toHaveLength(1);
    expect(ideas.openCount).toBe(5);
    expect(ideas.dueTodayCount).toBe(2);
    expect(ideas.error).toBeNull();

    await ideas.load();
    expect(calls).toBe(1);
    await ideas.refresh();
    expect(calls).toBe(2);
  });

  it("filters by scope, project and query, including collapsed done on search", async () => {
    const { ideas } = makeStore();
    await ideas.load();

    ideas.setProject("lv24-brain");
    ideas.setScope("project");
    expect(ideas.scoped).toHaveLength(3);
    expect(ideas.visible).toHaveLength(2);

    ideas.setProject(null);
    expect(ideas.scope).toBe("all");
    ideas.setQuery("tailwind");
    expect(ideas.doneExpanded).toBe(true);
    expect(ideas.visible).toHaveLength(1);
    expect(ideas.visible[0].status).toBe("dropped");
  });

  it("trims search and hides done again when the query clears", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    expect(ideas.visible.some((idea) => idea.status === "done")).toBe(false);

    ideas.setQuery("футер");
    expect(ideas.visible.map((idea) => idea.title)).toEqual(["Починить футер"]);
    ideas.setQuery("");
    expect(ideas.visible.some((idea) => idea.status === "done")).toBe(false);
  });

  it("completes optimistically and undoes the last completion", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    const target = ideas.items.find(
      (idea) => idea.projectId === "lv24-brain-desktop" && idea.status === "open",
    );
    expect(target).toBeDefined();

    await ideas.toggleDone((target as { id: string }).id);
    const completed = ideas.items.find((idea) => idea.id === target?.id);
    expect(completed?.status).toBe("done");
    expect(completed?.completedAt).toBe(now.toISOString());
    expect(ideas.lastCompleted?.id).toBe(target?.id);

    await ideas.undoComplete();
    const reopened = ideas.items.find((idea) => idea.id === target?.id);
    expect(reopened?.status).toBe("open");
    expect(reopened?.completedAt).toBeUndefined();
    expect(ideas.lastCompleted).toBeNull();
  });

  it("reopens a done row through the same toggle", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    const done = ideas.items.find((idea) => idea.status === "done");
    await ideas.toggleDone((done as { id: string }).id);
    expect(ideas.items.find((idea) => idea.id === done?.id)?.status).toBe("open");
  });

  it("rolls back a failed completion and reports the error", async () => {
    const { source, ideas } = makeStore();
    await ideas.load();
    source.update = async () => {
      throw new Error("write failed");
    };
    const target = ideas.items.find((idea) => idea.status === "open");
    const ok = await ideas.toggleDone((target as { id: string }).id);
    expect(ok).toBe(false);
    expect(ideas.items.find((idea) => idea.id === target?.id)?.status).toBe(
      "open",
    );
    expect(ideas.actionError).toBe("write failed");
    expect(ideas.action).toBeNull();
  });

  it("quick-adds a title-only idea in the selected project", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    ideas.setProject("lv24-brain");
    const ok = await ideas.quickAdd("  Новая идея  ");
    expect(ok).toBe(true);
    expect(ideas.items).toHaveLength(9);
    const created = ideas.items.at(-1);
    expect(created).toMatchObject({
      title: "Новая идея",
      projectId: "lv24-brain",
      status: "open",
      source: { type: "desktop" },
    });
    expect(ideas.cursorId).toBe(created?.id);
    expect(await ideas.quickAdd("   ")).toBe(false);
  });

  it("defaults quick add to personal without a project", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    await ideas.quickAdd("Personal idea");
    expect(ideas.items.at(-1)?.projectId).toBe("personal");
  });

  it("trashes a row and restores the last one", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    const target = ideas.items[0];
    expect(await ideas.trash(target.id)).toBe(true);
    expect(ideas.items.some((idea) => idea.id === target.id)).toBe(false);
    expect(ideas.lastTrashed?.id).toBe(target.id);
    expect(await ideas.restoreLast()).toBe(true);
    expect(ideas.items.some((idea) => idea.id === target.id)).toBe(true);
    expect(ideas.lastTrashed).toBeNull();
  });

  it("saves a field patch and replaces the row", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    const target = ideas.items[0];
    expect(await ideas.save(target.id, { title: "Renamed" })).toBe(true);
    expect(ideas.items[0].title).toBe("Renamed");
    expect(ideas.action).toBeNull();
  });

  it("moves the cursor over visible rows only", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    ideas.moveCursor(1);
    expect(ideas.cursorId).toBe(ideas.visible[0].id);
    for (let index = 1; index < ideas.visible.length; index += 1) {
      ideas.moveCursor(1);
    }
    expect(ideas.cursorId).toBe(ideas.visible.at(-1)?.id);
    expect(
      ideas.items.find((idea) => idea.id === ideas.cursorId)?.status,
    ).not.toBe("done");
    ideas.moveCursor(1);
    expect(ideas.cursorId).toBe(ideas.visible.at(-1)?.id);
    ideas.setCursor(null);
    ideas.moveCursor(-1);
    expect(ideas.cursorId).toBe(ideas.visible.at(-1)?.id);
  });

  it("clears the cursor when the Done group collapses", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    const done = ideas.items.find((idea) => idea.status === "done");
    ideas.setShowDone(true);
    ideas.setCursor((done as { id: string }).id);
    expect(ideas.cursorId).toBe(done?.id);
    ideas.setShowDone(false);
    expect(ideas.cursorId).toBeNull();
  });

  it("refreshes day-based computeds when the clock moves past midnight", async () => {
    let current = new Date(2026, 10, 27, 23, 59, 0, 0);
    const items = [
      ideaFixture({ id: "today", dueDate: "2026-11-27" }),
      ideaFixture({ id: "tomorrow", dueDate: "2026-11-28" }),
    ];
    const ideas = new IdeasStore(
      createFakeIdeasSource({ now: () => current, ideas: items }),
      { now: () => current },
    );
    await ideas.load();
    let keys = ideas.groups.map((group) => group.key);
    expect(keys).toContain("today");
    expect(keys).toContain("week");

    current = new Date(2026, 10, 28, 0, 1, 0, 0);
    ideas.refreshNow();
    const byKey = Object.fromEntries(
      ideas.groups.map((group) => [group.key, group.ideas.map((idea) => idea.id)]),
    );
    expect(byKey.overdue).toEqual(["today"]);
    expect(byKey.today).toEqual(["tomorrow"]);
  });

  it("opens and closes the drawer only for known ideas", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    const target = ideas.items[0];
    ideas.openDrawer("missing");
    expect(ideas.drawerId).toBeNull();
    ideas.openDrawer(target.id);
    expect(ideas.drawerIdea?.id).toBe(target.id);
    expect(ideas.drawerOpen).toBe(true);
    ideas.closeDrawer();
    expect(ideas.drawerOpen).toBe(false);
  });

  it("reports a load failure and keeps retry possible", async () => {
    const { source, ideas } = makeStore();
    source.list = async () => {
      throw new Error("engine offline");
    };
    await ideas.load();
    expect(ideas.loaded).toBe(false);
    expect(ideas.loading).toBe(false);
    expect(ideas.error).toBe("engine offline");
    ideas.dismissError();
    expect(ideas.error).toBeNull();
  });
});
