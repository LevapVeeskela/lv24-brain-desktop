import {
  IDEA_TAGS_MAX,
  IDEA_TITLE_MAX,
  type Idea,
  type IdeaCreateInput,
  type IdeaFilter,
  type IdeaListResult,
  type IdeaProblem,
  type IdeasSource,
  type IdeaUpdateInput,
} from "@/entities/ideas/model/types";
import { localDateKey } from "../model/format";

export interface FakeIdeasOptions {
  /** Injectable clock so tests and fixtures agree on "today". */
  now?: () => Date;
  ideas?: Idea[];
  problems?: IdeaProblem[];
}

const conflictPath =
  "projects/lv24-brain/ideas/idea-2026-11-26-conflict-01jcs0000000000000000000.md";

export const FAKE_IDEA_PROBLEMS: IdeaProblem[] = [
  { path: conflictPath, reason: "git conflict markers" },
];

function isoAt(base: Date, dayOffset: number, hour: number, minute = 0): string {
  const value = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + dayOffset,
    hour,
    minute,
    0,
    0,
  );
  return value.toISOString();
}

function dateAt(base: Date, dayOffset: number): string {
  const value = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + dayOffset,
  );
  return localDateKey(value);
}

function id(date: Date, slug: string, counter: number): string {
  return `idea-${localDateKey(date)}-${slug}-${String(counter).padStart(26, "0")}`;
}

/**
 * Eight fixtures: overdue, today timed, today all-day, this-week timed,
 * later all-day, an undated someday idea, a done idea and a dropped idea
 * across three projects. Dates are relative to `now`, so "today" never rots.
 */
export function fakeIdeas(now: Date = new Date()): Idea[] {
  const created = isoAt(now, -6, 9);
  return [
    {
      id: id(now, "stomatolog", 1),
      projectId: "personal",
      title: "Позвонить стоматологу",
      status: "open",
      priority: "high",
      dueDate: dateAt(now, -2),
      tags: ["health"],
      body: "Записаться на чистку до конца месяца.",
      source: { type: "manual" },
      createdAt: created,
      updatedAt: isoAt(now, -2, 10),
    },
    {
      id: id(now, "calendar-dark-theme", 2),
      projectId: "lv24-brain-desktop",
      title: "Тёмная тема для календаря",
      status: "open",
      priority: "normal",
      dueAt: isoAt(now, 0, 18),
      remindBeforeMinutes: 120,
      tags: ["ui", "calendar"],
      body: "Проверить контраст и клавиатуру.",
      source: {
        type: "session",
        id: "ses_01jcs000000000000000000000",
        harness: "opencode",
      },
      createdAt: isoAt(now, -1, 10),
      updatedAt: isoAt(now, -1, 10),
    },
    {
      id: id(now, "insurance", 3),
      projectId: "personal",
      title: "Продлить страховку",
      status: "open",
      priority: "low",
      dueDate: dateAt(now, 0),
      tags: [],
      body: "",
      source: { type: "desktop" },
      createdAt: isoAt(now, -3, 12),
      updatedAt: isoAt(now, -3, 12),
    },
    {
      id: id(now, "issue-1", 4),
      projectId: "lv24-brain",
      title: "Закрыть issue #1",
      status: "doing",
      priority: "high",
      dueAt: isoAt(now, 2, 10, 30),
      tags: ["bug"],
      body: "Tauri IPC race on startup.",
      source: { type: "note", id: "note-2026-11-20-01jcs0000000000000000000" },
      createdAt: isoAt(now, -4, 8),
      updatedAt: isoAt(now, -1, 16),
    },
    {
      id: id(now, "archive-notes", 5),
      projectId: "lv24-brain",
      title: "Разобрать архив заметок",
      status: "open",
      priority: "normal",
      dueDate: dateAt(now, 10),
      tags: ["docs"],
      body: "",
      source: { type: "commit", id: "6d529fc" },
      createdAt: created,
      updatedAt: created,
    },
    {
      id: id(now, "rust-course", 6),
      projectId: "personal",
      title: "Посмотреть курс по Rust",
      status: "someday",
      priority: "low",
      tags: ["learning"],
      body: "",
      source: { type: "manual" },
      createdAt: created,
      updatedAt: created,
    },
    {
      id: id(now, "footer-fix", 7),
      projectId: "lv24-brain",
      title: "Починить футер",
      status: "done",
      priority: "normal",
      tags: ["ui"],
      body: "Кнопка документации вела не туда.",
      source: { type: "session", id: "ses_01jcs000000000000000000001", harness: "claude" },
      completedAt: isoAt(now, 0, 8),
      createdAt: isoAt(now, -5, 9),
      updatedAt: isoAt(now, 0, 8),
    },
    {
      id: id(now, "tailwind", 8),
      projectId: "lv24-brain-desktop",
      title: "Перейти на Tailwind",
      status: "dropped",
      priority: "normal",
      tags: ["ui"],
      body: "",
      source: { type: "manual" },
      completionNote: "Не нужно: уже есть свои токены и классы.",
      completedAt: isoAt(now, -3, 11),
      createdAt: isoAt(now, -8, 11),
      updatedAt: isoAt(now, -3, 11),
    },
  ];
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "idea";
}

