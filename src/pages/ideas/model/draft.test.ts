import { describe, expect, it } from "vitest";
import { ideaFixture } from "@/test/fixtures";
import {
  applyDraftPatch,
  dirtyFields,
  draftFieldPatch,
  draftIsDirty,
  draftPatch,
  draftsEqual,
  isDraftDirty,
  normalizeTags,
  toIdeaDraft,
} from "./draft";

describe("idea drawer draft", () => {
  it("round-trips an idea into input values", () => {
    const idea = ideaFixture({
      title: "Dark calendar",
      status: "doing",
      priority: "high",
      projectId: "lv24-brain-desktop",
      dueAt: new Date(2026, 10, 27, 18, 30).toISOString(),
      remindBeforeMinutes: 120,
      tags: ["ui", "calendar"],
      body: "Contrast check.",
    });
    const draft = toIdeaDraft(idea);
    expect(draft).toMatchObject({
      title: "Dark calendar",
      status: "doing",
      priority: "high",
      projectId: "lv24-brain-desktop",
      dueDate: "2026-11-27",
      dueTime: "18:30",
      reminder: "120",
      tags: "ui, calendar",
      body: "Contrast check.",
    });
    expect(isDraftDirty(draft, idea)).toBe(false);
    expect(draftPatch(draft, idea)).toBeNull();
  });

  it("tracks only the fields that changed", () => {
    const idea = ideaFixture();
    const draft = { ...toIdeaDraft(idea), title: "New title", body: "Notes" };
    expect(dirtyFields(draft, idea)).toEqual(["title", "body"]);
    expect(draftPatch(draft, idea)).toEqual({
      title: "New title",
      body: "Notes",
    });
  });

  it("never writes an empty title or project", () => {
    const idea = ideaFixture();
    const blank = { ...toIdeaDraft(idea), title: "   ", projectId: " " };
    expect(draftPatch(blank, idea)).toBeNull();
  });

  it("keeps due_at and due_date mutually exclusive", () => {
    const idea = ideaFixture();
    const allDay = { ...toIdeaDraft(idea), dueDate: "2026-11-30", dueTime: "" };
    expect(draftPatch(allDay, idea)).toEqual({
      dueDate: "2026-11-30",
      dueAt: null,
    });
    const timed = { ...allDay, dueTime: "09:15" };
    const timedPatch = draftPatch(timed, idea);
    expect(timedPatch?.dueDate).toBeNull();
    expect(timedPatch?.dueAt).toMatch(/^2026-11-30T09:15:00[+-]\d{2}:\d{2}$/);
    const cleared = { ...toIdeaDraft(idea), dueDate: "", dueTime: "" };
    const withDue = ideaFixture({ dueDate: "2026-11-30" });
    expect(draftPatch(cleared, withDue)).toEqual({ dueDate: null, dueAt: null });
  });

  it("normalizes tags and clears a zero reminder", () => {
    const idea = ideaFixture({ tags: ["ui"], remindBeforeMinutes: 60 });
    const draft = { ...toIdeaDraft(idea), tags: " ui, docs ,, ui ", reminder: "0" };
    expect(draftPatch(draft, idea)).toEqual({
      remindBeforeMinutes: null,
      tags: ["ui", "docs"],
    });
    expect(normalizeTags("a,b,c,d,e,f,g,h,i,j,k,l")).toHaveLength(10);
  });

  it("returns one-field patches for blur handlers", () => {
    const idea = ideaFixture();
    const draft = {
      ...toIdeaDraft(idea),
      title: "Renamed",
      tags: "one, two",
      dueDate: "2026-11-30",
    };
    expect(draftFieldPatch(draft, idea, "title")).toEqual({ title: "Renamed" });
    expect(draftFieldPatch(draft, idea, "tags")).toEqual({
      tags: ["one", "two"],
    });
    expect(draftFieldPatch(draft, idea, "dueDate")).toEqual({
      dueDate: "2026-11-30",
      dueAt: null,
    });
    expect(draftFieldPatch(draft, idea, "body")).toBeNull();
  });

  it("mirrors an accepted patch into the draft so it stops looking dirty", () => {
    const idea = ideaFixture({ tags: [], remindBeforeMinutes: 60 });
    const draft = {
      ...toIdeaDraft(idea),
      title: "  Renamed  ",
      tags: " one ,, two ",
      reminder: "0",
      dueDate: "2026-11-30",
    };
    const patch = draftPatch(draft, idea);
    expect(patch).not.toBeNull();
    const applied = applyDraftPatch(draft, patch as NonNullable<typeof patch>);
    expect(applied.title).toBe("Renamed");
    expect(applied.tags).toBe("one, two");
    expect(applied.reminder).toBe("");
    expect(applied.dueDate).toBe("2026-11-30");
    expect(isDraftDirty(applied, idea)).toBe(true); // the idea itself did not change yet
    const saved = {
      ...idea,
      title: "Renamed",
      tags: ["one", "two"],
      remindBeforeMinutes: undefined,
      dueDate: "2026-11-30",
      dueAt: undefined,
    };
    expect(isDraftDirty(applied, saved)).toBe(false);
  });

  it("does not report dirty while the blur save is still in flight", () => {
    const idea = ideaFixture({ title: "Old" });
    const baseline = toIdeaDraft(idea);
    const draft = { ...baseline, title: "New" };
    const pending = applyDraftPatch(baseline, { title: "New" });
    expect(draftIsDirty(draft, idea)).toBe(true);
    expect(draftIsDirty(draft, idea, pending)).toBe(false);
    expect(draftsEqual(draft, pending)).toBe(true);
    expect(draftIsDirty({ ...draft, body: "more" }, idea, pending)).toBe(true);
  });

  it("tracks the completion note for closed ideas", () => {
    const idea = ideaFixture({ status: "dropped", completionNote: "Not now" });
    const draft = toIdeaDraft(idea);
    expect(draft.completionNote).toBe("Not now");
    expect(dirtyFields(draft, idea)).toEqual([]);
    const changed = { ...draft, completionNote: "  Reason  " };
    expect(draftPatch(changed, idea)).toEqual({ completionNote: "Reason" });
    expect(
      draftPatch({ ...changed, completionNote: "   " }, idea),
    ).toEqual({ completionNote: null });
  });
});
