import { apiClient, toApiError } from "@/shared/api/client";
import type { components } from "@/shared/api/generated/schema";
import {
  asArray,
  asBoolean,
  asEnum,
  asNumber,
  asObject,
  asOptionalEnum,
  asOptionalNumber,
  asOptionalString,
  asOptionalTimestamp,
  asString,
} from "@/shared/api/validate";
import {
  IDEA_PRIORITIES,
  IDEA_REMIND_MAX,
  IDEA_SOURCE_TYPES,
  IDEA_STATUSES,
  type Idea,
  type IdeaCreateInput,
  type IdeaFilter,
  type IdeaListResult,
  type IdeaProblem,
  type IdeaProjectSource,
  type IdeasSource,
  type IdeaSourceRef,
  type IdeaUpdateInput,
} from "../model/types";

type IdeaRow = components["schemas"]["Idea"];
type IdeaCreateBody = components["schemas"]["IdeaCreate"];
type IdeaPatchBody = components["schemas"]["IdeaPatch"];

export interface IdeaIcalRequest {
  /** A registered project id; omitted exports every project. */
  projectId?: string;
  /** Done ideas stay out of the calendar by default. */
  includeDone?: boolean;
  /** Transient search, mirroring the list `q` filter. */
  query?: string;
  /** Exact case-insensitive AND filter; the route also accepts `tag`. */
  tags?: readonly string[];
}

export interface IdeaBriefRequest {
  projectId?: string;
  scope?: "current" | "all";
  max?: number;
}

export interface IdeaBrief {
  text: string;
  ideas: Idea[];
  open: number;
  dueToday: number;
  muted: boolean;
}

/** The write response also reports where the engine resolved the project. */
export interface IdeaWriteResult {
  idea: Idea;
  projectSource?: IdeaProjectSource;
}

/**
 * Full local API surface for ideas. `IdeasSource` is the UI contract; the
 * extra readers and named transitions are used by the adapter tests, the
 * export feature and WS8-friendly call sites without duplicating status logic.
 */
export interface IdeasApi extends IdeasSource {
  createWithSource(input: IdeaCreateInput): Promise<IdeaWriteResult>;
  update(
    id: string,
    patch: IdeaUpdateInput,
    expectedUpdatedAt?: string,
  ): Promise<Idea>;
  updateWithSource(
    id: string,
    patch: IdeaUpdateInput,
    expectedUpdatedAt?: string,
  ): Promise<IdeaWriteResult>;
  done(id: string): Promise<Idea>;
  reopen(id: string): Promise<Idea>;
  drop(id: string): Promise<Idea>;
  brief(request?: IdeaBriefRequest): Promise<IdeaBrief>;
  ical(request?: IdeaIcalRequest): Promise<string>;
}

export function parseIdeaList(value: unknown, what = "ideas"): IdeaListResult {
  const page = asObject(value, what);
  const total = asOptionalNumber(page.total, `${what}.total`);
  const projectSource = readProjectSource(
    page.project_source,
    `${what}.project_source`,
  );
  return {
    ideas: asArray(page.ideas, `${what}.ideas`, (item, where) =>
      parseIdea(item, where),
    ),
    problems: asArray(
      page.problems === undefined || page.problems === null ? [] : page.problems,
      `${what}.problems`,
      parseIdeaProblem,
    ),
    ...(total === undefined ? {} : { total }),
    ...(projectSource === undefined ? {} : { projectSource }),
  };
}