function dueKey(idea: Idea): string | null {
  return idea.dueAt ?? idea.dueDate ?? null;
}

function compareDue(idea: Idea, bound: string): number | null {
  const value = dueKey(idea);
  if (!value) {
    return null;
  }
  const left = Date.parse(value);
  const right = Date.parse(bound);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return value.localeCompare(bound);
  }
  return left - right;
}

function matchesFilter(idea: Idea, filter: IdeaFilter): boolean {
  if (filter.projectId && idea.projectId !== filter.projectId) {
    return false;
  }
  if (filter.statuses?.length && !filter.statuses.includes(idea.status)) {
    return false;
  }
  const needle = filter.query?.trim().toLowerCase();
  if (
    needle &&
    !idea.title.toLowerCase().includes(needle) &&
    !idea.tags.some((tag) => tag.toLowerCase().includes(needle))
  ) {
    return false;
  }
  if (filter.dueBefore) {
    const diff = compareDue(idea, filter.dueBefore);
    if (diff === null || diff > 0) {
      return false;
    }
  }
  if (filter.dueAfter) {
    const diff = compareDue(idea, filter.dueAfter);
    if (diff === null || diff < 0) {
      return false;
    }
  }
  return true;
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (!tags) {
    return [];
  }
  return tags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, IDEA_TAGS_MAX);
}

function copyIdea(idea: Idea): Idea {
  return {
    ...idea,
    tags: [...idea.tags],
    source: idea.source ? { ...idea.source } : undefined,
  };
}

/**
 * In-memory `IdeasSource` for the 1.8 UI. Every mutation returns a fresh copy
 * and stamps `updatedAt`, so optimistic UI and rollback tests behave like the
 * future local API. It is a class on purpose: MobX leaves class instances
 * unobserved, so tests can swap a method without replacing the store source.
 */
export class FakeIdeasSource implements IdeasSource {
  private ideas: Idea[];
  private problems: IdeaProblem[];
  private readonly trashed = new Map<string, Idea>();
  private readonly now: () => Date;
  private counter = 100;

  constructor(options: FakeIdeasOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.ideas = (options.ideas ?? fakeIdeas(this.now())).map(copyIdea);
    this.problems = (options.problems ?? FAKE_IDEA_PROBLEMS).map((item) => ({
      ...item,
    }));
  }

  private stamp(): string {
    return this.now().toISOString();
  }

  private find(ideaId: string): Idea | undefined {
    return this.ideas.find((idea) => idea.id === ideaId);
  }

  async list(filter: IdeaFilter): Promise<IdeaListResult> {
    const matched = this.ideas.filter((idea) => matchesFilter(idea, filter));
    const limited =
      filter.limit && filter.limit > 0 ? matched.slice(0, filter.limit) : matched;
    return {
      ideas: limited.map(copyIdea),
      problems: this.problems.map((item) => ({ ...item })),
    };
  }

