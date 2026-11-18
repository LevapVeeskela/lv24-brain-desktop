import { apiClient, toApiError } from "@/shared/api/client";
import {
  asArray,
  asBoolean,
  asEnum,
  asNumber,
  asObject,
  asOptionalBoolean,
  asOptionalString,
  asOptionalTimestamp,
  asString,
  asStringMap,
} from "@/shared/api/validate";
import { PROVENANCE_ORIGINS, TRUST_LEVELS, type Provenance } from "@/entities/memory/model/types";
import {
  PATH_OWNERSHIP_STATES,
  type AdoptReport,
  type PathOwnership,
  type Project,
  type ProjectOwnership,
  type ProjectState,
  type ProjectStatePatch,
  type StateReviewRequest,
} from "../model/types";

export interface ProjectsSource {
  list(): Promise<Project[]>;
  state(projectId: string): Promise<ProjectState>;
  saveState(
    projectId: string,
    patch: ProjectStatePatch,
    expectedRevision?: string,
  ): Promise<ProjectState>;
  reviewState(
    projectId: string,
    request: StateReviewRequest,
  ): Promise<ProjectState>;
  /** Dry run when apply=false; the report then lists what apply would stamp. */
  adopt(apply: boolean): Promise<AdoptReport>;
  addPath(projectId: string, path: string): Promise<Project>;
}

export const projectApi: ProjectsSource = {
  async list(): Promise<Project[]> {
    const { data, error, response } = await apiClient.GET("/v1/projects");
    if (error) {
      throw toApiError(response, error);
    }
    return parseProjects(data);
  },

  async state(projectId: string): Promise<ProjectState> {
    const { data, error, response } = await apiClient.GET(
      "/v1/projects/{id}/state",
      { params: { path: { id: projectId } } },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseProjectState(data);
  },

  async saveState(
    projectId: string,
    patch: ProjectStatePatch,
    expectedRevision?: string,
  ): Promise<ProjectState> {
    const { data, error, response } = await apiClient.PUT(
      "/v1/projects/{id}/state",
      {
        params: { path: { id: projectId } },
        body: {
          goal: patch.goal,
          next_action: patch.nextAction,
          active: patch.active,
          blocked: patch.blocked,
          open_questions: patch.openQuestions,
          fresh_until: patch.freshUntil,
          expected_revision: expectedRevision,
        },
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseProjectState(data);
  },

  async reviewState(
    projectId: string,
    request: StateReviewRequest,
  ): Promise<ProjectState> {
    const { data, error, response } = await apiClient.POST(
      "/v1/projects/{id}/state/review",
      {
        params: { path: { id: projectId } },
        body: {
          reviewed: true,
          trust: request.trust,
          expected_revision: request.expectedRevision,
        },
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseProjectState(data);
  },

  async adopt(apply: boolean): Promise<AdoptReport> {
    const { data, error, response } = await apiClient.POST(
      "/v1/projects/adopt",
      { body: jsonBody({ apply }) },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseAdoptReport(data);
  },

  async addPath(projectId: string, path: string): Promise<Project> {
    const { data, error, response } = await apiClient.POST(
      "/v1/projects/{id}/paths",
      {
        params: { path: { id: projectId } },
        body: jsonBody({ path }),
      },
    );
    if (error) {
      throw toApiError(response, error);
    }
    return parseProject(data, "project");
  },
};

/**
 * Some frozen routes document an open JSON object, which openapi-typescript
 * renders as an empty record. The adapters still send a typed object.
 */
function jsonBody(body: Record<string, unknown>): Record<string, never> {
  return body as unknown as Record<string, never>;
}

export function parseProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) {
    throw new Error("local API returned a non-array projects response");
  }
  return value.map((item, index) => parseProject(item, `projects[${index}]`));
}

export function parseProject(value: unknown, what = "project"): Project {
  try {
    const project = asObject(value, what);
    const rawProvenance = project.path_provenance;
    const pathProvenance =
      rawProvenance === undefined || rawProvenance === null
        ? {}
        : asStringMap(rawProvenance, `${what}.path_provenance`);
    return {
      id: asString(project.id, `${what}.id`),
      name: asString(project.name, `${what}.name`),
      paths:
        project.paths === undefined || project.paths === null
          ? []
          : asArray(project.paths, `${what}.paths`, asString),
      pathProvenance,
    };
  } catch (cause) {
    throw new Error(
      `local API returned an invalid project: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }
}

export function parseAdoptReport(value: unknown): AdoptReport {
  const report = asObject(value, "adopt report");
  return {
    machine: asString(report.machine, "adopt.machine"),
    applied: asBoolean(report.applied, "adopt.applied"),
    stamped: asNumber(report.stamped, "adopt.stamped"),
    owned: asNumber(report.owned, "adopt.owned"),
    missing: asNumber(report.missing, "adopt.missing"),
    projects: asArray(
      report.projects,
      "adopt.projects",
      parseProjectOwnership,
    ),
  };
}

function parseProjectOwnership(value: unknown, what: string): ProjectOwnership {
  const project = asObject(value, what);
  return {
    projectId: asString(project.project_id, `${what}.project_id`),
    paths: asArray(project.paths, `${what}.paths`, parsePathOwnership),
  };
}

function parsePathOwnership(value: unknown, what: string): PathOwnership {
  const path = asObject(value, what);
  return {
    path: asString(path.path, `${what}.path`),
    machine: asOptionalString(path.machine, `${what}.machine`),
    state: asEnum(path.state, PATH_OWNERSHIP_STATES, `${what}.state`),
  };
}

export function parseProjectState(value: unknown): ProjectState {
  const state = asObject(value, "state");
  return {
    projectId: asString(state.project_id, "state.project_id"),
    goal: asOptionalString(state.goal, "state.goal") ?? "",
    nextAction: asOptionalString(state.next_action, "state.next_action") ?? "",
    active: readStringList(state.active, "state.active"),
    blocked: readStringList(state.blocked, "state.blocked"),
    openQuestions: readStringList(
      state.open_questions,
      "state.open_questions",
    ),
    updatedAt: asOptionalTimestamp(state.updated_at, "state.updated_at"),
    freshUntil: asOptionalTimestamp(state.fresh_until, "state.fresh_until"),
    revision: asString(state.revision, "state.revision"),
    provenance: parseProvenance(
      state.provenance,
      "state.provenance",
    ),
  };
}

function parseProvenance(
  value: unknown,
  what: string,
): Provenance {
  const provenance = asObject(value, what);
  return {
    origin: asEnum(provenance.origin, PROVENANCE_ORIGINS, `${what}.origin`),
    trust: asEnum(provenance.trust, TRUST_LEVELS, `${what}.trust`),
    reviewed: asOptionalBoolean(provenance.reviewed, `${what}.reviewed`) ?? false,
    quarantined: asOptionalBoolean(provenance.quarantined, `${what}.quarantined`) ?? false,
    needsReview: asOptionalBoolean(provenance.needs_review, `${what}.needs_review`) ?? false,
  };
}

function readStringList(value: unknown, what: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  return asArray(value, what, (item, where) => asString(item, where));
}