/** One row, list or detail, mapped to the WS6 camelCase entity. */
export function parseIdea(value: unknown, what = "idea"): Idea {
  try {
    const row = asObject(value, what) as unknown as IdeaRow;
    const dueAt = asOptionalTimestamp(row.due_at, `${what}.due_at`);
    const dueDate = readDateKey(row.due_date, `${what}.due_date`);
    if (dueAt && dueDate) {
      throw new Error(`${what} cannot carry both due_at and due_date`);
    }
    const remind = asOptionalNumber(
      row.remind_before_minutes,
      `${what}.remind_before_minutes`,
    );
    if (
      remind !== undefined &&
      (!Number.isInteger(remind) || remind < 0 || remind > IDEA_REMIND_MAX)
    ) {
      throw new Error(
        `${what}.remind_before_minutes must be 0..${IDEA_REMIND_MAX}`,
      );
    }
    const source = parseIdeaSource(row.source, `${what}.source`);
    const completedAt = asOptionalTimestamp(
      row.completed_at,
      `${what}.completed_at`,
    );
    const rawCompletionNote = asOptionalString(
      row.completion_note,
      `${what}.completion_note`,
    );
    const completionNote = rawCompletionNote?.trim()
      ? rawCompletionNote
      : undefined;
    return {
      id: asString(row.id, `${what}.id`),
      projectId: asString(row.project_id, `${what}.project_id`),
      title: asString(row.title, `${what}.title`),
      status: asEnum(row.status, IDEA_STATUSES, `${what}.status`),
      priority:
        asOptionalEnum(row.priority, IDEA_PRIORITIES, `${what}.priority`) ??
        "normal",
      ...(dueAt === undefined ? {} : { dueAt }),
      ...(dueDate === undefined ? {} : { dueDate }),
      ...(remind === undefined ? {} : { remindBeforeMinutes: remind }),
      tags: asArray(row.tags, `${what}.tags`, asString),
      body: asOptionalString(row.body, `${what}.body`) ?? "",
      ...(source === undefined ? {} : { source }),
      ...(completedAt === undefined ? {} : { completedAt }),
      ...(completionNote === undefined ? {} : { completionNote }),
      createdAt: asOptionalTimestamp(row.created_at, `${what}.created_at`) ?? "",
      updatedAt: asOptionalTimestamp(row.updated_at, `${what}.updated_at`) ?? "",
    };
  } catch (cause) {
    throw new Error(
      `local API returned an invalid idea: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }
}

export function parseIdeaProblem(value: unknown, what: string): IdeaProblem {
  const row = asObject(value, what);
  if (row.kind !== undefined && row.kind !== null) {
    asEnum(row.kind, ["idea"] as const, `${what}.kind`);
  }
  return {
    path: asString(row.path, `${what}.path`),
    reason: asString(row.reason, `${what}.reason`),
  };
}

/** Maps the camelCase create input to the wire body. */
export function ideaCreateBody(input: IdeaCreateInput): IdeaCreateBody {
  return {
    title: input.title,
    body: input.body,
    project: input.projectId,
    priority: input.priority,
    // The contract keeps due_at and due_date mutually exclusive; a timed due
    // wins when a caller accidentally sets both.
    due_at: input.dueAt,
    due_date: input.dueAt ? undefined : input.dueDate,
    remind_before_minutes: input.remindBeforeMinutes,
    tags: input.tags,
    source: input.source,
    completion_note: input.completionNote,
  };
}

/**
 * The optional part of the PATCH body. The generated schema marks the three
 * `clear_*` defaults as required, so the request adds them explicitly after
 * this builder has decided which ones are meaningful.
 */
export type IdeaPatchInput = Omit<
  IdeaPatchBody,
  "clear_due" | "clear_reminder" | "clear_tags"
> & {
  clear_due?: boolean;
  clear_reminder?: boolean;
  clear_tags?: boolean;
};

/**
 * Maps the WS6 patch to the wire body. `null` clear signals become the API's
 * explicit `clear_*` flags; an empty tag list means `clear_tags`. The
 * completion note is writable, but a `null` clear travels as an empty string
 * because the nullable wire field cannot distinguish a clear from an omitted
 * value. The completion instant stays owned by the status transition.
 */
export function ideaPatchBody(patch: IdeaUpdateInput): IdeaPatchInput {
  const body: IdeaPatchInput = {};
  if (patch.title !== undefined) {
    body.title = patch.title;
  }
  if (patch.projectId !== undefined) {
    body.project = patch.projectId;
  }
  if (patch.status !== undefined) {
    body.status = patch.status;
  }
  if (patch.priority !== undefined) {
    body.priority = patch.priority;
  }

  if (typeof patch.dueAt === "string") {
    body.due_at = patch.dueAt;
  } else if (typeof patch.dueDate === "string") {
    body.due_date = patch.dueDate;
  } else if (patch.dueAt === null || patch.dueDate === null) {
    body.clear_due = true;
  }

  if (patch.remindBeforeMinutes === null) {
    body.clear_reminder = true;
  } else if (patch.remindBeforeMinutes !== undefined) {
    body.remind_before_minutes = patch.remindBeforeMinutes;
  }

  if (patch.tags !== undefined) {
    if (patch.tags.length === 0) {
      body.clear_tags = true;
    } else {
      body.tags = [...patch.tags];
    }
  }
  if (patch.body !== undefined) {
    body.body = patch.body;
  }
  if (patch.completionNote !== undefined) {
    body.completion_note = patch.completionNote ?? "";
  }
  return body;
}

/** Query for `GET /v1/ideas`; statuses and tags are comma-separated. */
export function ideaListQuery(filter: IdeaFilter): {
  project?: string;
  status?: string;
  due_before?: string;
  due_after?: string;
  q?: string;
  limit?: number;
} {
  return {
    project: filter.projectId,
    status: filter.statuses?.length ? filter.statuses.join(",") : undefined,
    due_before: filter.dueBefore,
    due_after: filter.dueAfter,
    q: filter.query,
    limit: filter.limit,
  };
}

export function ideaBriefQuery(request: IdeaBriefRequest = {}): {
  project?: string;
  scope?: "current" | "all";
  max?: number;
} {
  return {
    project: request.projectId,
    scope: request.scope,
    max: request.max,
  };
}

export function ideaIcalQuery(request: IdeaIcalRequest = {}): {
  project?: string;
  include_done?: boolean;
  tags?: string;
  q?: string;
} {
  const query = request.query?.trim();
  return {
    project: request.projectId,
    include_done: request.includeDone === true ? true : undefined,
    tags: request.tags?.length ? request.tags.join(",") : undefined,
    q: query ? query : undefined,
  };
}

export function parseIdeaBrief(value: unknown): IdeaBrief {
  const brief = asObject(value, "idea brief");
  return {
    text: asString(brief.text, "idea brief.text"),
    ideas: asArray(brief.ideas, "idea brief.ideas", (item, where) =>
      parseIdea(item, where),
    ),
    open: asNumber(brief.open, "idea brief.open"),
    dueToday: asNumber(brief.due_today, "idea brief.due_today"),
    muted: asBoolean(brief.muted, "idea brief.muted"),
  };
}

export async function listIdeas(filter: IdeaFilter): Promise<IdeaListResult> {
  const { data, error, response } = await apiClient.GET("/v1/ideas", {
    params: { query: ideaListQuery(filter) },
  });
  if (error) {
    throw toApiError(response, error);
  }
  if (!data) {
    throw new Error("local API returned an empty ideas response");
  }
  return parseIdeaList(data);
}

export async function getIdea(id: string): Promise<Idea> {
  const { data, error, response } = await apiClient.GET("/v1/ideas/{id}", {
    params: { path: { id } },
  });
  if (error) {
    throw toApiError(response, error);
  }
  if (!data) {
    throw new Error("local API returned an empty idea response");
  }
  return parseIdea(data.idea);
}

export async function createIdea(
  input: IdeaCreateInput,
): Promise<IdeaWriteResult> {
  const { data, error, response } = await apiClient.POST("/v1/ideas", {
    body: ideaCreateBody(input),
  });
  if (error) {
    throw toApiError(response, error);
  }
  if (!data) {
    throw new Error("local API returned an empty idea response");
  }
  return {
    idea: parseIdea(data.idea),
    ...(data.project_source === undefined
      ? {}
      : { projectSource: data.project_source }),
  };
}

export async function updateIdea(
  id: string,
  patch: IdeaUpdateInput,
  expectedUpdatedAt?: string,
): Promise<IdeaWriteResult> {
  const body = ideaPatchBody(patch);
  if (Object.keys(body).length === 0) {
    // The API rejects an empty patch. `completedAt` is read-only (the status
    // transition owns the instant), so a patch that only carries it is empty.
    throw new Error("the idea patch has no writable fields");
  }
  if (expectedUpdatedAt) {
    body.expected_updated_at = expectedUpdatedAt;
  }
  const { data, error, response } = await apiClient.PATCH("/v1/ideas/{id}", {
    params: { path: { id } },
    body: {
      clear_due: false,
      clear_reminder: false,
      clear_tags: false,
      ...body,
    },
  });
  if (error) {
    throw toApiError(response, error);
  }
  if (!data) {
    throw new Error("local API returned an empty idea response");
  }
  return {
    idea: parseIdea(data.idea),
    ...(data.project_source === undefined
      ? {}
      : { projectSource: data.project_source }),
  };
}

/**
 * Soft delete. The route answers with only `{id, trashed}`, so read the row
 * first to keep the undo notice and `lastTrashed` complete.
 */
export async function trashIdea(id: string): Promise<Idea> {
  const current = await getIdea(id);
  const { data, error, response } = await apiClient.DELETE("/v1/ideas/{id}", {
    params: { path: { id } },
  });
  if (error) {
    throw toApiError(response, error);
  }
  if (!data?.trashed) {
    throw new Error(`local API did not trash idea ${id}`);
  }
  return current;
}

export async function restoreIdea(id: string): Promise<Idea> {
  const { data, error, response } = await apiClient.POST(
    "/v1/ideas/{id}/restore",
    { params: { path: { id } } },
  );
  if (error) {
    throw toApiError(response, error);
  }
  if (!data) {
    throw new Error("local API returned an empty idea response");
  }
  return parseIdea(data.idea);
}

export async function ideaBrief(
  request: IdeaBriefRequest = {},
): Promise<IdeaBrief> {
  const { data, error, response } = await apiClient.GET("/v1/ideas/brief", {
    params: { query: ideaBriefQuery(request) },
  });
  if (error) {
    throw toApiError(response, error);
  }
  if (!data) {
    throw new Error("local API returned an empty idea brief");
  }
  return parseIdeaBrief(data);
}

export async function ideaIcal(
  request: IdeaIcalRequest = {},
): Promise<string> {
  const { data, error, response } = await apiClient.GET("/v1/ideas/ical", {
    params: { query: ideaIcalQuery(request) },
    parseAs: "text",
  });
  if (error) {
    throw toApiError(response, error);
  }
  return data ?? "";
}

/**
 * The real `IdeasSource`. The store still receives it explicitly in
 * `RootStore`, so tests and stories can inject the fake instead.
 */
export const ideasApi: IdeasApi = {
  list: listIdeas,
  get: getIdea,
  create: async (input) => (await createIdea(input)).idea,
  createWithSource: createIdea,
  update: async (id, patch, expectedUpdatedAt) =>
    (await updateIdea(id, patch, expectedUpdatedAt)).idea,
  updateWithSource: updateIdea,
  done: async (id) => (await updateIdea(id, { status: "done" })).idea,
  reopen: async (id) => (await updateIdea(id, { status: "open" })).idea,
  drop: async (id) => (await updateIdea(id, { status: "dropped" })).idea,
  trash: trashIdea,
  restore: restoreIdea,
  brief: ideaBrief,
  ical: ideaIcal,
};

const PROJECT_SOURCES: readonly IdeaProjectSource[] = [
  "explicit",
  "cwd",
  "default",
];

function readProjectSource(
  value: unknown,
  what: string,
): IdeaProjectSource | undefined {
  return asOptionalEnum(value, PROJECT_SOURCES, what);
}

function parseIdeaSource(
  value: unknown,
  what: string,
): IdeaSourceRef | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const source = asObject(value, what);
  const id = asOptionalString(source.id, `${what}.id`);
  const harness = asOptionalString(source.harness, `${what}.harness`);
  return {
    type: asEnum(source.type, IDEA_SOURCE_TYPES, `${what}.type`),
    ...(id === undefined ? {} : { id }),
    ...(harness === undefined ? {} : { harness }),
  };
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** All-day dates are local calendar keys and never shift with a zone. */
function readDateKey(value: unknown, what: string): string | undefined {
  const text = asOptionalString(value, what);
  if (text === undefined) {
    return undefined;
  }
  const match = DATE_KEY.exec(text);
  if (!match) {
    throw new Error(`${what} must be a YYYY-MM-DD date`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`${what} must be a real calendar date`);
  }
  return text;
}