  async create(input: IdeaCreateInput): Promise<Idea> {
    const title = input.title.trim().slice(0, IDEA_TITLE_MAX);
    if (!title) {
      throw new Error("idea title is required");
    }
    const createdAt = this.stamp();
    const idea: Idea = {
      id: id(this.now(), slugify(title), this.counter++),
      projectId: input.projectId?.trim() || "personal",
      title,
      status: "open",
      priority: input.priority ?? "normal",
      tags: normalizeTags(input.tags),
      body: input.body ?? "",
      source: input.source,
      dueAt: input.dueAt,
      dueDate: input.dueAt ? undefined : input.dueDate,
      remindBeforeMinutes: input.remindBeforeMinutes,
      createdAt,
      updatedAt: createdAt,
    };
    this.ideas = [...this.ideas, idea];
    return copyIdea(idea);
  }

  async update(ideaId: string, patch: IdeaUpdateInput): Promise<Idea> {
    const current = this.find(ideaId);
    if (!current) {
      throw new Error(`unknown idea: ${ideaId}`);
    }
    const next: Idea = { ...current, tags: [...current.tags] };

    if (patch.title !== undefined) {
      const title = patch.title.trim().slice(0, IDEA_TITLE_MAX);
      if (title) {
        next.title = title;
      }
    }
    if (patch.projectId !== undefined && patch.projectId.trim()) {
      next.projectId = patch.projectId.trim();
    }
    if (patch.priority !== undefined) {
      next.priority = patch.priority;
    }
    if (patch.dueAt !== undefined) {
      next.dueAt = patch.dueAt ?? undefined;
      if (patch.dueAt) {
        next.dueDate = undefined;
      }
    }
    if (patch.dueDate !== undefined) {
      next.dueDate = patch.dueDate ?? undefined;
      if (patch.dueDate) {
        next.dueAt = undefined;
      }
    }
    if (patch.remindBeforeMinutes !== undefined) {
      next.remindBeforeMinutes =
        patch.remindBeforeMinutes && patch.remindBeforeMinutes > 0
          ? Math.trunc(patch.remindBeforeMinutes)
          : undefined;
    }
    if (patch.tags !== undefined) {
      next.tags = normalizeTags(patch.tags);
    }
    if (patch.body !== undefined) {
      next.body = patch.body;
    }
    if (patch.completionNote !== undefined) {
      next.completionNote = patch.completionNote ?? undefined;
    }
    if (patch.status !== undefined) {
      next.status = patch.status;
    }
    if (patch.status === "open" && patch.completionNote === undefined) {
      next.completionNote = undefined;
    }
    if (patch.completedAt !== undefined) {
      next.completedAt = patch.completedAt ?? undefined;
    } else if (patch.status === "done" && !next.completedAt) {
      next.completedAt = this.stamp();
    } else if (
      patch.status !== undefined &&
      patch.status !== "done" &&
      next.completedAt
    ) {
      next.completedAt = undefined;
    }
    next.updatedAt = this.stamp();
    this.ideas = this.ideas.map((idea) => (idea.id === ideaId ? next : idea));
    return copyIdea(next);
  }

  async trash(ideaId: string): Promise<Idea> {
    const current = this.find(ideaId);
    if (!current) {
      throw new Error(`unknown idea: ${ideaId}`);
    }
    this.ideas = this.ideas.filter((idea) => idea.id !== ideaId);
    this.trashed.set(ideaId, copyIdea(current));
    return copyIdea(current);
  }

  async restore(ideaId: string): Promise<Idea> {
    const item = this.trashed.get(ideaId);
    if (!item) {
      throw new Error(`idea is not in trash: ${ideaId}`);
    }
    this.trashed.delete(ideaId);
    if (!this.find(ideaId)) {
      this.ideas = [...this.ideas, copyIdea(item)];
    }
    return copyIdea(item);
  }
}

/** Convenience factory that hides the class from call sites. */
export function createFakeIdeasSource(
  options: FakeIdeasOptions = {},
): FakeIdeasSource {
  return new FakeIdeasSource(options);
}
