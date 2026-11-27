import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient, LocalApiError, toApiError } from "@/shared/api/client";
import { errorMessage } from "@/shared/lib/errors";
import {
  ideaBriefQuery,
  ideaCreateBody,
  ideaIcalQuery,
  ideaListQuery,
  ideaPatchBody,
  parseIdea,
  parseIdeaBrief,
  parseIdeaList,
  updateIdea,
} from "./ideasApi";

const timedRow = {
  id: "idea-2026-11-26-calendar-dark-theme-01jcs6abcdefghjkmnpqrstvwx",
  project_id: "lv24-brain-desktop",
  title: "Тёмная тема календаря",
  body: "Проверить контраст и фокус.",
  status: "open",
  priority: "high",
  due_at: "2026-11-27T18:00:00+03:00",
  due_date: null,
  remind_before_minutes: 120,
  tags: ["ui", "calendar"],
  source: { type: "session", id: "ses_01", harness: "opencode" },
  completed_at: null,
  completion_note: "",
  created_at: "2026-11-25T07:00:00Z",
  updated_at: "2026-11-26T07:00:00Z",
  path: "projects/lv24-brain-desktop/ideas/idea-....md",
  provenance: { origin: "agent", reviewed: false, trust: "agent" },
  validity: { valid_from: null },
  relations: [],
  review: { review_after: null },
  unknown: "dropped",
};

describe("idea API mapping", () => {
  it("maps a timed row to camelCase and keeps the stored offset", () => {
    expect(parseIdea(timedRow)).toEqual({
      id: timedRow.id,
      projectId: "lv24-brain-desktop",
      title: "Тёмная тема календаря",
      status: "open",
      priority: "high",
      dueAt: "2026-11-27T18:00:00+03:00",
      remindBeforeMinutes: 120,
      tags: ["ui", "calendar"],
      body: "Проверить контраст и фокус.",
      source: { type: "session", id: "ses_01", harness: "opencode" },
      createdAt: "2026-11-25T07:00:00Z",
      updatedAt: "2026-11-26T07:00:00Z",
    });
  });

  it("maps an all-day list row without a body or reminder", () => {
    expect(
      parseIdea({
        ...timedRow,
        status: "someday",
        due_at: null,
        due_date: "2026-11-28",
        remind_before_minutes: null,
        source: null,
        body: undefined,
      }),
    ).toMatchObject({
      status: "someday",
      dueDate: "2026-11-28",
      body: "",
      tags: ["ui", "calendar"],
    });
    const row = parseIdea({
      ...timedRow,
      status: "someday",
      due_at: null,
      due_date: "2026-11-28",
      remind_before_minutes: null,
      source: null,
    });
    expect(row.dueAt).toBeUndefined();
    expect(row.remindBeforeMinutes).toBeUndefined();
    expect(row.source).toBeUndefined();
    expect(row.completedAt).toBeUndefined();
  });

  it("maps a done row with its completion metadata", () => {
    const row = parseIdea({
      ...timedRow,
      status: "done",
      due_at: null,
      due_date: "2026-11-26",
      completed_at: "2026-11-26T08:00:00Z",
      completion_note: "Готово в коммите 6d529fc",
    });
    expect(row.status).toBe("done");
    expect(row.completedAt).toBe("2026-11-26T08:00:00Z");
    expect(row.completionNote).toBe("Готово в коммите 6d529fc");
  });

  it("maps problems, total and project_source from the list page", () => {
    expect(
      parseIdeaList({
        ideas: [timedRow],
        problems: [
          {
            path: "projects/x/ideas/broken.md",
            kind: "idea",
            reason: "git conflict markers",
          },
        ],
        total: 4,
        project_source: "explicit",
      }),
    ).toEqual({
      ideas: [parseIdea(timedRow)],
      problems: [
        { path: "projects/x/ideas/broken.md", reason: "git conflict markers" },
      ],
      total: 4,
      projectSource: "explicit",
    });
  });

  it("rejects invalid rows instead of showing a zero idea", () => {
    expect(() =>
      parseIdea({ ...timedRow, due_at: timedRow.due_at, due_date: "2026-11-28" }),
    ).toThrow(/both due_at and due_date/);
    expect(() =>
      parseIdea({ ...timedRow, due_at: null, due_date: "2026-02-30" }),
    ).toThrow(/real calendar date/);
    expect(() => parseIdea({ ...timedRow, status: "archived" })).toThrow(
      /status/,
    );
    expect(() =>
      parseIdea({ ...timedRow, remind_before_minutes: 10081 }),
    ).toThrow(/0\.\.10080/);
    expect(() => parseIdeaList({ ideas: "nope", problems: [] })).toThrow(
      /must be an array/,
    );
  });

  it("maps the brief and its counts", () => {
    expect(
      parseIdeaBrief({
        text: "## Ideas - 4 open · 1 due today",
        ideas: [timedRow],
        open: 4,
        due_today: 1,
        muted: false,
      }),
    ).toEqual({
      text: "## Ideas - 4 open · 1 due today",
      ideas: [parseIdea(timedRow)],
      open: 4,
      dueToday: 1,
      muted: false,
    });
  });

  it("builds list, brief and ical queries", () => {
    expect(
      ideaListQuery({
        projectId: "lv24",
        statuses: ["open", "doing"],
        query: "theme",
        dueAfter: "2026-11-01T00:00:00Z",
        dueBefore: "2026-12-01T00:00:00Z",
        limit: 50,
      }),
    ).toEqual({
      project: "lv24",
      status: "open,doing",
      due_after: "2026-11-01T00:00:00Z",
      due_before: "2026-12-01T00:00:00Z",
      q: "theme",
      limit: 50,
    });
    expect(ideaListQuery({})).toEqual({
      project: undefined,
      status: undefined,
      due_before: undefined,
      due_after: undefined,
      q: undefined,
      limit: undefined,
    });
    expect(ideaBriefQuery({ projectId: "lv24", max: 3 })).toEqual({
      project: "lv24",
      scope: undefined,
      max: 3,
    });
    expect(ideaIcalQuery({ projectId: "lv24", includeDone: true })).toEqual({
      project: "lv24",
      include_done: true,
      tags: undefined,
      q: undefined,
    });
    expect(
      ideaIcalQuery({
        projectId: "lv24",
        query: "  theme  ",
        tags: ["ui", "calendar"],
      }),
    ).toEqual({
      project: "lv24",
      include_done: undefined,
      tags: "ui,calendar",
      q: "theme",
    });
    expect(ideaIcalQuery()).toEqual({
      project: undefined,
      include_done: undefined,
      tags: undefined,
      q: undefined,
    });
  });
});

