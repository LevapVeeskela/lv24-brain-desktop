import { describe, expect, it, vi } from "vitest";
import { LocalApiError } from "@/shared/api/client";
import { memorySource } from "@/test/api";
import { recordDetail } from "@/test/fixtures";
import { RecordEditor } from "./RecordEditor";

function openEditor(
  overrides: Parameters<typeof memorySource>[0] = {},
  detail = recordDetail({ kind: "note", title: "Original", body: "Old body" }),
) {
  const onSaved = vi.fn();
  const api = memorySource(overrides);
  const editor = new RecordEditor(api, onSaved);
  editor.openFor(detail);
  return { editor, api, onSaved, detail };
}

describe("RecordEditor", () => {
  it("sends only changed fields with the revision it read", async () => {
    const editRecord = vi.fn(async () =>
      recordDetail({
        kind: "note",
        title: "Original",
        body: "New body",
        updatedAt: "2026-11-16T06:00:00Z",
      }),
    );
    const { editor, onSaved, detail } = openEditor({ editRecord });
    expect(editor.dirty).toBe(false);
    editor.setBody("New body");
    expect(editor.dirty).toBe(true);
    const saved = await editor.save();
    expect(saved).toBe(true);
    expect(editRecord).toHaveBeenCalledWith("lv24", "note-2026-1", {
      expectedUpdatedAt: detail.updatedAt,
      allowDuplicate: undefined,
      body: "New body",
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(editor.open).toBe(false);
    expect(editor.dirty).toBe(false);
  });

  it("reports a stale revision and reloads the stored record", async () => {
    const conflict = new LocalApiError(
      409,
      "conflict",
      "record changed",
      "2026-11-16T06:30:00Z",
    );
    const editRecord = vi.fn(async () => Promise.reject(conflict));
    const getRecord = vi.fn(async () =>
      recordDetail({
        kind: "note",
        title: "Original",
        body: "Stored body",
        updatedAt: "2026-11-16T06:30:00Z",
      }),
    );
    const { editor } = openEditor({ editRecord, getRecord });
    editor.setBody("My draft");
    await editor.save();
    expect(editor.conflict).toBe(true);
    expect(editor.open).toBe(true);
    expect(editor.body).toBe("My draft");
    expect(editor.canSave).toBe(true);

    await editor.reload();
    expect(getRecord).toHaveBeenCalledWith("lv24", "note-2026-1", {
      history: true,
    });
    expect(editor.conflict).toBe(false);
    expect(editor.body).toBe("Stored body");
    expect(editor.dirty).toBe(false);
  });

  it("retries an exact duplicate only after allow_duplicate", async () => {
    const duplicate = new LocalApiError(409, "duplicate", "duplicate");
    const editRecord = vi
      .fn()
      .mockRejectedValueOnce(duplicate)
      .mockResolvedValueOnce(
        recordDetail({ kind: "note", body: "Same text" }),
      );
    const { editor } = openEditor({ editRecord });
    editor.setBody("Same text");
    await editor.save();
    expect(editor.duplicate).toBe(true);
    expect(editRecord).toHaveBeenLastCalledWith(
      "lv24",
      "note-2026-1",
      expect.not.objectContaining({ allowDuplicate: true }),
    );

    await editor.saveAsDuplicate();
    expect(editRecord).toHaveBeenLastCalledWith(
      "lv24",
      "note-2026-1",
      expect.objectContaining({ allowDuplicate: true }),
    );
    expect(editor.open).toBe(false);
  });

  it("surfaces the write limit and never sends a handoff title", async () => {
    const limit = new LocalApiError(413, "limit_exceeded", "too large");
    const editRecord = vi.fn(async () => Promise.reject(limit));
    const handoff = recordDetail({
      kind: "handoff",
      title: "Handoff title",
      body: "Summary",
    });
    const { editor } = openEditor({ editRecord }, handoff);
    expect(editor.canEditTitle).toBe(false);
    editor.setTitle("Changed");
    editor.setBody("New summary");
    await editor.save();
    expect(editRecord).toHaveBeenCalledWith(
      "lv24",
      "note-2026-1",
      expect.not.objectContaining({ title: "Changed" }),
    );
    expect(editor.limitExceeded).toBe(true);
  });

  it("sends tags only when the note tag draft changed", async () => {
    const editRecord = vi.fn(async () => recordDetail({ kind: "note" }));
    const { editor } = openEditor({ editRecord });
    editor.setTags("one, two ,, three");
    await editor.save();
    expect(editRecord).toHaveBeenCalledWith(
      "lv24",
      "note-2026-1",
      expect.objectContaining({ tags: ["one", "two", "three"] }),
    );
  });
});
