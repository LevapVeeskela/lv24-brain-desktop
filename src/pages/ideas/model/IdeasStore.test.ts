import { describe, expect, it } from "vitest";
import type {
  IdeaCreateInput,
  IdeaUpdateInput,
} from "@/entities/ideas/model/types";
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

  it("quick-adds an all-day idea for a calendar day", async () => {
    const { ideas } = makeStore();
    await ideas.load();
    expect(await ideas.quickAdd("Day idea", { dueDate: "2026-12-01" })).toBe(
      true,
    );
    const created = ideas.items.at(-1);
    expect(created).toMatchObject({
      title: "Day idea",
      dueDate: "2026-12-01",
    });
    expect(created?.dueAt).toBeUndefined();

    await ideas.quickAdd("Bad date", { dueDate: "2026-02-31" });
    expect(ideas.items.at(-1)?.title).toBe("Bad date");
    expect(ideas.items.at(-1)?.dueDate).toBeUndefined();
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

  it("loads the full idea body when the drawer opens", async () => {
    const summary = ideaFixture({
      id: "detail",
      projectId: "lv24",
      body: "",
    });
    const source = createFakeIdeasSource({
      now: () => now,
      ideas: [summary],
    });
    source.get = async (id) => ({ ...summary, id, body: "Full body" });
    const ideas = new IdeasStore(source, { now: () => now });
    await ideas.load();
    expect(ideas.items[0]?.body).toBe("");

    ideas.openDrawer("detail");
    await Promise.resolve();
    await Promise.resolve();
    expect(ideas.drawerIdea?.body).toBe("Full body");
  });

  it("keeps the open drawer body across a list refresh", async () => {
    const full = ideaFixture({
      id: "detail",
      projectId: "lv24",
      body: "Full body",
    });
    const source = createFakeIdeasSource({
      now: () => now,
      ideas: [full],
    });
    // The real list omits body; keep the fake detail read full.
    const list = source.list.bind(source);
    source.list = async (filter) => {
      const result = await list(filter);
      return {
        ...result,
        ideas: result.ideas.map((idea) => ({ ...idea, body: "" })),
      };
    };
    const ideas = new IdeasStore(source, { now: () => now });
    await ideas.load();
    expect(ideas.items[0]?.body).toBe("");

    ideas.openDrawer("detail");
    await Promise.resolve();
    await Promise.resolve();
    expect(ideas.drawerIdea?.body).toBe("Full body");

    await ideas.save("detail", { title: "Renamed" });
    expect(ideas.drawerIdea?.title).toBe("Renamed");
    expect(ideas.drawerIdea?.body).toBe("Full body");
  });

  it("keeps the summary drawer and reports a failed detail read", async () => {
    const { source, ideas } = makeStore();
    await ideas.load();
    const target = ideas.items[0];
    source.get = async () => {
      throw new Error("problem file");
    };
    ideas.openDrawer(target.id);
    await Promise.resolve();
    await Promise.resolve();
    expect(ideas.drawerId).toBe(target.id);
    expect(ideas.actionError).toBe("problem file");
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

  it("waits for an in-flight load before a forced refresh", async () => {
    const { source, ideas } = makeStore();
    let releaseFirst!: () => void;
    const firstRead = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const list = source.list.bind(source);
    let calls = 0;
    source.list = async (filter) => {
      calls += 1;
      if (calls === 1) {
        await firstRead;
      }
      return list(filter);
    };

    const initial = ideas.load();
    const refresh = ideas.refresh();
    releaseFirst();
    await Promise.all([initial, refresh]);
    expect(calls).toBe(2);
  });

  it("writes the desktop default lead into new ideas and untouched edits", async () => {
    const source = createFakeIdeasSource({
      now: () => now,
      ideas: [
        ideaFixture({
          id: "no-lead",
          projectId: "lv24",
          dueDate: "2026-12-01",
        }),
      ],
    });
    const ideas = new IdeasStore(source, {
      now: () => now,
      defaultLeadMinutes: () => 60,
    });
    await ideas.load();

    const create = source.create.bind(source);
    let created: IdeaCreateInput | undefined;
    source.create = async (input) => {
      created = input;
      return create(input);
    };
    await ideas.quickAdd("Позвонить стоматологу");
    expect(created?.remindBeforeMinutes).toBe(60);

    const update = source.update.bind(source);
    let saved: IdeaUpdateInput | undefined;
    source.update = async (id, patch) => {
      saved = patch;
      return update(id, patch);
    };
    await ideas.save("no-lead", { title: "Переименовано" });
    expect(saved?.remindBeforeMinutes).toBe(60);
    expect(
      ideas.items.find((idea) => idea.id === "no-lead")?.remindBeforeMinutes,
    ).toBe(60);
  });

  it("keeps an explicit reminder and an explicit clear", async () => {
    const source = createFakeIdeasSource({
      now: () => now,
      ideas: [
        ideaFixture({
          id: "explicit",
          projectId: "lv24",
          dueDate: "2026-12-01",
          remindBeforeMinutes: 120,
        }),
        ideaFixture({
          id: "empty",
          projectId: "lv24",
          dueDate: "2026-12-02",
        }),
      ],
    });
    const ideas = new IdeasStore(source, {
      now: () => now,
      defaultLeadMinutes: () => 60,
    });
    await ideas.load();

    const update = source.update.bind(source);
    const patches: IdeaUpdateInput[] = [];
    source.update = async (id, patch) => {
      patches.push(patch);
      return update(id, patch);
    };

    await ideas.save("explicit", { title: "Renamed" });
    expect(patches.at(-1)?.remindBeforeMinutes).toBeUndefined();
    expect(
      ideas.items.find((idea) => idea.id === "explicit")?.remindBeforeMinutes,
    ).toBe(120);

    await ideas.save("empty", { remindBeforeMinutes: null });
    expect(patches.at(-1)?.remindBeforeMinutes).toBeNull();
    expect(
      ideas.items.find((idea) => idea.id === "empty")?.remindBeforeMinutes,
    ).toBeUndefined();
  });

  it("accepts the WS8 default-lead hook after construction", async () => {
    const source = createFakeIdeasSource({
      now: () => now,
      ideas: [
        ideaFixture({
          id: "dated",
          projectId: "lv24",
          dueDate: "2026-12-01",
        }),
      ],
    });
    const ideas = new IdeasStore(source, { now: () => now });
    await ideas.load();
    ideas.setDefaultLeadMinutes(() => 30);

    let patch: IdeaUpdateInput | undefined;
    const update = source.update.bind(source);
    source.update = async (id, input) => {
      patch = input;
      return update(id, input);
    };
    await ideas.save("dated", { title: "Renamed" });
    expect(patch?.remindBeforeMinutes).toBe(30);
  });

  it("does not write a lead when reminders are off or the setting is absent", async () => {
    const source = createFakeIdeasSource({ now: () => now, ideas: [] });
    const ideas = new IdeasStore(source, {
      now: () => now,
      defaultLeadMinutes: () => 0,
    });
    await ideas.load();
    const create = source.create.bind(source);
    let created: IdeaCreateInput | undefined;
    source.create = async (input) => {
      created = input;
      return create(input);
    };
    await ideas.quickAdd("Без напоминания");
    expect(created?.remindBeforeMinutes).toBeUndefined();
  });

  it("refreshes after mutations and preserves the open drawer", async () => {
    const { source, ideas } = makeStore();
    await ideas.load();
    const target = ideas.items.find((idea) => idea.status === "open");
    expect(target).toBeDefined();
    ideas.openDrawer((target as { id: string }).id);

    let calls = 0;
    const list = source.list.bind(source);
    source.list = async (filter) => {
      calls += 1;
      return list(filter);
    };

    await ideas.save((target as { id: string }).id, { title: "Renamed" });
    expect(calls).toBe(1);
    expect(ideas.drawerId).toBe(target?.id);
    expect(ideas.cursorId).toBe(target?.id);
    expect(ideas.drawerIdea?.title).toBe("Renamed");

    await ideas.quickAdd("Ещё одна");
    expect(calls).toBe(2);

    const current = ideas.items.find((idea) => idea.status === "open");
    await ideas.trash((current as { id: string }).id);
    expect(calls).toBe(3);
  });

  it("reopens a doing idea through open before restoring doing", async () => {
    const source = createFakeIdeasSource({
      now: () => now,
      ideas: [ideaFixture({ id: "doing", projectId: "lv24", status: "doing" })],
    });
    const ideas = new IdeasStore(source, { now: () => now });
    await ideas.load();
    const patches: IdeaUpdateInput[] = [];
    const update = source.update.bind(source);
    source.update = async (id, patch) => {
      patches.push(patch);
      return update(id, patch);
    };

    await ideas.toggleDone("doing");
    expect(await ideas.undoComplete()).toBe(true);
    expect(patches.map((patch) => patch.status)).toEqual([
      "done",
      "open",
      "doing",
    ]);
    expect(ideas.items[0]?.status).toBe("doing");
  });

  it("rolls back a failed trash and reports the error", async () => {
    const { source, ideas } = makeStore();
    await ideas.load();
    const target = ideas.items[0];
    source.trash = async () => {
      throw new Error("trash failed");
    };
    expect(await ideas.trash(target.id)).toBe(false);
    expect(ideas.items.some((idea) => idea.id === target.id)).toBe(true);
    expect(ideas.actionError).toBe("trash failed");
    expect(ideas.action).toBeNull();
  });
});
