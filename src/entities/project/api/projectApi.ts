import { apiClient, toApiError } from "@/shared/api/client";
import {
  asArray,
  asObject,
  asOptionalString,
  asOptionalTimestamp,
  asString,
} from "@/shared/api/validate";
import type {
  Project,
  ProjectState,
  ProjectStatePatch,
} from "../model/types";

export interface ProjectsSource {
  list(): Promise<Project[]>;
  state(projectId: string): Promise<ProjectState>;
  saveState(
    projectId: string,
    patch: ProjectStatePatch,
    expectedRevision?: string,
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
  };
}

function readStringList(value: unknown, what: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  return asArray(value, what, (item, where) => asString(item, where));
}
