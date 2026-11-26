import { describe, expect, it } from "vitest";
import {
  createFakeIdeasSource,
  FAKE_IDEA_PROBLEMS,
  fakeIdeas,
} from "./fakeIdeas";
import { isIdeaDueToday } from "../model/format";

const now = new Date(2026, 10, 27, 12, 0, 0, 0);

describe("fake ideas source", () => {
  it("covers overdue, today, week, later, someday, done, dropped and three projects", () => {
    const ideas = fakeIdeas(now);
    expect(ideas).toHaveLength(8);
    const byStatus = ideas.map((idea) => idea.status);
    expect(byStatus).toContain("doing");
    expect(byStatus).toContain("someday");
    expect(byStatus).toContain("done");
    expect(byStatus).toContain("dropped");
    const projects = new Set(ideas.map((idea) => idea.projectId));
    expect(projects).toEqual(
      new Set(["personal", "lv24-brain", "lv24-brain-desktop"]),
    );
    const timed = ideas.find((idea) => idea.dueAt && isIdeaDueToday(idea, now));
    expect(timed?.remindBeforeMinutes).toBe(120);
    expect(ideas.some((idea) => idea.dueDate && isIdeaDueToday(idea, now))).toBe(
      true,
    );
    expect(ideas.some((idea) => idea.status === "done" && idea.completedAt)).toBe(
      true,
    );
  });

  it("lists ideas with problems and applies the contract filters", async () => {
    const source = createFakeIdeasSource({ now: () => now });
    const all = await source.list({});
    expect(all.ideas).toHaveLength(8);
    expect(all.problems).toEqual(FAKE_IDEA_PROBLEMS);

    const scoped = await source.list({ projectId: "lv24-brain" });
    expect(scoped.ideas.every((idea) => idea.projectId === "lv24-brain")).toBe(
      true,
    );
    expect(scoped.ideas).toHaveLength(3);

    const open = await source.list({ statuses: ["open"] });
    expect(open.ideas.every((idea) => idea.status === "open")).toBe(true);

    const search = await source.list({ query: "календар" });
    expect(search.ideas.map((idea) => idea.projectId)).toEqual([
      "lv24-brain-desktop",
    ]);

    const limited = await source.list({ limit: 2 });
    expect(limited.ideas).toHaveLength(2);

    const overdue = await source.list({ dueBefore: "2026-11-26" });
    expect(overdue.ideas.every((idea) => idea.dueDate)).toBe(true);
  });

  it("creates an open idea with defaults and a desktop source", async () => {
    const source = createFakeIdeasSource({ now: () => now });
    const created = await source.create({ title: "  New idea  " });
    expect(created).toMatchObject({
      title: "New idea",
      projectId: "personal",
      status: "open",
      priority: "normal",
      tags: [],
      body: "",
      source: undefined,
    });
    expect(created.createdAt).toBe(now.toISOString());
    await expect(source.create({ title: "  " })).rejects.toThrow(
      "idea title is required",
    );
  });

  it("completes, reopens and clears mutually exclusive due fields", async () => {
    const source = createFakeIdeasSource({ now: () => now });
    const [first] = (await source.list({})).ideas;
    const done = await source.update(first.id, { status: "done" });
    expect(done.status).toBe("done");
    expect(done.completedAt).toBeTruthy();

    const reopened = await source.update(first.id, {
      status: "open",
      completedAt: null,
    });
    expect(reopened.status).toBe("open");
    expect(reopened.completedAt).toBeUndefined();

    const allDay = await source.update(first.id, {
      dueDate: "2026-12-01",
      dueAt: null,
    });
    expect(allDay.dueDate).toBe("2026-12-01");
    expect(allDay.dueAt).toBeUndefined();

    const timed = await source.update(first.id, {
      dueAt: "2026-12-01T10:00:00+03:00",
      dueDate: null,
    });
    expect(timed.dueAt).toBe("2026-12-01T10:00:00+03:00");
    expect(timed.dueDate).toBeUndefined();
  });

  it("trashes and restores without another list entry", async () => {
    const source = createFakeIdeasSource({ now: () => now });
    const [first] = (await source.list({})).ideas;
    await source.trash(first.id);
    expect((await source.list({})).ideas.some((idea) => idea.id === first.id)).toBe(
      false,
    );
    const restored = await source.restore(first.id);
    expect(restored.id).toBe(first.id);
    const after = await source.list({});
    expect(after.ideas.filter((idea) => idea.id === first.id)).toHaveLength(1);
    await expect(source.restore(first.id)).rejects.toThrow("not in trash");
  });

  it("returns copies so callers cannot mutate the store", async () => {
    const source = createFakeIdeasSource({ now: () => now });
    const listed = await source.list({});
    listed.ideas[0].title = "changed";
    listed.ideas[0].tags.push("x");
    const again = (await source.list({})).ideas[0];
    expect(again.title).not.toBe("changed");
    expect(again.tags).not.toContain("x");
  });
});
