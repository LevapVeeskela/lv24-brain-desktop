/**
 * Ideas contract. Mirrors `docs/spec-0.28-ideas.md` §5.1 in TypeScript naming:
 * the frontmatter `project_id`/`due_at`/`due_date`/`remind_before_minutes` map
 * to `projectId`/`dueAt`/`dueDate`/`remindBeforeMinutes` like the rest of the
 * desktop record types. WS7 replaces the fake source with the generated client.
 */

export const IDEA_STATUSES = [
  "open",
  "doing",
  "done",
  "dropped",
  "someday",
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_PRIORITIES = ["low", "normal", "high"] as const;
export type IdeaPriority = (typeof IDEA_PRIORITIES)[number];

export const IDEA_SOURCE_TYPES = [
  "session",
  "note",
  "decision",
  "commit",
  "manual",
  "desktop",
] as const;
export type IdeaSourceType = (typeof IDEA_SOURCE_TYPES)[number];

/** Statuses that still count as open in the list, the rail and the brief. */
export const OPEN_IDEA_STATUSES: readonly IdeaStatus[] = ["open", "doing"];

export function isOpenIdeaStatus(status: IdeaStatus): boolean {
  return OPEN_IDEA_STATUSES.includes(status);
}

export function isClosedIdeaStatus(status: IdeaStatus): boolean {
  return status === "done" || status === "dropped";
}

/** Idea-specific source value object; looser than the strict domain SourceRef. */
export interface IdeaSourceRef {
  type: IdeaSourceType;
  /** May be empty for `manual`/`desktop` captures. */
  id?: string;
  /** Agent harness that captured the idea, for example `opencode`. */
  harness?: string;
}

export interface Idea {
  id: string;
  projectId: string;
  title: string;
  status: IdeaStatus;
  priority: IdeaPriority;
  /** Timed due date: RFC3339 with an offset. Mutually exclusive with dueDate. */
  dueAt?: string;
  /** All-day due date: local calendar date, `YYYY-MM-DD`. */
  dueDate?: string;
  /** Concrete lead in minutes; absent or 0 means the due time only. */
  remindBeforeMinutes?: number;
  tags: string[];
  body: string;
  source?: IdeaSourceRef;
  completedAt?: string;
  completionNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaFilter {
  projectId?: string;
  statuses?: IdeaStatus[];
  dueBefore?: string;
  dueAfter?: string;
  query?: string;
  limit?: number;
}

/** An unreadable or conflicted file; the rest of the list stays usable. */
export interface IdeaProblem {
  path: string;
  reason: string;
}

export interface IdeaListResult {
  ideas: Idea[];
  problems: IdeaProblem[];
}

export interface IdeaCreateInput {
  title: string;
  projectId?: string;
  dueAt?: string;
  dueDate?: string;
  remindBeforeMinutes?: number;
  priority?: IdeaPriority;
  tags?: string[];
  body?: string;
  source?: IdeaSourceRef;
}

/**
 * Mutable idea fields. `null` clears an optional field; `undefined` leaves it
 * untouched. `dueAt` and `dueDate` stay mutually exclusive: setting one clears
 * the other.
 */
export interface IdeaUpdateInput {
  title?: string;
  projectId?: string;
  status?: IdeaStatus;
  priority?: IdeaPriority;
  dueAt?: string | null;
  dueDate?: string | null;
  remindBeforeMinutes?: number | null;
  tags?: string[];
  body?: string;
  completionNote?: string | null;
  completedAt?: string | null;
}

/** The injectable data source; the fake below and the real client share it. */
export interface IdeasSource {
  list(filter: IdeaFilter): Promise<IdeaListResult>;
  create(input: IdeaCreateInput): Promise<Idea>;
  update(id: string, patch: IdeaUpdateInput): Promise<Idea>;
  trash(id: string): Promise<Idea>;
  restore(id: string): Promise<Idea>;
}

export const IDEA_TITLE_MAX = 200;
export const IDEA_TAGS_MAX = 10;
