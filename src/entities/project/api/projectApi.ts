import { apiClient, toApiError } from "@/shared/api/client";
import {
  asArray,
  asEnum,
  asObject,
  asOptionalBoolean,
  asOptionalString,
  asOptionalTimestamp,
  asString,
} from "@/shared/api/validate";
import { PROVENANCE_ORIGINS, TRUST_LEVELS, type Provenance } from "@/entities/memory/model/types";
import type {
  Project,
  ProjectState,
  ProjectStatePatch,
  StateReviewRequest,
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
};

export function parseProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) {
    throw new Error("local API returned a non-array projects response");
  }
  return value.map((item, index) => {
    try {
      const project = asObject(item, `projects[${index}]`);
      return {
        id: asString(project.id, `projects[${index}].id`),
        name: asString(project.name, `projects[${index}].name`),
      };
    } catch (cause) {
      throw new Error(
        `local API returned an invalid project: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }
  });
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