describe("idea API patch mapping", () => {
  it("maps the camelCase patch fields", () => {
    expect(
      ideaPatchBody({
        title: "Renamed",
        projectId: "lv24",
        status: "doing",
        priority: "low",
        body: "Body",
      }),
    ).toEqual({
      title: "Renamed",
      project: "lv24",
      status: "doing",
      priority: "low",
      body: "Body",
    });
  });

  it("clears due, reminder and tags with the explicit flags", () => {
    expect(ideaPatchBody({ dueAt: null, dueDate: null })).toEqual({
      clear_due: true,
    });
    expect(ideaPatchBody({ remindBeforeMinutes: null })).toEqual({
      clear_reminder: true,
    });
    expect(ideaPatchBody({ tags: [] })).toEqual({ clear_tags: true });
  });

  it("replaces the other due kind instead of setting both", () => {
    expect(
      ideaPatchBody({ dueAt: "2026-11-27T18:00:00+03:00", dueDate: null }),
    ).toEqual({ due_at: "2026-11-27T18:00:00+03:00" });
    expect(ideaPatchBody({ dueDate: "2026-11-27", dueAt: null })).toEqual({
      due_date: "2026-11-27",
    });
    expect(ideaPatchBody({ remindBeforeMinutes: 0 })).toEqual({
      remind_before_minutes: 0,
    });
    expect(ideaPatchBody({ tags: ["ui"] })).toEqual({ tags: ["ui"] });
  });

  it("maps the completion note and ignores the read-only completion instant", () => {
    expect(ideaPatchBody({ completionNote: "done" })).toEqual({
      completion_note: "done",
    });
    expect(ideaPatchBody({ completionNote: null })).toEqual({
      completion_note: "",
    });
    expect(ideaPatchBody({ completedAt: null })).toEqual({});
  });
});

describe("idea API note-only save", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("PATCHes a completion note with no other writable field", async () => {
    const row = {
      ...timedRow,
      status: "done",
      completion_note: "shipped",
    };
    const patch = vi.spyOn(apiClient, "PATCH").mockResolvedValue({
      data: { idea: row },
      error: undefined,
      response: new Response("{}", { status: 200 }),
    } as never);

    const saved = await updateIdea("idea-1", { completionNote: "shipped" });

    expect(saved.idea.completionNote).toBe("shipped");
    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith("/v1/ideas/{id}", {
      params: { path: { id: "idea-1" } },
      body: {
        clear_due: false,
        clear_reminder: false,
        clear_tags: false,
        completion_note: "shipped",
      },
    });
  });
});

describe("idea API create mapping", () => {
  it("sends one due kind and the typed source", () => {
    expect(
      ideaCreateBody({
        title: "Idea",
        projectId: "lv24",
        dueAt: "2026-11-27T18:00:00+03:00",
        dueDate: "2026-11-28",
        remindBeforeMinutes: 60,
        priority: "high",
        tags: ["ui"],
        body: "Body",
        source: { type: "desktop" },
        completionNote: "shipped",
      }),
    ).toEqual({
      title: "Idea",
      body: "Body",
      project: "lv24",
      priority: "high",
      due_at: "2026-11-27T18:00:00+03:00",
      due_date: undefined,
      remind_before_minutes: 60,
      tags: ["ui"],
      source: { type: "desktop" },
      completion_note: "shipped",
    });
    expect(
      ideaCreateBody({ title: "All day", dueDate: "2026-11-28" }),
    ).toMatchObject({
      due_date: "2026-11-28",
      due_at: undefined,
      completion_note: undefined,
    });
  });
});

describe("idea API errors", () => {
  it("keeps the sanitized code, message and current revision", () => {
    const error = toApiError(new Response("{}", { status: 409 }), {
      error: {
        code: "conflict",
        message: "idea changed on another machine",
        current_revision: "2026-11-27T10:00:00Z",
      },
    });
    expect(error).toBeInstanceOf(LocalApiError);
    expect(error.status).toBe(409);
    expect(error.code).toBe("conflict");
    expect(error.currentRevision).toBe("2026-11-27T10:00:00Z");
    expect(errorMessage(error)).toBe("idea changed on another machine");
  });

  it("falls back to the status when the envelope is missing", () => {
    const error = toApiError(new Response("", { status: 500 }), undefined);
    expect(error.code).toBe("api_error");
    expect(errorMessage(error)).toBe("Local API returned status 500");
    const unsupported = toApiError(new Response("{}", { status: 400 }), {
      error: { code: "unsupported", message: "ideas need local or git mode" },
    });
    expect(errorMessage(unsupported)).toBe("ideas need local or git mode");
  });
});
